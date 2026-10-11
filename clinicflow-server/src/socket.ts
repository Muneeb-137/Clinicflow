import { Server } from "socket.io";
import type { Server as HttpServer } from "http";

import {
  resolvePatientToken,
  resolveStaffToken,
} from "./middleware/authMiddleware.js";
import {
  PATIENT_COOKIE,
  readCookie,
  STAFF_COOKIE,
} from "./middleware/authCookies.js";

import { invalidateLivePredictions } from "./services/waittime/LivePredictions.js";
import { scheduleWaitUpdateSoon } from "./services/patientNotifications.js";

let io: Server | null = null;

const STAFF_ROOM = "staff";
const PATIENT_ROOM = "patients";

export function initializeSocket(
  httpServer: HttpServer,
) {
  io = new Server(httpServer, {
    cors: {
      origin:
        process.env.CLIENT_URL ??
        "http://localhost:5173",
      methods: ["GET", "POST", "PATCH"],
      // Allow the browser to send the session cookie.
      credentials: true,
    },
  });

  /*
   * Every socket must have a staff or patient session.
   * Staff and patients are placed in separate rooms so
   * patients never receive event payloads containing
   * other patients' IDs.
   *
   * The session comes from the httpOnly cookie. The
   * client says which portal it is in (auth.portal),
   * since one browser can hold both cookies.
   */
  io.use(async (socket, next) => {
    const cookieHeader =
      socket.handshake.headers.cookie;

    const staffToken = readCookie(
      cookieHeader,
      STAFF_COOKIE,
    );

    const patientToken = readCookie(
      cookieHeader,
      PATIENT_COOKIE,
    );

    const portal =
      socket.handshake.auth?.portal ===
      "patient"
        ? "patient"
        : "staff";

    const token =
      portal === "patient"
        ? patientToken
        : staffToken;

    if (!token) {
      return next(
        new Error("Authentication required."),
      );
    }

    try {
      const staff =
        portal === "staff"
          ? await resolveStaffToken(token)
          : null;

      if (staff) {
        socket.data.role = staff.role;
        await socket.join(STAFF_ROOM);
        return next();
      }

      const patient =
        portal === "patient"
          ? await resolvePatientToken(token)
          : null;

      if (patient) {
        socket.data.role = "patient";
        await socket.join(PATIENT_ROOM);
        return next();
      }

      return next(
        new Error("Invalid or expired token."),
      );
    } catch (error) {
      console.error(
        "Socket authentication error:",
        error,
      );

      return next(
        new Error("Authentication is not available."),
      );
    }
  });

  io.on("connection", (socket) => {
    console.log(
      `Socket connected: ${socket.id} (${socket.data.role})`,
    );

    socket.on("disconnect", () => {
      console.log(
        `Socket disconnected: ${socket.id}`,
      );
    });
  });

  return io;
}

export function getIO() {
  if (!io) {
    throw new Error(
      "Socket.IO has not been initialized.",
    );
  }

  return io;
}

/*
 * Broadcasts a clinic update.
 *
 * Staff receive the full payload. Patients only receive
 * the event type plus the doctor and date (used by the
 * booking wizard to refresh availability) and never
 * appointment or patient IDs.
 */
export function emitClinicUpdate(
  payload: {
    type?: string;
    doctorId?: unknown;
    appointmentDate?: unknown;
  } & Record<string, unknown> = {},
) {
  // Clinic data changed: shared wait predictions are
  // recalculated on the next request, and waiting
  // patients' wait texts are checked shortly.
  invalidateLivePredictions();
  scheduleWaitUpdateSoon();

  const server = getIO();

  server
    .to(STAFF_ROOM)
    .emit("clinicflow:updated", payload);

  server
    .to(PATIENT_ROOM)
    .emit("clinicflow:updated", {
      type: payload.type,
      doctorId: payload.doctorId,
      appointmentDate:
        payload.appointmentDate,
    });
}
