import express from "express";
import bcrypt from "bcrypt";
import { pool } from "../db.js";
import {
  AuthenticatedRequest,
  requireStaffAuth,
} from "../middleware/authMiddleware.js";
import { authRateLimit } from "../middleware/rateLimit.js";
import {
  clearSessionCookie,
  STAFF_COOKIE,
} from "../middleware/authCookies.js";
import { revokeSessionFromRequest } from "../services/accountSecurity.js";
import {
  createAccountSecurityRouter,
  finishPasswordSignIn,
  staffAdapter,
} from "./accountSecurityRoutes.js";

const router = express.Router();

// 5 wrong passwords per account per 15 minutes, and 30
// failed sign-ins from one IP address.
const staffLoginLimit = authRateLimit({
  name: "staff-login",
  windowMs: 15 * 60_000,
  maxPerAccount: 5,
  maxPerIp: 30,
});

router.post("/login", staffLoginLimit, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required.",
      });
    }

    const result = await pool.query(
      `
      SELECT
        su.staff_user_id,
        su.first_name,
        su.last_name,
        su.email,
        su.password_hash,
        su.role,
        su.doctor_id,
        su.is_active,
        d.is_active AS doctor_is_active,
        (
          EXISTS (
            SELECT 1
            FROM staff_portal_invites AS spi
            WHERE spi.staff_user_id = su.staff_user_id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM staff_portal_invites AS spi
            WHERE spi.staff_user_id = su.staff_user_id
              AND spi.used_at IS NOT NULL
          )
        ) AS invite_pending
      FROM staff_users AS su
      LEFT JOIN doctors AS d
        ON d.doctor_id = su.doctor_id
      WHERE LOWER(su.email) = LOWER($1)
      LIMIT 1
      `,
      [email],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const staff = result.rows[0];

    // Check the password first so the inactive message
    // does not reveal which emails have accounts.
    const passwordMatches = await bcrypt.compare(
      password,
      staff.password_hash,
    );

    // An account still waiting on its email invite has
    // never had a password chosen (it holds a random
    // hash), so it answers like any wrong password.
    if (!passwordMatches || staff.invite_pending) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    if (
      !staff.is_active ||
      (staff.doctor_id !== null &&
        staff.doctor_is_active === false)
    ) {
      return res.status(403).json({
        message: "This staff account is inactive.",
      });
    }

    /*
     * Password accepted. Second step: an emailed code,
     * unless this browser is a trusted device.
     */
    const account = await staffAdapter.loadById(
      staff.staff_user_id,
    );

    if (!account) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    return finishPasswordSignIn(
      staffAdapter,
      account,
      req,
      res,
    );
  } catch (error) {
    console.error("Staff login error:", error);

    return res.status(500).json({
      message: "Unable to log in.",
    });
  }
});

/*
 * POST /api/auth/logout
 *
 * Clears the staff/doctor session cookie.
 */
router.post("/logout", async (req, res) => {
  // Close the session itself, not only the cookie.
  await revokeSessionFromRequest("staff", req).catch(
    (error) => console.error("Sign-out error:", error),
  );

  clearSessionCookie(res, STAFF_COOKIE);

  return res.json({
    message: "Signed out.",
  });
});

router.get(
  "/me",
  requireStaffAuth,
  async (
    req: AuthenticatedRequest,
    res,
  ) => {
    try {
      const staffUserId =
        req.staff?.staffUserId;

      if (!staffUserId) {
        return res.status(401).json({
          message: "Authentication required.",
        });
      }

      const result = await pool.query(
        `
        SELECT
          staff_user_id,
          first_name,
          last_name,
          email,
          role,
          doctor_id,
          is_active
        FROM staff_users
        WHERE staff_user_id = $1
        LIMIT 1
        `,
        [staffUserId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Staff account not found.",
        });
      }

      const staff = result.rows[0];

      if (!staff.is_active) {
        return res.status(403).json({
          message: "Staff account is inactive.",
        });
      }

      return res.json({
        staff: {
          staff_user_id: staff.staff_user_id,
          first_name: staff.first_name,
          last_name: staff.last_name,
          email: staff.email,
          role: staff.role,
          doctor_id: staff.doctor_id,
        },
      });
    } catch (error) {
      console.error(
        "Get current staff error:",
        error,
      );

      return res.status(500).json({
        message: "Unable to load staff account.",
      });
    }
  },
);

// /login/verify, /forgot-password, /change-password...
router.use(createAccountSecurityRouter(staffAdapter));

export default router;