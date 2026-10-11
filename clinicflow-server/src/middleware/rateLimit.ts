import type {
  NextFunction,
  Request,
  Response,
} from "express";

/*
 * Small in-memory rate limiter for authentication routes.
 *
 * Three counters are kept per window:
 * - per IP address + email: stops password guessing
 *   against one account
 * - per email from ANY address (a higher limit): stops
 *   guessing one account from many computers
 * - per IP address: stops one machine trying many
 *   accounts
 *
 * Every attempt is counted as soon as it arrives, so a
 * burst of parallel requests cannot all get in before the
 * first failures are recorded. Attempts that turn out not
 * to be failures are then given back: a successful
 * response (2xx) clears the account counters, so a user
 * who mistypes once and then signs in starts fresh.
 *
 * Counters live in this process's memory, so they reset
 * when the server restarts. That is fine for a single
 * server; a multi-server deployment would need a shared
 * store such as Redis.
 */

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  name: string;
  windowMs: number;
  maxPerAccount: number;
  maxPerIp: number;
  // Limit for one account across all IP addresses.
  // Defaults to 4x maxPerAccount.
  maxPerAccountAllIps?: number;
  // Request body field that identifies the account.
  accountField?: string;
  // Response codes that count as a failed attempt.
  failureStatuses?: number[];
  // Count every request, not only failures (for
  // endpoints that always answer 200, like resend).
  countAllAttempts?: boolean;
};

const DEFAULT_FAILURE_STATUSES = [
  401, 403, 404, 409,
];

export function authRateLimit({
  name,
  windowMs,
  maxPerAccount,
  maxPerIp,
  maxPerAccountAllIps = maxPerAccount * 4,
  accountField = "email",
  failureStatuses = DEFAULT_FAILURE_STATUSES,
  countAllAttempts = false,
}: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  // Drop expired buckets so memory does not grow forever.
  setInterval(() => {
    const now = Date.now();

    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }, windowMs).unref();

  function getBucket(key: string, now: number) {
    const existing = buckets.get(key);

    if (existing && existing.resetAt > now) {
      return existing;
    }

    const fresh = {
      count: 0,
      resetAt: now + windowMs,
    };

    buckets.set(key, fresh);

    return fresh;
  }

  return (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    const now = Date.now();

    const ip = req.ip ?? "unknown";

    const rawAccount =
      req.body?.[accountField];

    const account =
      typeof rawAccount === "string"
        ? rawAccount.trim().toLowerCase()
        : "";

    const ipKey = `${name}:ip:${ip}`;
    const accountKey = `${name}:acct:${ip}:${account}`;
    const globalAccountKey = `${name}:acct-all:${account}`;

    const ipBucket = getBucket(ipKey, now);
    const accountBucket = getBucket(accountKey, now);

    // No account given: the IP counters still apply.
    const globalAccountBucket = account
      ? getBucket(globalAccountKey, now)
      : null;

    const blockedUntil = [
      ipBucket.count >= maxPerIp ? ipBucket.resetAt : 0,
      accountBucket.count >= maxPerAccount
        ? accountBucket.resetAt
        : 0,
      globalAccountBucket &&
      globalAccountBucket.count >= maxPerAccountAllIps
        ? globalAccountBucket.resetAt
        : 0,
    ];

    if (blockedUntil.some((until) => until > 0)) {
      const retryAfterSeconds = Math.ceil(
        (Math.max(...blockedUntil) - now) / 1000,
      );

      res.setHeader(
        "Retry-After",
        String(retryAfterSeconds),
      );

      return res.status(429).json({
        message: `Too many attempts. Please try again in ${Math.ceil(
          retryAfterSeconds / 60,
        )} minute(s).`,
      });
    }

    // Count the attempt now (see above).
    ipBucket.count += 1;
    accountBucket.count += 1;

    if (globalAccountBucket) {
      globalAccountBucket.count += 1;
    }

    const giveBack = () => {
      ipBucket.count = Math.max(0, ipBucket.count - 1);
      accountBucket.count = Math.max(0, accountBucket.count - 1);

      if (globalAccountBucket) {
        globalAccountBucket.count = Math.max(
          0,
          globalAccountBucket.count - 1,
        );
      }
    };

    let settled = false;

    const settle = () => {
      if (settled || countAllAttempts) {
        settled = true;
        return;
      }

      settled = true;

      if (
        res.statusCode >= 200 &&
        res.statusCode < 300
      ) {
        giveBack();
        buckets.delete(accountKey);
        buckets.delete(globalAccountKey);
        return;
      }

      // Server errors (5xx) and malformed requests are
      // not guessing attempts.
      if (!failureStatuses.includes(res.statusCode)) {
        giveBack();
      }
    };

    res.on("finish", settle);

    // Client hung up before an answer: not a failure.
    res.on("close", () => {
      if (!res.writableFinished && !settled) {
        settled = true;

        if (!countAllAttempts) {
          giveBack();
        }
      }
    });

    next();
  };
}
