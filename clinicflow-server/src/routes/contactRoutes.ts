import express from "express";

import { authRateLimit } from "../middleware/rateLimit.js";
import { sendContactMessageEmail } from "../services/emailService.js";

const router = express.Router();

const INQUIRY_LABELS: Record<string, string> = {
  general: "General Question",
  technical_support: "Technical Support",
  report_issue: "Report an Issue",
  feature_request: "Feature Request",
  clinic_demo: "Clinic Demo",
};

// Every message sends an email, so each address may send
// a few per hour.
const contactLimit = authRateLimit({
  name: "contact",
  windowMs: 60 * 60_000,
  maxPerAccount: 3,
  maxPerIp: 5,
  countAllAttempts: true,
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/*
 * POST /api/contact
 *
 * Public Contact page. No sign-in needed.
 */
router.post("/", contactLimit, async (request, response) => {
  const firstName = text(request.body?.first_name, 100);
  const lastName = text(request.body?.last_name, 100);
  const email = text(request.body?.email, 255);
  const clinicName = text(request.body?.clinic_name, 200);
  const inquiryType = text(request.body?.inquiry_type, 50);
  const message = text(request.body?.message, 5000);

  if (!firstName || !lastName || !email || !message) {
    return response.status(400).json({
      message: "Please fill in your name, email and message.",
    });
  }

  if (!EMAIL_PATTERN.test(email)) {
    return response.status(400).json({
      message: "Please enter a valid email address.",
    });
  }

  try {
    await sendContactMessageEmail({
      firstName,
      lastName,
      email,
      clinicName,
      inquiryLabel:
        INQUIRY_LABELS[inquiryType] ?? INQUIRY_LABELS.general,
      body: message,
    });

    return response.status(201).json({
      message: "Your message has been sent.",
    });
  } catch (error) {
    console.error("Contact message failed:", error);

    return response.status(502).json({
      message:
        "Your message could not be sent right now. Please try again later or email us directly.",
    });
  }
});

export default router;
