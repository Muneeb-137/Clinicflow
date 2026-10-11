import { Router } from "express";
import {
  type AuthenticatedRequest,
  requireAnyAuth,
  requireStaffAuth,
} from "../middleware/authMiddleware.js";
import {
  requireDoctorSelf,
  requireRole,
} from "../middleware/requireRole.js";

import {
  buildClinicState,
} from "../services/waittime/ClinicStateBuilder.js";

import {
  checkForecastEligibility,
  checkDispatchEligibility,
} from "../services/waittime/ProviderEligibility.js";

import {
  simulateClinic,
} from "../services/waittime/QueueSimulator.js";

import {
  checkReadinessPrompt,
} from "../services/waittime/ReadinessPromptService.js";

import {
  predictClinic,
  walkInNextStepOptions,
  type ClinicPredictions,
  type WaitPrediction,
} from "../services/waittime/PredictionEngine.js";

import { evaluateWalkInAdmission } from "../services/waittime/WalkInAdmission.js";
import { getLivePredictions } from "../services/waittime/LivePredictions.js";

import {
  getTodayWaitSummary,
  getWaitTimeAnalytics,
  type VisitTypeFilter,
} from "../services/waittime/WaitTimeAnalytics.js";

import type {
  ClinicState,
} from "../services/waittime/types.js";

const router = Router();

/*
 * Adds the projected doctor's name, status and room to
 * each prediction (the shape the live queue renders as
 * "walkInProjection").
 */
function withProjectionDetails(
  prediction: WaitPrediction,
  state: ClinicState,
) {
  const patient = [
    ...state.walkInQueue,
    ...state.pendingWalkIns,
    ...state.scheduledQueue,
  ].find(
    (item) =>
      item.appointmentId ===
      prediction.appointmentId,
  );

  const provider = state.providers.find(
    (item) =>
      item.doctorId ===
      prediction.projectedProviderId,
  );

  return {
    ...prediction,

    walkInProjection:
      prediction.projectedProviderId !== null &&
      prediction.expectedWaitMinutes !== null
        ? {
            assignmentMode:
              patient?.assignmentMode ?? "auto",
            assignedDoctorId:
              patient?.doctorId ?? null,

            projectedDoctorId:
              prediction.projectedProviderId,
            projectedDoctorName: provider
              ? `${provider.firstName} ${provider.lastName}`
              : null,
            projectedProviderStatus:
              provider?.status ?? null,
            projectedRoomName:
              provider?.roomName ?? null,

            projectedStartAt:
              prediction.projectedStartAt,
            estimatedWaitMinutes:
              prediction.expectedWaitMinutes,

            delayStatus: prediction.delayStatus,
            delayMinutes: prediction.delayMinutes,
            delayReason: prediction.delayReason,
          }
        : null,
  };
}

/*
 * GET /api/wait-time/state
 *
 * Admin debug view of the live clinic state and what the
 * engine makes of it.
 */
router.get(
  "/state",
  requireStaffAuth,
  requireRole("admin"),
  async (_request, response) => {
    try {
      const now = new Date();
      const state = await buildClinicState(now);

      return response.status(200).json({
        state,

        providerEligibility: state.providers.map(
          (provider) => ({
            doctorId: provider.doctorId,
            doctorName: `${provider.firstName} ${provider.lastName}`,
            status: provider.status,
            walkInEligibleNow:
              provider.walkInEligibleNow,
            walkInBlockEndsAt:
              provider.walkInBlockEndsAt,
            roomName: provider.roomName,
            forecastEligibility:
              checkForecastEligibility(provider),
            dispatchEligibility:
              checkDispatchEligibility(provider),
          }),
        ),

        simulation: simulateClinic(state, now),
        predictions: predictClinic(state, now),

        readinessPrompts: state.providers.map(
          (provider) => ({
            doctorId: provider.doctorId,
            result: checkReadinessPrompt({
              provider,
              state,
              now,
            }),
          }),
        ),
      });
    } catch (error) {
      console.error(
        "Error building clinic state:",
        error,
      );

      return response.status(500).json({
        message: "Unable to build clinic state.",
      });
    }
  },
);

/*
 * GET /api/wait-time/readiness-prompt/:doctorId
 *
 * Whether a physician should currently be asked for a
 * readiness estimate.
 */
router.get(
  "/readiness-prompt/:doctorId",
  requireStaffAuth,
  requireDoctorSelf(),
  async (request, response) => {
    try {
      const doctorId = Number(
        request.params.doctorId,
      );

      if (
        !Number.isInteger(doctorId) ||
        doctorId <= 0
      ) {
        return response.status(400).json({
          message: "Invalid doctor ID.",
        });
      }

      const now = new Date();
      const state = await buildClinicState(now);

      const provider = state.providers.find(
        (item) => item.doctorId === doctorId,
      );

      if (!provider) {
        return response.status(404).json({
          message: "Physician not found.",
        });
      }

      return response.status(200).json(
        checkReadinessPrompt({
          provider,
          state,
          now,
        }),
      );
    } catch (error) {
      console.error(
        "Error checking readiness prompt:",
        error,
      );

      return response.status(500).json({
        message:
          "Unable to check readiness prompt.",
      });
    }
  },
);

/*
 * GET /api/wait-time/predictions
 *
 * Predicted waits for every waiting patient (booked and
 * walk-in, including walk-ins not checked in yet) plus a
 * "walk in now" estimate. One clinic snapshot for the
 * whole queue instead of one request per patient.
 */
router.get(
  "/predictions",
  requireStaffAuth,
  async (_request, response) => {
    try {
      const { state, predictions: result } =
        await getLivePredictions();

      return response.status(200).json({
        predictedAt: result.predictedAt,
        newWalkIn: result.newWalkIn,
        predictions: result.predictions.map(
          (prediction) =>
            withProjectionDetails(prediction, state),
        ),
      });
    } catch (error) {
      console.error(
        "Error generating wait predictions:",
        error,
      );

      return response.status(500).json({
        message:
          "Failed to generate wait predictions.",
      });
    }
  },
);

/*
 * GET /api/wait-time/prediction/:appointmentId
 *
 * Single-patient prediction (kept for existing callers;
 * prefer /predictions for a whole queue).
 */
router.get(
  "/prediction/:appointmentId",
  requireStaffAuth,
  async (request, response) => {
    try {
      const appointmentId = Number(
        request.params.appointmentId,
      );

      if (!Number.isInteger(appointmentId)) {
        return response.status(400).json({
          message: "Invalid appointment ID.",
        });
      }

      const { state, predictions: live } =
        await getLivePredictions();

      const prediction = live.predictions.find(
        (item) =>
          item.appointmentId === appointmentId,
      );

      if (!prediction) {
        return response.status(404).json({
          message:
            "Appointment is not waiting in the clinic.",
        });
      }

      return response.status(200).json(
        withProjectionDetails(prediction, state),
      );
    } catch (error) {
      console.error(
        "Error generating wait prediction:",
        error,
      );

      return response.status(500).json({
        message:
          "Failed to generate wait prediction.",
      });
    }
  },
);

/*
 * GET /api/wait-time/summary
 *
 * Today's wait times by visit type (dashboard and live
 * queues), the trailing 28-day baseline, the current
 * "walk in now" estimate, and for a signed-in patient
 * their own predicted wait. Aggregates only, so patients
 * may call it.
 */
router.get(
  "/summary",
  requireAnyAuth,
  async (request: AuthenticatedRequest, response) => {
    try {
      const [byVisitType, live] =
        await Promise.all([
          getTodayWaitSummary(),
          getLivePredictions(),
        ]);

      const predictions: ClinicPredictions =
        live.predictions;

      // Average predicted remaining wait of those waiting.
      const predictedByType = (
        visitType: "walk_in" | "scheduled",
      ) => {
        const values = predictions.predictions
          .filter(
            (item) =>
              item.predictionType === visitType &&
              item.expectedWaitMinutes !== null,
          )
          .map(
            (item) =>
              item.expectedWaitMinutes as number,
          );

        return values.length > 0
          ? Math.round(
              values.reduce((sum, value) => sum + value, 0) /
                values.length,
            )
          : null;
      };

      const patientId =
        request.patientAuth?.patientId;

      const myPrediction = patientId
        ? (predictions.predictions.find(
            (item) => item.patientId === patientId,
          ) ?? null)
        : undefined;

      return response.status(200).json({
        generatedAt: predictions.predictedAt,

        byVisitType: byVisitType.map((summary) => ({
          ...summary,
          averagePredictedWaitMinutes:
            predictedByType(summary.visitType),
        })),

        newWalkIn: {
          ...predictions.newWalkIn,
          // Patients do not need internal doctor IDs.
          projectedProviderId: request.patientAuth
            ? null
            : predictions.newWalkIn
                .projectedProviderId,
        },

        ...(myPrediction !== undefined && {
          myPrediction: myPrediction
            ? {
                appointmentId:
                  myPrediction.appointmentId,
                predictionType:
                  myPrediction.predictionType,
                expectedWaitMinutes:
                  myPrediction.expectedWaitMinutes,
                lowerWaitMinutes:
                  myPrediction.lowerWaitMinutes,
                upperWaitMinutes:
                  myPrediction.upperWaitMinutes,
                patientsAhead:
                  myPrediction.patientsAhead,
                confidence:
                  myPrediction.confidence,
                projectedStartAt:
                  myPrediction.projectedStartAt,
                walkInBlock:
                  myPrediction.walkInBlock,
                mayMissWalkInHours:
                  myPrediction.mayMissWalkInHours,
              }
            : null,
        }),
      });
    } catch (error) {
      console.error(
        "Error building wait summary:",
        error,
      );

      return response.status(500).json({
        message: "Unable to load wait times.",
      });
    }
  },
);

/*
 * GET /api/wait-time/walk-in-admission
 *   ?appointmentTypeId=N&assignmentMode=auto|manual[&doctorId=N]
 *
 * Can a new walk-in of this visit type be seen, start to
 * finish, in the walk-in hours open now? Used by Add
 * Walk-In to warn (and allow an override) before adding.
 */
router.get(
  "/walk-in-admission",
  requireStaffAuth,
  requireRole("admin", "receptionist"),
  async (request, response) => {
    const appointmentTypeId = Number(
      request.query.appointmentTypeId,
    );

    const assignmentMode =
      request.query.assignmentMode === "manual"
        ? "manual"
        : "auto";

    const doctorId = Number(request.query.doctorId);

    if (
      !Number.isInteger(appointmentTypeId) ||
      appointmentTypeId <= 0 ||
      (assignmentMode === "manual" &&
        (!Number.isInteger(doctorId) || doctorId <= 0))
    ) {
      return response.status(400).json({
        message:
          "appointmentTypeId (and doctorId for manual) are required.",
      });
    }

    try {
      const admission = await evaluateWalkInAdmission({
        appointmentTypeId,
        assignmentMode,
        doctorId:
          assignmentMode === "manual" ? doctorId : null,
      });

      if (!admission) {
        return response.status(404).json({
          message: "Active appointment type not found.",
        });
      }

      return response.status(200).json(admission);
    } catch (error) {
      console.error(
        "Error checking walk-in admission:",
        error,
      );

      return response.status(500).json({
        message: "Unable to check walk-in capacity.",
      });
    }
  },
);

/*
 * GET /api/wait-time/walk-in-options/:appointmentId
 *
 * For a waiting walk-in who won't be seen before walk-in
 * hours end: their time with the next available doctor,
 * and with each specific doctor's next walk-in hours.
 */
router.get(
  "/walk-in-options/:appointmentId",
  requireStaffAuth,
  requireRole("admin", "receptionist"),
  async (request, response) => {
    const appointmentId = Number(
      request.params.appointmentId,
    );

    if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
      return response.status(400).json({
        message: "Invalid appointment ID.",
      });
    }

    try {
      const now = new Date();
      const state = await buildClinicState(now);
      const options = walkInNextStepOptions(
        state,
        now,
        appointmentId,
      );

      if (!options) {
        return response.status(404).json({
          message: "This walk-in is not waiting.",
        });
      }

      return response.status(200).json(options);
    } catch (error) {
      console.error(
        "Error building walk-in options:",
        error,
      );

      return response.status(500).json({
        message: "Unable to load walk-in options.",
      });
    }
  },
);

/*
 * GET /api/wait-time/analytics
 *   ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *   [&visitType=walk_in|scheduled][&doctorId=N]
 *
 * Detailed wait-time analytics for the analytics page.
 */
const MAX_ANALYTICS_RANGE_DAYS = 366;

router.get(
  "/analytics",
  requireStaffAuth,
  // Analytics is an admin page (receptionists don't see it).
  requireRole("admin"),
  async (request, response) => {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    const startDate =
      typeof request.query.startDate === "string"
        ? request.query.startDate
        : "";

    const endDate =
      typeof request.query.endDate === "string"
        ? request.query.endDate
        : "";

    const rangeDays =
      (Date.parse(endDate) - Date.parse(startDate)) /
      86_400_000;

    if (
      !datePattern.test(startDate) ||
      !datePattern.test(endDate) ||
      Number.isNaN(rangeDays) ||
      rangeDays < 0 ||
      rangeDays > MAX_ANALYTICS_RANGE_DAYS
    ) {
      return response.status(400).json({
        message: `Provide startDate and endDate (YYYY-MM-DD), at most ${MAX_ANALYTICS_RANGE_DAYS} days apart.`,
      });
    }

    const rawVisitType = request.query.visitType;

    const visitType: VisitTypeFilter =
      rawVisitType === "walk_in" ||
      rawVisitType === "scheduled"
        ? rawVisitType
        : null;

    const rawDoctorId = request.query.doctorId;

    const doctorId =
      typeof rawDoctorId === "string" &&
      /^\d+$/.test(rawDoctorId)
        ? Number(rawDoctorId)
        : null;

    try {
      const analytics = await getWaitTimeAnalytics({
        startDate,
        endDate,
        visitType,
        doctorId,
      });

      return response.status(200).json(analytics);
    } catch (error) {
      console.error(
        "Error building wait-time analytics:",
        error,
      );

      return response.status(500).json({
        message:
          "Unable to load wait-time analytics.",
      });
    }
  },
);

export default router;
