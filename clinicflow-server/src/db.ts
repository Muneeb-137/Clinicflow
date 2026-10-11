import "dotenv/config";
import { CLINIC_TIME_ZONE } from "./clinicTimeZone.js";
import pg from "pg";

const { Pool } = pg;

// Connection settings come from .env so no credentials
// live in source code.
const databasePassword = process.env.DB_PASSWORD;

if (!databasePassword) {
  throw new Error(
    "DB_PASSWORD is not configured. Add it to clinicflow-server/.env.",
  );
}

export const pool = new Pool({
  user: process.env.DB_USER ?? "postgres",
  host: process.env.DB_HOST ?? "localhost",
  database: process.env.DB_NAME ?? "clinicflow",
  password: databasePassword,
  port: Number(process.env.DB_PORT ?? 5433),

  // Every connection works in clinic time, whatever the
  // database server's own time zone is.
  options: `-c timezone=${CLINIC_TIME_ZONE}`,
});

/*
 * An idle connection can fail (e.g. the database restarts
 * or the network drops). Without this listener pg emits an
 * unhandled 'error' event, which crashes the whole server
 * and leaves every request failing with "Failed to fetch".
 * The pool discards the broken client and reconnects on
 * the next query.
 */
pool.on("error", (error) => {
  console.error(
    "Database connection error (idle client):",
    error,
  );
});
