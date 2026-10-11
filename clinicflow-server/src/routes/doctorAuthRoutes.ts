import crypto from "crypto";
import bcrypt from "bcrypt";
import express from "express";

import { pool } from "../db.js";
import { authRateLimit } from "../middleware/rateLimit.js";

const router = express.Router();

// Invite links are random, but stop anyone hammering the
// endpoint with guesses.
const acceptInviteLimit = authRateLimit({
  name: "accept-invite",
  windowMs: 15 * 60_000,
  maxPerAccount: 10,
  maxPerIp: 20,
  accountField: "token",
  failureStatuses: [400, 403, 409],
});

/* =========================================================
   ACCEPT DOCTOR PORTAL INVITATION

   POST /api/doctor-auth/accept-invite
========================================================= */

router.post(
  "/accept-invite",
  acceptInviteLimit,
  async (request, response) => {
    const {
      token,
      password,
    } = request.body;

    if (
      typeof token !== "string" ||
      token.trim() === ""
    ) {
      return response.status(400).json({
        message:
          "Invitation token is required.",
      });
    }

    if (
      typeof password !== "string" ||
      password.length < 8
    ) {
      return response.status(400).json({
        message:
          "Password must be at least 8 characters.",
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token.trim())
      .digest("hex");

    const client =
      await pool.connect();

    try {
      await client.query("BEGIN");

      /* ===================================================
         FIND INVITATION
      =================================================== */

      const inviteResult =
        await client.query(
          `
            SELECT
              dpi.invite_id,
              dpi.doctor_id,
              dpi.email,
              dpi.expires_at,
              dpi.used_at,

              d.first_name,
              d.last_name,
              d.is_active

            FROM doctor_portal_invites AS dpi

            INNER JOIN doctors AS d
              ON d.doctor_id =
                dpi.doctor_id

            WHERE
              dpi.token_hash = $1

            LIMIT 1

            -- Lock the invite so two simultaneous accepts
            -- cannot both create an account.
            FOR UPDATE OF dpi;
          `,
          [tokenHash],
        );

      if (
        inviteResult.rows.length === 0
      ) {
        await client.query(
          "ROLLBACK",
        );

        return response.status(400).json({
          message:
            "This invitation is invalid.",
        });
      }

      const invite =
        inviteResult.rows[0];

      /* ===================================================
         CHECK INVITATION
      =================================================== */

      if (invite.used_at) {
        await client.query(
          "ROLLBACK",
        );

        return response.status(400).json({
          message:
            "This invitation has already been used.",
        });
      }

      if (
        new Date(invite.expires_at) <=
        new Date()
      ) {
        await client.query(
          "ROLLBACK",
        );

        return response.status(400).json({
          message:
            "This invitation has expired.",
        });
      }

      if (!invite.is_active) {
        await client.query(
          "ROLLBACK",
        );

        return response.status(403).json({
          message:
            "This physician profile is inactive.",
        });
      }

      /* ===================================================
         MAKE SURE DOCTOR DOES NOT ALREADY HAVE LOGIN
      =================================================== */

      const existingDoctorAccount =
        await client.query(
          `
            SELECT
              staff_user_id
            FROM staff_users
            WHERE doctor_id = $1
            LIMIT 1;
          `,
          [invite.doctor_id],
        );

      if (
        existingDoctorAccount.rows.length >
        0
      ) {
        await client.query(
          "ROLLBACK",
        );

        return response.status(409).json({
          message:
            "A portal account already exists for this physician.",
        });
      }

      /* ===================================================
         MAKE SURE EMAIL IS NOT ALREADY USED
      =================================================== */

      const existingEmailAccount =
        await client.query(
          `
            SELECT
              staff_user_id
            FROM staff_users
            WHERE LOWER(email) =
              LOWER($1)
            LIMIT 1;
          `,
          [invite.email],
        );

      if (
        existingEmailAccount.rows.length >
        0
      ) {
        await client.query(
          "ROLLBACK",
        );

        return response.status(409).json({
          message:
            "A staff account already exists with this email address.",
        });
      }

      /* ===================================================
         HASH PASSWORD
      =================================================== */

      const passwordHash =
        await bcrypt.hash(
          password,
          12,
        );

      /* ===================================================
         CREATE DOCTOR LOGIN
      =================================================== */

      const userResult =
        await client.query(
          `
            INSERT INTO staff_users (
              first_name,
              last_name,
              email,
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
              'doctor',
              $5,
              TRUE
            )
            RETURNING
              staff_user_id,
              first_name,
              last_name,
              email,
              role,
              doctor_id,
              is_active;
          `,
          [
            invite.first_name,
            invite.last_name,
            invite.email,
            passwordHash,
            invite.doctor_id,
          ],
        );

      /* ===================================================
         MARK INVITE AS USED
      =================================================== */

      await client.query(
        `
          UPDATE doctor_portal_invites
          SET used_at =
            CURRENT_TIMESTAMP
          WHERE invite_id = $1;
        `,
        [invite.invite_id],
      );

      await client.query("COMMIT");

      return response.status(201).json({
        message:
          "Doctor portal account created successfully.",

        user:
          userResult.rows[0],
      });
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      console.error(
        "Error accepting doctor portal invitation:",
        error,
      );

      return response.status(500).json({
        message:
          "Unable to create doctor portal account.",
      });
    } finally {
      client.release();
    }
  },
);

export default router;