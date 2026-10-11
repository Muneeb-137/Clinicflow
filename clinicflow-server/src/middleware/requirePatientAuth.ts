import type {
  NextFunction,
  Response,
} from "express";

import {
  getPatientToken,
  resolvePatientToken,
  type AuthenticatedRequest,
} from "./authMiddleware.js";

export async function requirePatientAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const token = getPatientToken(req);

  if (!token) {
    return res.status(401).json({
      message: "Patient authentication required.",
    });
  }

  try {
    const payload =
      await resolvePatientToken(token);

    if (!payload) {
      return res.status(401).json({
        message:
          "Your patient session is invalid or has expired.",
      });
    }

    req.patientAuth = payload;

    next();
  } catch (error) {
    console.error(
      "Patient authentication error:",
      error,
    );

    return res.status(500).json({
      message:
        "Authentication is not available.",
    });
  }
}
