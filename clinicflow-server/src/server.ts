// Must come first: pins clinic time before anything runs.
import "./clinicTimeZone.js";
import express from "express";
import cors from "cors";
import "dotenv/config";
import { pool } from "./db.js";
import patientRoutes from "./routes/patientRoutes.js";
import appointmentRoutes, {
  processExpiredAppointments,
} from "./routes/appointmentRoutes.js";
import doctorRoutes from "./routes/doctorRoutes.js";
import appointmentTypeRoutes from "./routes/appointmentTypeRoutes.js";
import calendarRoutes from "./routes/calendarRoutes.js";
import providerStatusRoutes from "./routes/providerStatusRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import staffRoutes from "./routes/staffRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import PatientAuthRoutes from "./routes/PatientAuthRoutes.js";
import patientQueueRoutes from "./routes/patientQueueRoutes.js";
import { createServer } from "http";
import { initializeSocket } from "./socket.js";
import {
  verifyEmailTransport,
} from "./services/emailService.js";
import doctorAuthRoutes
  from "./routes/doctorAuthRoutes.js";
import staffAuthRoutes
  from "./routes/staffAuthRoutes.js";
import appointmentReasonRoutes
  from "./routes/appointmentReasonRoutes.js";

import waitTimeRoutes from "./routes/waitTimeRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import { startPatientNotifications } from "./services/patientNotifications.js";
import scheduleRoutes from "./routes/scheduleRoutes.js";
import patientProfileRoutes from "./routes/patientProfileRoutes.js";
import {
  apiNotFound,
  errorHandler,
  validateCommonInputs,
} from "./middleware/inputValidation.js";

  


// Refuse to start without the secrets that protect logins,
// rather than failing on the first request.
for (const name of ["JWT_SECRET", "PATIENT_JWT_SECRET"]) {
  if (!process.env[name]) {
    throw new Error(`${name} is not configured. Add it to clinicflow-server/.env.`);
  }
}

const clientUrl =
  process.env.CLIENT_URL ?? "http://localhost:5173";

const app = express();
//calls express to create express application
//app is express server
const httpServer = createServer(app);

initializeSocket(httpServer);

const PORT = 5000;

//allows only the react frontend to access backend
app.use(
  cors({
    origin: clientUrl,
    // Allow the browser to send the session cookie.
    credentials: true,
  }),
);



//allows express to recieve JSON request bodies
app.use(express.json({ limit: "100kb" }));

// Real dates and times, text where text is expected.
app.use("/api", validateCommonInputs);
//use is middleware - code before routes 
//adds functionality to express

app.use(
  "/api/patient-auth",
  PatientAuthRoutes,
);

app.use(
  "/api/patient-queue",
  patientQueueRoutes,
);
app.use("/api/auth", authRoutes);

app.use("/api/patients", patientRoutes);

// Appointment routes.
app.use("/api/appointments", appointmentRoutes);

app.use("/api/doctors", doctorRoutes);

app.use(
  "/api/appointment-types",
  appointmentTypeRoutes,
);

app.use(
  "/api/appointment-reasons",
  appointmentReasonRoutes,
);

app.use("/api/calendar", calendarRoutes);
// Provider status routes.
app.use("/api/provider-status", providerStatusRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/staff", staffRoutes);
app.use(
  "/api/doctor",
  doctorRoutes,
);
app.use(
  "/api/doctor-auth",
  doctorAuthRoutes,
);
app.use(
  "/api/staff-auth",
  staffAuthRoutes,
);

app.use(
  "/api/wait-time",
  waitTimeRoutes,
);

// Public Contact page.
app.use("/api/contact", contactRoutes);

// Schedule editor: weekly hours and time off.
app.use("/api/schedule", scheduleRoutes);

// Patient profile and text-message settings.
app.use("/api/patient-profile", patientProfileRoutes);

app.get("/", (_request, response) => {
    response.json({
        message: "ClinicFlow API is running",

    });
});
//first REST API
//paramter request contains info coming from react
//request.body, request.params, request.query

app.get("/api/test-db", async (_request, response) =>{
    try {
        const result = await pool.query("SELECT CURRENT_TIMESTAMP");
    

        response.json({

            message: "Database connected sucessfully",
            databaseTime: result.rows[0],
        });
    } catch (error) {
        console.error("Database connection error:", error);

        response.status(500).json ({
            message: "Could not connect to database",

    });
            
        }
    });

// Unknown API paths and unhandled errors answer in JSON,
// without internal details.
app.use("/api", apiNotFound);
app.use(errorHandler);

/*
 * Last-resort safety net: log unexpected errors instead of
 * letting one bad request or background task take the
 * whole server down (in development, a crashed server is
 * not restarted until a file changes, so every page shows
 * "Failed to fetch").
 */
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

verifyEmailTransport();

httpServer.listen(PORT, () => {
  console.log(
    `Clinicflow server running on http://localhost:${PORT}`,
  );

  void processExpiredAppointments();

  // Appointment reminders and wait-time texts.
  startPatientNotifications();

  setInterval(() => {
    void processExpiredAppointments();
  }, 30_000);
});
//starts the server



