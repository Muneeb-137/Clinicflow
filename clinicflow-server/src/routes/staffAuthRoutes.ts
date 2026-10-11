import crypto from "crypto";
import bcrypt from "bcrypt";
import express from "express";

import { pool } from "../db.js";
import { authRateLimit } from "../middleware/rateLimit.js";

const router = express.Router();

// Invite links are random, but stop anyone hammering the
// endpoint with guesses.
const acceptInviteLimit = authRateLimit({
  name: "staff-accept-invite",
  windowMs: 15 * 60_000,
  maxPerAccount: 10,
  maxPerIp: 20,
  accountField: "token",
  failureStatuses: [400, 403, 409],
});

/* =========================================================
   ACCEPT STAFF (ADMIN / RECEPTIONIST) INVITATION

   POST /api/staff-auth/accept-invite

   The staff_users row already exists (created from the
   Staff Directory with an unusable password). Accepting
   the invite sets the password the person chose.
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
              spi.invite_id,
              spi.staff_user_id,
              spi.email,
              spi.expires_at,
              spi.used_at,

              su.email AS account_email,
              su.role,
              su.is_active

            FROM staff_portal_invites AS spi

            INNER JOIN staff_users AS su
              ON su.staff_user_id =
                spi.staff_user_id

            WHERE
              spi.token_hash = $1

            LIMIT 1

            -- Lock the invite and the account so two
            -- simultaneous accepts cannot both set a
            -- password.
            FOR UPDATE OF spi, su;
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
            "This invitation has expired. Ask a ClinicFlow admin to resend it.",
        });
      }

      // The admin changed this person's email after the
      // invite went out; only the newest address counts.
      if (
        invite.email.toLowerCase() !==
          invite.account_email.toLowerCase() ||
        (invite.role !== "admin" &&
          invite.role !== "receptionist")
      ) {
        await client.query(
          "ROLLBACK",
        );

        return response.status(400).json({
          message:
            "This invitation is no longer valid. Ask a ClinicFlow admin to resend it.",
        });
      }

      if (!invite.is_active) {
        await client.query(
          "ROLLBACK",
        );

        return response.status(403).json({
          message:
            "This staff account is inactive.",
        });
      }

      /* ===================================================
         MAKE SURE THE ACCOUNT WAS NEVER ACTIVATED
      =================================================== */

      const usedInviteResult =
        await client.query(
          `
            SELECT invite_id
            FROM staff_portal_invites
            WHERE staff_user_id = $1
              AND used_at IS NOT NULL
            LIMIT 1;
          `,
          [invite.staff_user_id],
        );

      if (
        usedInviteResult.rows.length > 0
      ) {
        await client.query(
          "ROLLBACK",
        );

        return response.status(409).json({
          message:
            "This staff account has already been activated.",
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
         SET PASSWORD
      =================================================== */

      const userResult =
        await client.query(
          `
            UPDATE staff_users
            SET
              password_hash = $1,
              updated_at =
                CURRENT_TIMESTAMP
            WHERE staff_user_id = $2
            RETURNING
              staff_user_id,
              first_name,
              last_name,
              email,
              role,
              is_active;
          `,
          [
            passwordHash,
            invite.staff_user_id,
          ],
        );

      /* ===================================================
         MARK INVITE AS USED
      =================================================== */

      await client.query(
        `
          UPDATE staff_portal_invites
          SET used_at =
            CURRENT_TIMESTAMP
          WHERE invite_id = $1;
        `,
        [invite.invite_id],
      );

      await client.query("COMMIT");

      return response.status(201).json({
        message:
          "Staff account activated successfully.",

        user:
          userResult.rows[0],
      });
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      console.error(
        "Error accepting staff invitation:",
        error,
      );

      return response.status(500).json({
        message:
          "Unable to activate staff account.",
      });
    } finally {
      client.release();
    }
  },
);

export default router;