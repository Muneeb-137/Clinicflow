import "dotenv/config";
import bcrypt from "bcrypt";
import { pool } from "../db.js";

/*
 * Creates a staff login.
 *
 * Usage:
 *   npx tsx src/scripts/createStaff.ts <email> <password> [role] [firstName] [lastName]
 *
 * role defaults to "admin". The password is never stored in
 * this file; pass it on the command line.
 */
const ALLOWED_ROLES = ["admin", "receptionist"];

async function createStaff() {
  const [
    email,
    password,
    role = "admin",
    firstName = "Admin",
    lastName = "User",
  ] = process.argv.slice(2);

  if (!email || !password) {
    console.error(
      "Usage: npx tsx src/scripts/createStaff.ts <email> <password> [role] [firstName] [lastName]",
    );
    process.exitCode = 1;
    await pool.end();
    return;
  }

  if (password.length < 12) {
    console.error(
      "Use a password of at least 12 characters.",
    );
    process.exitCode = 1;
    await pool.end();
    return;
  }

  if (!ALLOWED_ROLES.includes(role)) {
    console.error(
      `Role must be one of: ${ALLOWED_ROLES.join(", ")}. Doctors join through the invite flow.`,
    );
    process.exitCode = 1;
    await pool.end();
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `
      INSERT INTO staff_users (
        first_name,
        last_name,
        email,
        password_hash,
        role
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        staff_user_id,
        first_name,
        last_name,
        email,
        role
      `,
      [
        firstName,
        lastName,
        email.trim().toLowerCase(),
        passwordHash,
        role,
      ],
    );

    console.log("Staff account created:");
    console.log(result.rows[0]);
  } catch (error) {
    console.error("Error creating staff account:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

createStaff();
