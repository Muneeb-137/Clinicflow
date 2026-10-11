import express from "express";
import bcrypt from "bcrypt";
import type { PoolClient } from "pg";
import { pool } from "../db.js";
import crypto from "crypto";
import {
  sendDoctorInviteEmail,
  sendStaffInviteEmail,
} from "../services/emailService.js";


import {
  AuthenticatedRequest,
  requireStaffAuth,
} from "../middleware/authMiddleware.js";

import {
  requireRole,
} from "../middleware/requireRole.js";


const router = express.Router();

/* =========================================================
   STAFF LOGINS (staff_users)

   Admins and receptionists are the staff_users rows with
   role admin / receptionist. Doctors are listed from the
   doctors table instead; their logins are linked by
   doctor_id and created through the doctor portal invite.

   A new admin / receptionist gets an unusable random
   password hash and an email invite. The account is
   "invite pending" while it has invites but none has been
   used. Accounts with no invites at all (created before
   invites existed) are normal active logins.
========================================================= */

const STAFF_LOGIN_ROLES = [
  "admin",
  "receptionist",
] as const;

type StaffLoginRole =
  (typeof STAFF_LOGIN_ROLES)[number];

function isStaffLoginRole(
  role: unknown,
): role is StaffLoginRole {
  return (
    typeof role === "string" &&
    (STAFF_LOGIN_ROLES as readonly string[]).includes(
      role,
    )
  );
}

const EMAIL_PATTERN =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INVITE_LIFETIME_MS =
  24 * 60 * 60 * 1000;

// Expects the staff_users alias "su".
const INVITE_PENDING_SQL = `
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
  )
`;

// Directory row for one staff login. Expects alias "su".
const STAFF_ROW_SQL = `
  su.staff_user_id AS id,
  su.role,

  su.first_name,
  su.last_name,

  NULL::VARCHAR AS specialty,

  su.email,
  su.phone,

  su.is_active,

  NULL::VARCHAR AS provider_status,
  NULL::VARCHAR AS status_reason,
  NULL::TIMESTAMP AS status_updated_at,

  'staff'::VARCHAR AS staff_type,

  ${INVITE_PENDING_SQL} AS invite_pending,

  (
    SELECT MAX(spi.expires_at)
    FROM staff_portal_invites AS spi
    WHERE spi.staff_user_id = su.staff_user_id
      AND spi.used_at IS NULL
  ) AS invite_expires_at
`;

function getStaffRoleLabel(
  role: StaffLoginRole,
) {
  return role === "admin"
    ? "an administrator"
    : "a receptionist";
}

async function loadStaffRow(
  client: PoolClient,
  staffUserId: number,
) {
  const result = await client.query(
    `
      SELECT ${STAFF_ROW_SQL}
      FROM staff_users AS su
      WHERE su.staff_user_id = $1
      LIMIT 1;
    `,
    [staffUserId],
  );

  return result.rows[0] ?? null;
}

/*
 * Locks the target staff login (admin / receptionist
 * only) and reports whether it is pending an invite.
 */
async function lockStaffLogin(
  client: PoolClient,
  staffUserId: number,
) {
  const result = await client.query<{
    staff_user_id: number;
    first_name: string;
    last_name: string;
    email: string;
    role: string;
    is_active: boolean;
    invite_pending: boolean;
  }>(
    `
      SELECT
        su.staff_user_id,
        su.first_name,
        su.last_name,
        su.email,
        su.role,
        su.is_active,
        ${INVITE_PENDING_SQL} AS invite_pending
      FROM staff_users AS su
      WHERE su.staff_user_id = $1
        AND su.role IN ('admin', 'receptionist')
      LIMIT 1
      FOR UPDATE OF su;
    `,
    [staffUserId],
  );

  return result.rows[0] ?? null;
}

/*
 * Counts the other admins who can actually sign in
 * (active and not waiting on an invite). The rows are
 * locked so two admins cannot demote / archive each other
 * at the same moment and leave the clinic with none.
 */
async function countOtherUsableAdmins(
  client: PoolClient,
  staffUserId: number,
) {
  const result = await client.query(
    `
      SELECT su.staff_user_id
      FROM staff_users AS su
      WHERE su.role = 'admin'
        AND su.is_active = TRUE
        AND su.staff_user_id <> $1
        AND NOT ${INVITE_PENDING_SQL}
      FOR UPDATE OF su;
    `,
    [staffUserId],
  );

  return result.rowCount ?? 0;
}

async function emailInUse(
  client: PoolClient,
  email: string,
  excludeStaffUserId: number | null,
) {
  const result = await client.query(
    `
      SELECT staff_user_id
      FROM staff_users
      WHERE LOWER(email) = LOWER($1)
        AND ($2::INTEGER IS NULL OR staff_user_id <> $2)
      LIMIT 1;
    `,
    [email, excludeStaffUserId],
  );

  return result.rows.length > 0;
}

/*
 * Replaces any unused invite for this login with a new
 * one. Only the sha256 of the token is stored.
 */
async function createStaffInvite(
  client: PoolClient,
  staffUserId: number,
  email: string,
) {
  const rawToken = crypto
    .randomBytes(32)
    .toString("hex");

  const tokenHash = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");

  const expiresAt = new Date(
    Date.now() + INVITE_LIFETIME_MS,
  );

  await client.query(
    `
      DELETE FROM staff_portal_invites
      WHERE staff_user_id = $1
        AND used_at IS NULL;
    `,
    [staffUserId],
  );

  await client.query(
    `
      INSERT INTO staff_portal_invites (
        staff_user_id,
        email,
        token_hash,
        expires_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4
      );
    `,
    [
      staffUserId,
      email,
      tokenHash,
      expiresAt,
    ],
  );

  return {
    rawToken,
    expiresAt,
  };
}

async function trySendStaffInvite(
  email: string,
  firstName: string,
  role: StaffLoginRole,
  rawToken: string,
) {
  try {
    await sendStaffInviteEmail(
      email,
      firstName,
      getStaffRoleLabel(role),
      rawToken,
    );

    return true;
  } catch (emailError) {
    console.error(
      "Staff invite email failed:",
      emailError,
    );

    return false;
  }
}

function isUniqueViolation(
  error: unknown,
) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code ===
      "23505"
  );
}

/* =========================================================
   GET STAFF DIRECTORY
========================================================= */

router.get(
  "/",
  requireStaffAuth,
  // The Staff Directory is an admin page.
  requireRole("admin"),
  async (_req, res) => {
    try {
      const result = await pool.query(`
        SELECT *
        FROM (
          SELECT
            d.doctor_id AS id,
            'physician'::VARCHAR AS role,

            d.first_name,
            d.last_name,
            d.specialty,
            d.email,
            d.phone,

            d.is_active,

            COALESCE(
              ps.current_status,
              'unavailable'
            ) AS provider_status,

            ps.status_reason,
            ps.status_updated_at,

            'doctor'::VARCHAR AS staff_type,

            FALSE AS invite_pending,
            NULL::TIMESTAMPTZ AS invite_expires_at

          FROM doctors AS d

          LEFT JOIN provider_status AS ps
            ON ps.doctor_id = d.doctor_id


          UNION ALL


          SELECT ${STAFF_ROW_SQL}

          FROM staff_users AS su

          WHERE su.role IN ('admin', 'receptionist')
        ) AS staff_directory

        ORDER BY
          is_active DESC,

          CASE
            WHEN role = 'physician' THEN 1
            WHEN role = 'admin' THEN 2
            WHEN role = 'receptionist' THEN 3
            ELSE 4
          END,

          last_name,
          first_name;
      `);

      res.json(result.rows);
    } catch (error) {
      console.error(
        "Error getting staff directory:",
        error,
      );

      res.status(500).json({
        message:
          "Unable to load staff directory.",
      });
    }
  },
);

/* =========================================================
   ADD STAFF MEMBER
   ADMIN ONLY

   physician            -> doctors row (portal invite is
                           sent separately)
   admin / receptionist -> staff_users login + email invite
========================================================= */

router.post(
  "/",
  requireStaffAuth,
  requireRole("admin"),
  async (req, res) => {
    const {
      firstName,
      lastName,
      role,
      specialty,
      email,
      phone,
    } = req.body;

    if (
      typeof firstName !== "string" ||
      typeof lastName !== "string" ||
      !firstName.trim() ||
      !lastName.trim() ||
      !role
    ) {
      return res.status(400).json({
        message:
          "First name, last name, and role are required.",
      });
    }

    if (
      role !== "physician" &&
      !isStaffLoginRole(role)
    ) {
      return res.status(400).json({
        message:
          "Invalid staff role.",
      });
    }

    try {
      /* =====================================================
         PHYSICIAN
      ===================================================== */

      if (role === "physician") {
        const result =
          await pool.query(
            `
              INSERT INTO doctors (
                first_name,
                last_name,
                specialty,
                email,
                phone,
                is_active
              )
              VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                TRUE
              )
              RETURNING
                doctor_id AS id,
                first_name,
                last_name,
                specialty,
                email,
                phone,
                is_active;
            `,
            [
              firstName.trim(),
              lastName.trim(),
              specialty?.trim() || null,
              email?.trim() || null,
              phone?.trim() || null,
            ],
          );

        const doctor =
          result.rows[0];

        return res
          .status(201)
          .json({
            ...doctor,
            role: "physician",
            provider_status:
              "unavailable",
            status_reason: null,
            status_updated_at: null,
            staff_type: "doctor",
            invite_pending: false,
            invite_expires_at: null,
          });
      }
    } catch (error) {
      console.error(
        "Error adding staff member:",
        error,
      );

      return res.status(500).json({
        message:
          "Unable to add staff member.",
      });
    }

    /* =====================================================
       ADMIN / RECEPTIONIST LOGIN
    ===================================================== */

    const trimmedEmail =
      typeof email === "string"
        ? email.trim()
        : "";

    if (
      !trimmedEmail ||
      !EMAIL_PATTERN.test(trimmedEmail)
    ) {
      return res.status(400).json({
        message:
          "A valid email address is required to invite this staff member.",
      });
    }

    const trimmedPhone =
      typeof phone === "string"
        ? phone.trim()
        : "";

    // The person sets their own password from the invite;
    // until then the account holds a random hash nobody
    // knows, so it cannot be signed in to.
    const unusablePasswordHash =
      await bcrypt.hash(
        crypto
          .randomBytes(32)
          .toString("hex"),
        12,
      );

    const client = await pool.connect();

    let transactionCommitted = false;

    try {
      await client.query("BEGIN");

      if (
        await emailInUse(
          client,
          trimmedEmail,
          null,
        )
      ) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            "A staff account already exists with this email address.",
        });
      }

      const insertResult =
        await client.query<{
          staff_user_id: number;
        }>(
          `
            INSERT INTO staff_users (
              first_name,
              last_name,
              email,
              phone,
              password_hash,
              role,
              doctor_id,
              is_active
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              NULL,
              TRUE
            )
            RETURNING staff_user_id;
          `,
          [
            firstName.trim(),
            lastName.trim(),
            trimmedEmail,
            trimmedPhone || null,
            unusablePasswordHash,
            role,
          ],
        );

      const staffUserId =
        insertResult.rows[0].staff_user_id;

      const {
        rawToken,
      } = await createStaffInvite(
        client,
        staffUserId,
        trimmedEmail,
      );

      const staffRow =
        await loadStaffRow(
          client,
          staffUserId,
        );

      await client.query("COMMIT");

      transactionCommitted = true;

      const emailSent =
        await trySendStaffInvite(
          trimmedEmail,
          firstName.trim(),
          role,
          rawToken,
        );

      return res.status(201).json({
        ...staffRow,
        emailSent,
      });
    } catch (error) {
      if (!transactionCommitted) {
        await client.query("ROLLBACK");
      }

      if (isUniqueViolation(error)) {
        return res.status(409).json({
          message:
            "A staff account already exists with this email address.",
        });
      }

      console.error(
        "Error adding staff member:",
        error,
      );

      return res.status(500).json({
        message:
          "Unable to add staff member.",
      });
    } finally {
      client.release();
    }
  },
);

/* =========================================================
   RESEND STAFF INVITE
   ADMIN ONLY

   Only for logins that have never been activated, so an
   invite can never be used to take over an account that
   already has a password.
========================================================= */

router.post(
  "/staff/:id/resend-invite",
  requireStaffAuth,
  requireRole("admin"),
  async (req, res) => {
    const staffUserId =
      Number(req.params.id);

    if (
      !Number.isInteger(staffUserId) ||
      staffUserId <= 0
    ) {
      return res.status(400).json({
        message:
          "Invalid staff ID.",
      });
    }

    const client = await pool.connect();

    let transactionCommitted = false;

    try {
      await client.query("BEGIN");

      const account =
        await lockStaffLogin(
          client,
          staffUserId,
        );

      if (!account) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          message:
            "Staff member not found.",
        });
      }

      if (!account.invite_pending) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            "This staff member has already activated their account.",
        });
      }

      if (!account.is_active) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message:
            "This staff member is archived. Activate them before resending the invite.",
        });
      }

      const {
        rawToken,
      } = await createStaffInvite(
        client,
        staffUserId,
        account.email,
      );

      const staffRow =
        await loadStaffRow(
          client,
          staffUserId,
        );

      await client.query("COMMIT");

      transactionCommitted = true;

      const emailSent =
        await trySendStaffInvite(
          account.email,
          account.first_name,
          account.role as StaffLoginRole,
          rawToken,
        );

      return res.json({
        message: emailSent
          ? `Invitation sent to ${account.email}.`
          : "The invitation was created, but the email could not be sent.",
        emailSent,
        staff: staffRow,
      });
    } catch (error) {
      if (!transactionCommitted) {
        await client.query("ROLLBACK");
      }

      console.error(
        "Error resending staff invitation:",
        error,
      );

      return res.status(500).json({
        message:
          "Unable to resend the invitation.",
      });
    } finally {
      client.release();
    }
  },
);

/* =========================================================
   EDIT STAFF MEMBER
   ADMIN ONLY
========================================================= */

router.patch(
  "/:staffType/:id",
  requireStaffAuth,
  requireRole("admin"),
  async (req: AuthenticatedRequest, res) => {
    const {
      staffType,
      id,
    } = req.params as {
      staffType: string;
      id: string;
    };

    const numericId =
      Number(id);

    const {
      firstName,
      lastName,
      specialty,
      email,
      phone,
      role,
    } = req.body;

    if (
      !Number.isInteger(numericId) ||
      numericId <= 0
    ) {
      return res.status(400).json({
        message:
          "Invalid staff ID.",
      });
    }

    if (
      typeof firstName !== "string" ||
      typeof lastName !== "string" ||
      typeof email !== "string" ||
      !firstName.trim() ||
      !lastName.trim() ||
      !email.trim()
    ) {
      return res.status(400).json({
        message:
          "First name, last name, and email are required.",
      });
    }

    try {
      /* =====================================================
         UPDATE PHYSICIAN
      ===================================================== */

      if (staffType === "doctor") {
        if (
          typeof phone !== "string" ||
          !phone.trim()
        ) {
          return res.status(400).json({
            message:
              "First name, last name, email, and phone are required.",
          });
        }

        const result =
          await pool.query(
            `
              UPDATE doctors
              SET
                first_name = $1,
                last_name = $2,
                specialty = $3,
                email = $4,
                phone = $5
              WHERE doctor_id = $6
              RETURNING
                doctor_id AS id,
                first_name,
                last_name,
                specialty,
                email,
                phone,
                is_active;
            `,
            [
              firstName.trim(),
              lastName.trim(),
              specialty?.trim() || null,
              email.trim(),
              phone.trim(),
              numericId,
            ],
          );

        if (result.rowCount === 0) {
          return res
            .status(404)
            .json({
              message:
                "Doctor not found.",
            });
        }

        return res.json({
          ...result.rows[0],
          role: "physician",
          staff_type: "doctor",
        });
      }
    } catch (error) {
      console.error(
        "Error updating staff member:",
        error,
      );

      return res.status(500).json({
        message:
          "Unable to update staff member.",
      });
    }

    if (staffType !== "staff") {
      return res.status(400).json({
        message:
          "Invalid staff type.",
      });
    }

    /* =====================================================
       UPDATE ADMIN / RECEPTIONIST LOGIN
    ===================================================== */

    const trimmedEmail = email.trim();

    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      return res.status(400).json({
        message:
          "Please enter a valid email address.",
      });
    }

    if (
      role !== undefined &&
      !isStaffLoginRole(role)
    ) {
      return res.status(400).json({
        message:
          "Role must be admin or receptionist.",
      });
    }

    const trimmedPhone =
      typeof phone === "string"
        ? phone.trim()
        : "";

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const account =
        await lockStaffLogin(
          client,
          numericId,
        );

      if (!account) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          message:
            "Staff member not found.",
        });
      }

      const nextRole: StaffLoginRole =
        role ??
        (account.role as StaffLoginRole);

      /* ===================================================
         ADMIN SAFEGUARDS
      =================================================== */

      if (
        account.role === "admin" &&
        nextRole !== "admin"
      ) {
        if (
          account.staff_user_id ===
          req.staff?.staffUserId
        ) {
          await client.query("ROLLBACK");

          return res.status(400).json({
            message:
              "You cannot remove your own admin access.",
          });
        }

        if (
          account.is_active &&
          !account.invite_pending &&
          (await countOtherUsableAdmins(
            client,
            account.staff_user_id,
          )) === 0
        ) {
          await client.query("ROLLBACK");

          return res.status(409).json({
            message:
              "ClinicFlow needs at least one active admin. Add or activate another admin first.",
          });
        }
      }

      if (
        await emailInUse(
          client,
          trimmedEmail,
          numericId,
        )
      ) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            "A staff account already exists with this email address.",
        });
      }

      await client.query(
        `
          UPDATE staff_users
          SET
            first_name = $1,
            last_name = $2,
            email = $3,
            phone = $4,
            role = $5,
            updated_at = CURRENT_TIMESTAMP
          WHERE staff_user_id = $6;
        `,
        [
          firstName.trim(),
          lastName.trim(),
          trimmedEmail,
          trimmedPhone || null,
          nextRole,
          numericId,
        ],
      );

      const staffRow =
        await loadStaffRow(
          client,
          numericId,
        );

      await client.query("COMMIT");

      return res.json(staffRow);
    } catch (error) {
      await client.query("ROLLBACK");

      if (isUniqueViolation(error)) {
        return res.status(409).json({
          message:
            "A staff account already exists with this email address.",
        });
      }

      console.error(
        "Error updating staff member:",
        error,
      );

      return res.status(500).json({
        message:
          "Unable to update staff member.",
      });
    } finally {
      client.release();
    }
  },
);

/* =========================================================
   ARCHIVE STAFF MEMBER
   ADMIN ONLY

   Archiving sets is_active = FALSE. requireStaffAuth
   re-checks is_active (and doctors.is_active for doctor
   logins) on every request, so access ends immediately.
========================================================= */

router.patch(
  "/:staffType/:id/archive",
  requireStaffAuth,
  requireRole("admin"),
  async (req: AuthenticatedRequest, res) => {
    const {
      staffType,
      id,
    } = req.params as {
      staffType: string;
      id: string;
    };

    const numericId =
      Number(id);

    if (
      !Number.isInteger(
        numericId,
      )
    ) {
      return res.status(400).json({
        message:
          "Invalid staff ID.",
      });
    }

    /* ===================================================
       ARCHIVE DOCTOR
    =================================================== */

    if (
      staffType === "doctor"
    ) {
      try {
        const result =
          await pool.query(
            `
              UPDATE doctors
              SET is_active = FALSE
              WHERE doctor_id = $1
              RETURNING doctor_id;
            `,
            [numericId],
          );

        if (
          result.rowCount === 0
        ) {
          return res
            .status(404)
            .json({
              message:
                "Doctor not found.",
            });
        }

        return res.json({
          message:
            "Physician archived successfully.",
        });
      } catch (error) {
        console.error(
          "Error archiving staff member:",
          error,
        );

        return res.status(500).json({
          message:
            "Unable to archive staff member.",
        });
      }
    }

    if (
      staffType !== "staff"
    ) {
      return res.status(400).json({
        message:
          "Invalid staff type.",
      });
    }

    /* ===================================================
       ARCHIVE ADMIN / RECEPTIONIST LOGIN
    =================================================== */

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const account =
        await lockStaffLogin(
          client,
          numericId,
        );

      if (!account) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          message:
            "Staff member not found.",
        });
      }

      if (
        account.staff_user_id ===
        req.staff?.staffUserId
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message:
            "You cannot archive your own account.",
        });
      }

      if (
        account.role === "admin" &&
        account.is_active &&
        !account.invite_pending &&
        (await countOtherUsableAdmins(
          client,
          account.staff_user_id,
        )) === 0
      ) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            "ClinicFlow needs at least one active admin. Add or activate another admin first.",
        });
      }

      await client.query(
        `
          UPDATE staff_users
          SET
            is_active = FALSE,
            updated_at = CURRENT_TIMESTAMP
          WHERE staff_user_id = $1;
        `,
        [numericId],
      );

      await client.query("COMMIT");

      return res.json({
        message:
          "Staff member archived successfully.",
      });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error(
        "Error archiving staff member:",
        error,
      );

      return res.status(500).json({
        message:
          "Unable to archive staff member.",
      });
    } finally {
      client.release();
    }
  },
);

/* =========================================================
   ACTIVATE STAFF MEMBER
   ADMIN ONLY
========================================================= */

router.patch(
  "/:staffType/:id/activate",
  requireStaffAuth,
  requireRole("admin"),
  async (req, res) => {
    const {
      staffType,
      id,
    } = req.params;

    const numericId =
      Number(id);

    if (
      !Number.isInteger(
        numericId,
      )
    ) {
      return res.status(400).json({
        message:
          "Invalid staff ID.",
      });
    }

    try {
      /* ===================================================
         ACTIVATE DOCTOR
      =================================================== */

      if (
        staffType === "doctor"
      ) {
        const result =
          await pool.query(
            `
              UPDATE doctors
              SET is_active = TRUE
              WHERE doctor_id = $1
              RETURNING doctor_id;
            `,
            [numericId],
          );

        if (
          result.rowCount === 0
        ) {
          return res
            .status(404)
            .json({
              message:
                "Doctor not found.",
            });
        }

        return res.json({
          message:
            "Physician activated successfully.",
        });
      }

      /* ===================================================
         ACTIVATE ADMIN / RECEPTIONIST LOGIN
      =================================================== */

      if (
        staffType === "staff"
      ) {
        const result =
          await pool.query(
            `
              UPDATE staff_users
              SET
                is_active = TRUE,
                updated_at = CURRENT_TIMESTAMP
              WHERE staff_user_id = $1
                AND role IN ('admin', 'receptionist')
              RETURNING staff_user_id;
            `,
            [numericId],
          );

        if (
          result.rowCount === 0
        ) {
          return res
            .status(404)
            .json({
              message:
                "Staff member not found.",
            });
        }

        return res.json({
          message:
            "Staff member activated successfully.",
        });
      }

      return res.status(400).json({
        message:
          "Invalid staff type.",
      });
    } catch (error) {
      console.error(
        "Error activating staff member:",
        error,
      );

      return res.status(500).json({
        message:
          "Unable to activate staff member.",
      });
    }
  },
);

/* =========================================================
   INVITE DOCTOR TO PORTAL
   ADMIN ONLY
========================================================= */

router.post(
  "/doctors/:doctorId/invite",
  requireStaffAuth,
  requireRole("admin"),
  async (req, res) => {
    const doctorId = Number(
      req.params.doctorId,
    );

    if (
      !Number.isInteger(doctorId) ||
      doctorId <= 0
    ) {
      return res.status(400).json({
        message: "Invalid doctor ID.",
      });
    }

    const client = await pool.connect();

    let transactionCommitted = false;

    try {
      await client.query("BEGIN");

      /* ===================================================
         FIND DOCTOR
      =================================================== */

      const doctorResult =
        await client.query(
          `
            SELECT
              doctor_id,
              first_name,
              last_name,
              email,
              is_active
            FROM doctors
            WHERE doctor_id = $1
            LIMIT 1;
          `,
          [doctorId],
        );

      if (
        doctorResult.rowCount === 0
      ) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          message: "Doctor not found.",
        });
      }

      const doctor =
        doctorResult.rows[0];

      if (!doctor.is_active) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message:
            "This physician is inactive and cannot be invited.",
        });
      }

      if (!doctor.email?.trim()) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message:
            "This physician does not have an email address.",
        });
      }

      /* ===================================================
         CHECK FOR EXISTING PORTAL ACCOUNT
      =================================================== */

      const existingAccountResult =
        await client.query(
          `
            SELECT
              staff_user_id,
              email,
              role,
              doctor_id
            FROM staff_users
            WHERE doctor_id = $1
            LIMIT 1;
          `,
          [doctorId],
        );

      if (
        existingAccountResult.rowCount &&
        existingAccountResult.rowCount > 0
      ) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            "This physician already has a portal account.",
        });
      }

      /* ===================================================
         CHECK EMAIL IS NOT ALREADY USED
      =================================================== */

      const existingEmailResult =
        await client.query(
          `
            SELECT
              staff_user_id,
              email,
              role
            FROM staff_users
            WHERE LOWER(email) = LOWER($1)
            LIMIT 1;
          `,
          [doctor.email.trim()],
        );

      if (
        existingEmailResult.rowCount &&
        existingEmailResult.rowCount > 0
      ) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            "A staff portal account already exists with this email address.",
        });
      }

      /* ===================================================
         CREATE SECURE INVITE TOKEN
      =================================================== */

      const rawToken = crypto
        .randomBytes(32)
        .toString("hex");

      const tokenHash = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");

      const expiresAt = new Date(
        Date.now() +
          24 * 60 * 60 * 1000,
      );

      /* ===================================================
         REMOVE OLD UNUSED INVITES
      =================================================== */

      await client.query(
        `
          DELETE FROM doctor_portal_invites
          WHERE doctor_id = $1
            AND used_at IS NULL;
        `,
        [doctorId],
      );

      /* ===================================================
         CREATE NEW INVITE
      =================================================== */

      await client.query(
        `
          INSERT INTO doctor_portal_invites (
            doctor_id,
            email,
            token_hash,
            expires_at
          )
          VALUES (
            $1,
            $2,
            $3,
            $4
          );
        `,
        [
          doctorId,
          doctor.email.trim(),
          tokenHash,
          expiresAt,
        ],
      );

      await client.query("COMMIT");

      transactionCommitted = true;

try {
  await sendDoctorInviteEmail(
    doctor.email,
    doctor.first_name,
    rawToken,
  );

  return res.status(201).json({
    message:
      `Doctor Portal invitation sent to ${doctor.email}.`,
    emailSent: true,
    doctor: {
      doctor_id:
        doctor.doctor_id,
      first_name:
        doctor.first_name,
      last_name:
        doctor.last_name,
      email:
        doctor.email,
    },
    expires_at: expiresAt,
  });
} catch (emailError) {
  console.error(
    "Doctor invite email failed:",
    emailError,
  );

  return res.status(201).json({
    message:
      "The invitation was created, but the email could not be sent.",
    emailSent: false,
    doctor: {
      doctor_id:
        doctor.doctor_id,
      first_name:
        doctor.first_name,
      last_name:
        doctor.last_name,
      email:
        doctor.email,
    },
    expires_at: expiresAt,
  });
}
    } catch (error) {
      if (!transactionCommitted) {
        await client.query("ROLLBACK");
      }

      console.error(
        "Error creating doctor portal invitation:",
        error,
      );

      return res.status(500).json({
        message:
          "Unable to create doctor portal invitation.",
      });
    } finally {
      client.release();
    }
  },
);

export default router;