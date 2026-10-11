import { CLINIC_TIME_ZONE } from "../utils/clinicTime";
import { apiFetch } from "../lib/api";
import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
} from "lucide-react";
import { socket } from "../socket";
import {
  useLocation,
  useNavigate,
} from "react-router-dom";

import BookingProgress from "../components/BookingProgress";
import DateTimeStep from "../components/DateTimeStep";

import PatientDetailsStep, {
  type Patient,
} from "../components/PatientDetailsStep";

import ReviewBookingStep from "../components/ReviewBookingStep";

import ReasonForVisitStep, {
  type Physician,
} from "../components/ReasonForVisitStep";

type DoctorAvailabilityResponse = {
  doctor_id: number;
  first_name: string;
  last_name: string;
  specialty: string | null;

  patient_booking_slots: number;
  walk_in_slots: number;
  walk_in_schedule:
  | {
      start_time: string;
      end_time: string;
    }[]
  | null;

  booked_slots: number;
  blocked_slots: number;

  next_available: string | null;
};
type AppointmentReason = {
  appointment_reason_id: number;
  appointment_type_id: number;
  name: string;
  duration_minutes: number;
  description: string | null;
  category_name: string;
};

type BookingAvailabilityResponse = {
  date: string;

  doctor: {
    doctor_id: number;
    first_name: string;
    last_name: string;
    specialty: string | null;
  };

  appointment_reason: {
    appointment_reason_id: number;
    appointment_type_id: number;
    name: string;
    category_name: string;
    duration_minutes: number;
  };

  settings: {
    scheduled_patient_capacity: number;
    booking_interval_minutes: number;
    booked_patients: number;
    remaining_patient_capacity: number;
    // Long (45+ min) visits are full that day.
    long_visit_limit_reached?: boolean;
  };

  available_times: string[];
};

type AppointmentHold = {
  hold_id: number;
  hold_token: string;
  patient_id: number | null;
  doctor_id: number;
  appointment_type_id: number;
  appointment_reason_id: number;
  appointment_date: string;
  start_time: string;
  duration_minutes: number;
  status: "active";
  created_at: string;
  expires_at: string;
};

type BookingData = {
  appointmentReasonId: number | null;
  doctorId: number | null;
  reasonForVisit: string;
  appointmentDate: string;
  startTime: string;
  patientId: number | null;
  notes: string;
};

type SavedBookingSession = {
  currentStep: number;
  bookingData: BookingData;
  appointmentHold: AppointmentHold | null;
};

type LoggedInPatient = {
  patient_id: number;
  first_name: string;
  last_name: string;
  email: string;
};


type BookAppointmentPageProps = {
  mode?: "staff" | "patient";
  loggedInPatient?: LoggedInPatient | null;
};

type RebookAppointmentState = {
  appointment_id: number;

  patient_id: number;
  patient_first_name?: string;
  patient_last_name?: string;

  doctor_id: number;

  appointment_type_id: number;
  appointment_type: string;

  duration_minutes: number;

  reason_for_visit:
    | string
    | null;

  status:
    | "missed"
    | "cancelled";
};

type CalendarBookingState = {
  doctorId: number;
  doctorName: string;
  date: string;
  startTime: string;
  slotId: number;
};

type ClinicFlowUpdate = {
  type?: string;
  doctorId?: number;
  appointmentDate?: string;
};



function getSavedBookingSession(
  sessionKey: string,
): SavedBookingSession | null {
  try {
    const saved = sessionStorage.getItem(
      sessionKey,
    );

    if (!saved) {
      return null;
    }

    const parsed =
      JSON.parse(saved) as SavedBookingSession;

    if (
      parsed.appointmentHold &&
      new Date(
        parsed.appointmentHold.expires_at,
      ).getTime() <= Date.now()
    ) {
      sessionStorage.removeItem(
        sessionKey,
      );

      return null;
    }

    return parsed;
  } catch {
    sessionStorage.removeItem(
      sessionKey,
    );

    return null;
  }
}

// Pending hold release queued when the wizard unmounts.
let pendingUnmountRelease: number | undefined;

// "2026-10-05" -> "Monday, October 5, 2026"
function formatBookingDate(dateValue: string) {
  if (!dateValue) {
    return "";
  }

  // Noon avoids the date shifting across time zones.
  const date = new Date(`${dateValue}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

// "14:30:00" -> "2:30 PM"
function formatBookingTime(timeValue: string) {
  const [hoursValue, minutesValue] =
    timeValue.split(":");

  const hours = Number(hoursValue);
  const minutes = Number(minutesValue);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    return timeValue;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;

  return `${displayHours}:${String(minutes).padStart(2, "0")} ${period}`;
}

function BookAppointmentPage({
  mode = "staff",
  loggedInPatient = null,
}: BookAppointmentPageProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const isPatientBooking =
    mode === "patient";

  const BOOKING_SESSION_KEY =
    isPatientBooking
      ? `clinicflow_patient_booking_${
          loggedInPatient?.patient_id ?? "guest"
        }`
      : "clinicflow_staff_booking";

  const calendarBooking =
    (
      location.state as {
        calendarBooking?: CalendarBookingState;
      } | null
    )?.calendarBooking ?? null;

  const rebookAppointment =
    (
      location.state as {
        rebookedFromAppointment?:
          RebookAppointmentState;
      } | null
    )?.rebookedFromAppointment ??
    null;

  const isRebooking =
    Boolean(rebookAppointment);

  /*
   * Rescheduling a booked visit: same prefilled wizard as a
   * rebook, but the server moves the old visit to the new
   * time instead of linking a new booking to a cancelled one.
   */
  const isRescheduling =
    isRebooking &&
    (location.state as { reschedule?: boolean } | null)
      ?.reschedule === true;

  /*
   * A rebook always starts a fresh booking at step 1 (visit
   * type), prefilled from the missed/cancelled visit. Any
   * unfinished booking left in this tab is discarded, so it
   * can't drop the rebook onto its old step (e.g. Review
   * with no date or time).
   */
  const [savedBookingSession] =
    useState<SavedBookingSession | null>(() => {
      if (isRebooking) {
        const stale = getSavedBookingSession(
          BOOKING_SESSION_KEY,
        );

        // Free the old held time instead of waiting for it
        // to expire.
        if (stale?.appointmentHold) {
          void apiFetch(
            `/api/appointments/holds/${stale.appointmentHold.hold_token}/release`,
            { method: "POST" },
          ).catch(() => undefined);
        }

        sessionStorage.removeItem(BOOKING_SESSION_KEY);

        return null;
      }

      return getSavedBookingSession(
        BOOKING_SESSION_KEY,
      );
    });

  const [currentStep, setCurrentStep] =
  useState(
    savedBookingSession?.currentStep ?? 1,
  );
  const [isStepLoading, setIsStepLoading] = useState(false);

  // The chosen doctor's long-visit spots are full that day.
  const [longVisitLimitReached, setLongVisitLimitReached] =
    useState(false);

  const [physicians, setPhysicians] =
    useState<Physician[]>([]);

  const [patients, setPatients] = useState<Patient[]>([]);

  const [appointmentReasons, setAppointmentReasons] =
    useState<AppointmentReason[]>([]);

  const [availableTimes, setAvailableTimes] =
    useState<string[]>([]);

  const [availabilityRefreshKey, setAvailabilityRefreshKey] =
    useState(0);

  const [appointmentHold, setAppointmentHold] =
  useState<AppointmentHold | null>(
    savedBookingSession?.appointmentHold ?? null,
  );

  const [holdSecondsRemaining, setHoldSecondsRemaining] =
    useState(0);

  const [isLoadingDoctors, setIsLoadingDoctors] =
    useState(false);

  const [isLoadingPatients, setIsLoadingPatients] =
    useState(false);

  const [isLoadingSlots, setIsLoadingSlots] =
    useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [bookingSuccess, setBookingSuccess] =
    useState(false);

  const [error, setError] = useState("");
  const [slotsError, setSlotsError] = useState("");

  const [showLeaveBookingModal, setShowLeaveBookingModal] =
  useState(false);

  const [isLeavingBooking, setIsLeavingBooking] =
    useState(false);

  const [bookingData, setBookingData] =
  useState<BookingData>(() => {
    if (savedBookingSession) {
      return savedBookingSession.bookingData;
    }

    return {
      appointmentReasonId: null,

      doctorId:
        !isPatientBooking && calendarBooking
          ? calendarBooking.doctorId
          : null,

      reasonForVisit: "",

      appointmentDate:
        !isPatientBooking && calendarBooking
          ? calendarBooking.date
          : "",

      startTime:
        !isPatientBooking && calendarBooking
          ? calendarBooking.startTime
          : "",

      patientId: null,
      notes: "",
    };
  });

  // Time chosen on the Calendar, applied once step 2
  // loads (see the effect after handleTimeSelect).
  const calendarPreferredTimeRef =
    useRef<string | null>(
      !isPatientBooking &&
        calendarBooking &&
        !savedBookingSession
        ? calendarBooking.startTime
        : null,
    );

  const hasBookingProgress =
    appointmentHold !== null &&
    bookingData.startTime !== "";


  const goToStep = (step: number) => {
    if (isStepLoading) {
      return;
    }

    setIsStepLoading(true);

    window.setTimeout(() => {
      setCurrentStep(step);

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });

      window.setTimeout(() => {
        setIsStepLoading(false);
      }, 150);
    }, 1800);
  };

  useEffect(() => {
  if (bookingSuccess) {
    return;
  }

  const hasBookingProgress =
    bookingData.appointmentReasonId !== null ||
    bookingData.doctorId !== null ||
    bookingData.appointmentDate !== "" ||
    bookingData.startTime !== "" ||
    appointmentHold !== null ||
    currentStep > 1;

  if (!hasBookingProgress) {
    sessionStorage.removeItem(
      BOOKING_SESSION_KEY,
    );

    return;
  }



  const session: SavedBookingSession = {
    currentStep,
    bookingData,
    appointmentHold,
  };

  sessionStorage.setItem(
    BOOKING_SESSION_KEY,
    JSON.stringify(session),
  );
}, [
  currentStep,
  bookingData,
  appointmentHold,
  bookingSuccess,
]);

/*
 * Release the held time when the wizard closes by any
 * route (header button, browser back, any link), not
 * only via the sidebar's leave dialog. The saved progress
 * stays so the booking can resume, minus the time.
 *
 * Closing or reloading the tab is not handled here: a
 * reload should resume with the hold intact, and an
 * abandoned hold expires on the server within 5 minutes.
 */
const latestHoldRef = useRef(appointmentHold);
latestHoldRef.current = appointmentHold;

const bookingSucceededRef = useRef(bookingSuccess);
bookingSucceededRef.current = bookingSuccess;

useEffect(() => {
  // React StrictMode unmounts and remounts once in
  // development; cancel a release queued by that fake
  // unmount.
  window.clearTimeout(pendingUnmountRelease);

  return () => {
    pendingUnmountRelease = window.setTimeout(() => {
      const hold = latestHoldRef.current;

      if (!hold || bookingSucceededRef.current) {
        return;
      }

      void apiFetch(
        `/api/appointments/holds/${hold.hold_token}/release`,
        {
          method: "POST",
          keepalive: true,
        },
      ).catch((error) => {
        console.error(
          "Unable to release appointment hold:",
          error,
        );
      });

      try {
        const saved = sessionStorage.getItem(
          BOOKING_SESSION_KEY,
        );

        if (saved) {
          const session = JSON.parse(
            saved,
          ) as SavedBookingSession;

          sessionStorage.setItem(
            BOOKING_SESSION_KEY,
            JSON.stringify({
              ...session,
              appointmentHold: null,
              currentStep: Math.min(
                session.currentStep,
                2,
              ),
              bookingData: {
                ...session.bookingData,
                startTime: "",
              },
            }),
          );
        }
      } catch {
        sessionStorage.removeItem(
          BOOKING_SESSION_KEY,
        );
      }
    }, 0);
  };
  // Runs on mount/unmount only; latest values come from refs.
}, []);

useEffect(() => {
  function showLeaveBookingModalHandler() {
  const pendingPath = sessionStorage.getItem(
    "clinicflow_pending_booking_navigation",
  );

  // No reserved time → allow navigation immediately
  if (!hasBookingProgress || bookingSuccess) {
    sessionStorage.removeItem(
      "clinicflow_pending_booking_navigation",
    );

    if (pendingPath === "__logout__") {
      window.dispatchEvent(
        new Event("clinicflow:confirmed-logout"),
      );
    } else if (pendingPath === "__staff_logout__") {
      window.dispatchEvent(
        new Event("clinicflow:confirmed-staff-logout"),
      );
    } else if (pendingPath) {
      navigate(pendingPath);
    }

    return;
  }

  // A time is actually reserved → ask before leaving
  setShowLeaveBookingModal(true);
}

  window.addEventListener(
    "clinicflow:show-leave-booking-modal",
    showLeaveBookingModalHandler,
  );

  return () => {
    window.removeEventListener(
      "clinicflow:show-leave-booking-modal",
      showLeaveBookingModalHandler,
    );
  };
}, [
  hasBookingProgress,
  bookingSuccess,
]);
  /*
   * Load active physicians.
   */
  useEffect(() => {
    const loadDoctors = async () => {
      try {
        setIsLoadingDoctors(true);

       const today = new Date().toLocaleDateString("en-CA", {
         timeZone: CLINIC_TIME_ZONE,
       });

       const response = await apiFetch(
        `/api/doctors/availability-summary?date=${today}`,
        );
        if (!response.ok) {
          throw new Error("Unable to load physicians.");
        }

        const doctorsData: DoctorAvailabilityResponse[] =
            await response.json();

        if (doctorsData.length === 0) {
          setPhysicians([]);
          return;
        }

        setPhysicians(
            doctorsData.map((doctor) => ({
                doctorId: doctor.doctor_id,
                firstName: doctor.first_name,
                lastName: doctor.last_name,

                specialty:
                doctor.specialty ?? "Family Physician",

                walkInSchedule:
                doctor.walk_in_schedule ?? [],

                scheduledSlotsRemaining:
                doctor.patient_booking_slots,

                bookedSlots:
                doctor.booked_slots,

                blockedSlots:
                doctor.blocked_slots,

                nextAvailable:
                doctor.next_available,
            })),
            );
      } catch (error) {
        console.error("Error loading physicians:", error);

        setError(
          error instanceof Error
            ? error.message
            : "Something went wrong while loading physicians.",
        );
      } finally {
        setIsLoadingDoctors(false);
      }
    };

    void loadDoctors();
  }, []);

  /*
 * Load patients.
 *
 * Staff:
 * Load all active patients so staff can select one.
 *
 * Patient:
 * Only use the currently logged-in patient.
 */
useEffect(() => {
  const loadPatients = async () => {
    if (
      isPatientBooking &&
      loggedInPatient
    ) {
      setPatients([
        {
          patient_id:
            loggedInPatient.patient_id,

          first_name:
            loggedInPatient.first_name,

          last_name:
            loggedInPatient.last_name,

          email:
            loggedInPatient.email,

          status: "active",
        } as Patient,
      ]);

      setBookingData((currentData) => ({
        ...currentData,
        patientId:
          loggedInPatient.patient_id,
      }));

      setIsLoadingPatients(false);

      return;
    }

    try {
      setIsLoadingPatients(true);

      const response = await apiFetch(
        "/api/patients",
      );

      if (!response.ok) {
        throw new Error(
          "Unable to load patients.",
        );
      }

      const patientsData: Patient[] =
        await response.json();

      setPatients(
        patientsData.filter(
          (patient) =>
            patient.status === "active",
        ),
      );
    } catch (error) {
      console.error(
        "Error loading patients:",
        error,
      );

      setError(
        error instanceof Error
          ? error.message
          : "Something went wrong while loading patients.",
      );
    } finally {
      setIsLoadingPatients(false);
    }
  };

  void loadPatients();
}, [
  isPatientBooking,
  loggedInPatient,
]);

useEffect(() => {
  if (
    !isRebooking ||
    !rebookAppointment ||
    appointmentReasons.length === 0
  ) {
    return;
  }

  const matchingReason =
    appointmentReasons.find(
      (reason) =>
        reason.name.trim().toLowerCase() ===
        (rebookAppointment.reason_for_visit || "")
          .trim()
          .toLowerCase(),
    );

  setBookingData((currentData) => ({
    ...currentData,
    patientId: rebookAppointment.patient_id,
    doctorId: rebookAppointment.doctor_id,
    appointmentReasonId:
      matchingReason?.appointment_reason_id ?? null,
    reasonForVisit: matchingReason
      ? ""
      : rebookAppointment.reason_for_visit || "",
    appointmentDate: "",
    startTime: "",
  }));
}, [
  isRebooking,
  rebookAppointment,
  appointmentReasons,
]);

  /*
   * Load patient-facing appointment reasons.
   */
  useEffect(() => {
    const loadAppointmentReasons = async () => {
      try {
        const response = await apiFetch(
          "/api/appointment-reasons",
        );

        const responseData = await response.json();

        if (!response.ok) {
          throw new Error(
            responseData.message ||
              "Unable to load appointment reasons.",
          );
        }

        const reasonsData: AppointmentReason[] =
          Array.isArray(responseData)
            ? responseData
            : responseData.reasons;

        setAppointmentReasons(reasonsData ?? []);
      } catch (error) {
        console.error(
          "Error loading appointment reasons:",
          error,
        );
        setAppointmentReasons([]);
        setError(
          error instanceof Error
            ? error.message
            : "Something went wrong while loading appointment reasons.",
        );
      }
    };

    void loadAppointmentReasons();
  }, []);

  /*
   * Load real booking availability whenever the
   * physician, date, or appointment reason changes.
   */
  useEffect(() => {
    const loadAvailability = async () => {
      if (
        bookingData.doctorId === null ||
        !bookingData.appointmentDate ||
        bookingData.appointmentReasonId === null
      ) {
        setAvailableTimes([]);
        setSlotsError("");
        return;
      }

      try {
        setIsLoadingSlots(true);
        setSlotsError("");

        const availabilityParams =
          new URLSearchParams({
            date: bookingData.appointmentDate,
            appointmentReasonId: String(
              bookingData.appointmentReasonId,
            ),
          });

        // Moving a visit: its own time counts as free.
        if (isRescheduling && rebookAppointment) {
          availabilityParams.set(
            "excludeAppointmentId",
            String(rebookAppointment.appointment_id),
          );
        }

        /*
        * Once this booking owns a temporary hold,
        * identify it when refreshing availability.
        *
        * The backend can then avoid counting our own hold
        * against our remaining daily capacity.
        */
        if (appointmentHold?.hold_token) {
          availabilityParams.set(
            "holdToken",
            appointmentHold.hold_token,
          );
        }

        const response = await apiFetch(
          `/api/doctors/${bookingData.doctorId}/booking-availability?${availabilityParams.toString()}`,
        );

        const responseData:
          | BookingAvailabilityResponse
          | { message?: string } =
          await response.json();

        if (!response.ok) {
          throw new Error(
            "message" in responseData
              ? responseData.message ||
                  "Unable to load appointment times."
              : "Unable to load appointment times.",
          );
        }

        const availability =
          responseData as BookingAvailabilityResponse;

        setAvailableTimes(availability.available_times);
        setLongVisitLimitReached(
          availability.settings?.long_visit_limit_reached === true,
        );
      } catch (error) {
        console.error(
          "Error loading booking availability:",
          error,
        );
        setAvailableTimes([]);
        setSlotsError(
          error instanceof Error
            ? error.message
            : "Something went wrong while loading appointment times.",
        );
      } finally {
        setIsLoadingSlots(false);
      }
    };

    void loadAvailability();
  }, [
    bookingData.doctorId,
    bookingData.appointmentDate,
    bookingData.appointmentReasonId,
    appointmentHold?.hold_token,
    availabilityRefreshKey,
  ]);

/*
 * Keep the temporary appointment reservation countdown
 * synchronized with the expiration time returned by
 * the backend.
 */

/*
 * Refresh appointment availability when another user
 * changes availability for the doctor/date currently
 * being viewed.
 */
useEffect(() => {
  function handleAvailabilityChanged(
    update: ClinicFlowUpdate,
  ) {
    // After a reconnect, missed updates are not replayed.
    if (update.type === "resync") {
      setAvailabilityRefreshKey(
        (currentKey) => currentKey + 1,
      );
      return;
    }

    if (
      update.type !==
      "appointment_availability_changed"
    ) {
      return;
    }

    if (
      update.doctorId !== bookingData.doctorId ||
      update.appointmentDate !==
        bookingData.appointmentDate
    ) {
      return;
    }

    setAvailabilityRefreshKey(
      (currentKey) => currentKey + 1,
    );
  }

  socket.on(
    "clinicflow:updated",
    handleAvailabilityChanged,
  );

  return () => {
    socket.off(
      "clinicflow:updated",
      handleAvailabilityChanged,
    );
  };
}, [
  bookingData.doctorId,
  bookingData.appointmentDate,
]);



/*
 * Keep the temporary appointment reservation countdown
 * synchronized with the expiration time returned by
 * the backend.
 */

useEffect(() => {
  if (!appointmentHold) {
    setHoldSecondsRemaining(0);
    return;
  }

  const updateCountdown = () => {
    const expiresAt =
      new Date(appointmentHold.expires_at).getTime();

    const millisecondsRemaining =
      expiresAt - Date.now();

    const secondsRemaining =
      Math.max(
        0,
        Math.ceil(millisecondsRemaining / 1000),
      );

    setHoldSecondsRemaining(secondsRemaining);

    /*
     * Once the hold expires, remove the selected time.
     *
     * We do not need to call /release here because the
     * backend already considers an expired hold invalid.
     */
    if (secondsRemaining === 0) {
      setAppointmentHold(null);

      setBookingData((currentData) => ({
        ...currentData,
        startTime: "",
      }));

      setAvailabilityRefreshKey(
        (currentKey) => currentKey + 1,
      );

      setError(
        "Your appointment reservation expired. Please select a time again.",
      );
    }
  };

  updateCountdown();

  const intervalId = window.setInterval(
    updateCountdown,
    1000,
  );

  return () => {
    window.clearInterval(intervalId);
  };
}, [appointmentHold]);

  const selectedPatient = patients.find(
    (patient) =>
      patient.patient_id === bookingData.patientId,
  );

  const selectedPhysician = physicians.find(
    (physician) =>
      physician.doctorId === bookingData.doctorId,
  );

  const selectedAppointmentReason =
    appointmentReasons.find(
      (reason) =>
        reason.appointment_reason_id ===
        bookingData.appointmentReasonId,
    ) ?? null;

   const selectedTimeIsHeld =
    appointmentHold !== null &&
    appointmentHold.status === "active" &&
    holdSecondsRemaining > 0 &&
    appointmentHold.doctor_id ===
      bookingData.doctorId &&
    appointmentHold.appointment_date.startsWith(
      bookingData.appointmentDate,
    ) &&
    appointmentHold.start_time.startsWith(
      bookingData.startTime,
    );

  const holdMinutes = Math.floor(
    holdSecondsRemaining / 60,
  );

  const holdSeconds =
    holdSecondsRemaining % 60;

  const formattedHoldTime =
    `${holdMinutes}:${holdSeconds
      .toString()
      .padStart(2, "0")}`;

  const releaseAppointmentHold = async () => {
  if (!appointmentHold) {
    return;
  }

  const holdToRelease = appointmentHold;

  /*
   * Clear local state first so the UI immediately
   * stops treating this time as reserved.
   */
  setAppointmentHold(null);
  setHoldSecondsRemaining(0);

  try {
    await apiFetch(
      `/api/appointments/holds/${holdToRelease.hold_token}/release`,
      {
        method: "POST",
      },
    );
  } catch (error) {
    console.error(
      "Unable to release appointment hold:",
      error,
    );
  }
};

function handleContinueBooking() {
  sessionStorage.removeItem(
    "clinicflow_pending_booking_navigation",
  );

  setShowLeaveBookingModal(false);
}

async function handleLeaveBooking() {
  if (isLeavingBooking) {
    return;
  }

  setIsLeavingBooking(true);

  try {
    if (appointmentHold) {
      await releaseAppointmentHold();
    }

    sessionStorage.removeItem(
      BOOKING_SESSION_KEY,
    );

    const pendingPath =
      sessionStorage.getItem(
        "clinicflow_pending_booking_navigation",
      );

    sessionStorage.removeItem(
      "clinicflow_pending_booking_navigation",
    );

    setShowLeaveBookingModal(false);

    if (pendingPath === "__booking_step_1__") {
      setError("");
      goToStep(1);
    } else if (pendingPath === "__logout__") {
      window.dispatchEvent(
        new Event("clinicflow:confirmed-logout"),
      );
    } else if (pendingPath === "__staff_logout__") {
      window.dispatchEvent(
        new Event(
          "clinicflow:confirmed-staff-logout",
        ),
      );
    } else if (pendingPath) {
      navigate(pendingPath);
    }
  } catch (error) {
    console.error(
      "Unable to leave booking:",
      error,
    );

    setError(
      "Unable to release the reserved appointment time. Please try again.",
    );
  } finally {
    setIsLeavingBooking(false);
  }
}

  const handleReasonSelect = async (reasonId: number) => {
    if (appointmentHold) {
      await releaseAppointmentHold();
    }

    setBookingData((currentData) => ({
      ...currentData,
      appointmentReasonId: reasonId,
      startTime: "",
    }));

    setAvailableTimes([]);
    setSlotsError("");
    setError("");
  };

  const handlePhysicianSelect = async (
    doctorId: number,
  ) => {
    if (appointmentHold) {
      await releaseAppointmentHold();
    }
    setBookingData((currentData) => ({
      ...currentData,
      doctorId,

      /*
       * Clear the previously selected time because
       * another physician may have different slots.
       */
      startTime: "",
    }));

    setAvailableTimes([]);
    setSlotsError("");
    setError("");
  };

  const handleStepOneContinue = () => {
    if (bookingData.appointmentReasonId === null) {
      setError("Please select a reason for the visit.");
      return;
    }

    if (bookingData.doctorId === null) {
      setError("Please select a physician.");
      return;
    }

    setError("");
    goToStep(2);
  };

  const handleTimeSelect = async (time: string) => {
  if (
    bookingData.doctorId === null ||
    !bookingData.appointmentDate ||
    bookingData.appointmentReasonId === null
  ) {
    setError(
      "Please select a reason, physician, and appointment date first.",
    );
    return;
  }

  try {
   

    /*
     * If another time is already being held,
     * release it before requesting the new time.
     */
   if (appointmentHold) {
  await releaseAppointmentHold();
}

    /*
     * Ask the backend to temporarily reserve
     * the newly selected appointment time.
     */
    const response = await apiFetch(
      "/api/appointments/holds",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          patient_id:
            bookingData.patientId ??
            loggedInPatient?.patient_id ??
            null,

          doctor_id: bookingData.doctorId,

          appointment_reason_id:
            bookingData.appointmentReasonId,

          appointment_date:
            bookingData.appointmentDate,

          start_time: time,

          ...(isRescheduling && rebookAppointment
            ? {
                reschedule_from_appointment_id:
                  rebookAppointment.appointment_id,
              }
            : {}),
        }),
      },
    );

    const responseData = await response.json();

    if (!response.ok) {
      throw new Error(
        responseData.message ||
          "This appointment time is no longer available.",
      );
    }

    setAppointmentHold(
      responseData as AppointmentHold,
    );

    setBookingData((currentData) => ({
      ...currentData,
      startTime: time,
    }));

    // The new time was successfully reserved,
    // so clear any previous expiration/error message.
    setError("");
  } catch (error) {
    console.error(
      "Error creating appointment hold:",
      error,
    );

    setAppointmentHold(null);

    setBookingData((currentData) => ({
      ...currentData,
      startTime: "",
    }));

    setError(
      error instanceof Error
        ? error.message
        : "Unable to reserve this appointment time.",
    );
  }
};

  /*
   * A time picked on the Calendar arrives before the
   * reason is chosen, and choosing a reason clears the
   * time. Remember it, and once step 2 has loaded the
   * real availability for that doctor and date, hold it
   * automatically if it is still free.
   */
  useEffect(() => {
    const preferredTime =
      calendarPreferredTimeRef.current;

    if (
      !preferredTime ||
      !calendarBooking ||
      currentStep !== 2 ||
      isLoadingSlots ||
      appointmentHold ||
      bookingData.appointmentReasonId === null
    ) {
      return;
    }

    // The user moved to another doctor or date.
    if (
      bookingData.doctorId !==
        calendarBooking.doctorId ||
      bookingData.appointmentDate !==
        calendarBooking.date
    ) {
      calendarPreferredTimeRef.current = null;
      return;
    }

    calendarPreferredTimeRef.current = null;

    // Availability uses "HH:MM"; the calendar may send
    // "HH:MM:SS".
    const matchingTime = availableTimes.find(
      (time) =>
        time.slice(0, 5) ===
        preferredTime.slice(0, 5),
    );

    if (matchingTime) {
      void handleTimeSelect(matchingTime);
    } else {
      setError(
        "The time picked on the calendar isn't available for this reason. Please choose another time.",
      );
    }
  }, [
    currentStep,
    isLoadingSlots,
    availableTimes,
    appointmentHold,
    bookingData.appointmentReasonId,
    bookingData.doctorId,
    bookingData.appointmentDate,
  ]);

  const handleStepTwoContinue = () => {
  if (!bookingData.appointmentDate) {
    setError("Please select an appointment date.");
    return;
  }

  if (isLoadingSlots) {
    setError(
      "Please wait while appointment times are loading.",
    );
    return;
  }

  if (slotsError) {
    setError(
      "Appointment times could not be loaded. Please try again.",
    );
    return;
  }

  if (!bookingData.startTime) {
    setError("Please select an appointment time.");
    return;
  }

 /*
 * Once a time is held, it may disappear from the
 * general availability list because the backend
 * correctly considers it unavailable to everyone else.
 *
 * Allow the user to continue when they own an active
 * hold for the selected time.
 */
const selectedTimeIsAvailable =
  availableTimes.includes(
    bookingData.startTime,
  );

const selectedTimeIsHeldByUser =
  appointmentHold !== null &&
  appointmentHold.status === "active" &&
  holdSecondsRemaining > 0 &&
  appointmentHold.doctor_id === bookingData.doctorId &&
 appointmentHold.appointment_date.startsWith(
  bookingData.appointmentDate,
  ) &&
  appointmentHold.start_time.startsWith(
    bookingData.startTime,
  );

if (
  !selectedTimeIsAvailable &&
  !selectedTimeIsHeldByUser
) {
  setError(
    "The selected appointment time is no longer available.",
  );

  setBookingData((currentData) => ({
    ...currentData,
    startTime: "",
  }));

  return;
}

  setError("");
  goToStep(3);
};

  const handleStepThreeContinue = () => {
    if (bookingData.patientId === null) {
      setError("Please select a patient.");
      return;
    }

    setError("");
    goToStep(4);
  };

  const handleBookAppointment = async () => {
    if (
      !isPatientBooking &&
      bookingData.patientId === null
    ) {
      setError("Please select a patient.");
      setCurrentStep(3);
      return;
    }

    if (bookingData.doctorId === null) {
      setError("Please select a physician.");
      goToStep(1);
      return;
    }

    if (
      !bookingData.appointmentDate ||
      !bookingData.startTime
    ) {
      setError(
        "Please select an appointment date and time.",
      );

      goToStep(2);
      return;
    }

    /*
 * A selected appointment must have an active
 * temporary reservation before it can be booked.
 */
if (!appointmentHold) {
  setError(
    "Your appointment reservation has expired. Please select a time again.",
  );

  setBookingData((currentData) => ({
    ...currentData,
    startTime: "",
  }));

  goToStep(2);
  return;
}


    /*
     * Use the selected reason title as the reason.
     * When Other is selected, use the custom text.
     */
    const reasonForVisit =
      bookingData.reasonForVisit.trim() ||
      selectedAppointmentReason?.name ||
      "General appointment";

    

    try {
      setIsSubmitting(true);
      setError("");

const endpoint =
  isPatientBooking
    ? "/api/patient-auth/me/appointments"
    : "/api/appointments";

const response = await apiFetch(
  endpoint,
  {
    method: "POST",

    headers: {
      "Content-Type": "application/json",

    },

    body: JSON.stringify({
      ...(!isPatientBooking && {
        patient_id:
          bookingData.patientId,
      }),
      ...(
        isRebooking &&
        rebookAppointment
          ? isRescheduling
            ? {
                reschedule_from_appointment_id:
                  rebookAppointment.appointment_id,
              }
            : {
                rebooked_from_appointment_id:
                  rebookAppointment.appointment_id,
              }
          : {}
      ),

      doctor_id:
        bookingData.doctorId,

      appointment_date:
        bookingData.appointmentDate,

      start_time:
        bookingData.startTime,

      hold_token:
        appointmentHold.hold_token,

      status: "scheduled",

      reason_for_visit:
        reasonForVisit,

      notes:
        bookingData.notes.trim() ||
        null,

      visit_type: "scheduled",

      booking_channel:
        isPatientBooking
          ? "patient_portal"
          : "front_desk",
    }),
  },
);

      const responseData = await response.json();

        if (!response.ok) {
          /*
          * A conflict means the temporary reservation can no
          * longer be used. Clear it and return the user to
          * appointment-time selection.
          */
          if (response.status === 409) {
            setAppointmentHold(null);
            setHoldSecondsRemaining(0);

            setBookingData((currentData) => ({
              ...currentData,
              startTime: "",
            }));

            setAvailabilityRefreshKey(
              (currentKey) => currentKey + 1,
            );

            setError(
              responseData.message ||
                "Your appointment reservation is no longer available. Please select another time.",
            );

            goToStep(2);
            return;
          }

          throw new Error(
            responseData.message ||
              responseData.error ||
              "Unable to book the appointment.",
          );
        }

      /*
 * The backend has successfully converted the hold
 * into an appointment. Clear only the local state.
 *
 * Do NOT call the release endpoint here because the
 * hold is already converted.
 */
    setAppointmentHold(null);

      

      if (
        isRebooking &&
        rebookAppointment
      ) {
        if (isPatientBooking) {
          navigate(
            "/patient/appointments",
            {
              replace: true,

              state: {
                rebookSuccess: true,
                rescheduled: isRescheduling,
              },
            },
          );

          return;
        }

        navigate(
          "/appointments/history",
          {
            replace: true,

            state: {
              rebookSuccess: true,

              patientName:
                `${rebookAppointment.patient_first_name ?? ""} ${rebookAppointment.patient_last_name ?? ""}`.trim(),

              rebookSourceStatus:
                rebookAppointment.status,
            },
          },
        );

        return;
      }

      sessionStorage.removeItem(
        BOOKING_SESSION_KEY,
      );

      setBookingSuccess(true);
    } catch (error) {
      console.error(
        "Error booking appointment:",
        error,
      );

      setError(
        error instanceof Error
          ? error.message
          : "Something went wrong while booking the appointment.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="relative mx-auto -mt-6 w-full max-w-[1500px] space-y-4">
      {isStepLoading && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/20 backdrop-blur-[2px]">
          <div className="flex min-w-[210px] flex-col items-center rounded-3xl border border-white/70 bg-white px-8 py-7 shadow-2xl">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#13B2B3]/10">
              <svg
                className="h-12 w-12 animate-spin"
                viewBox="0 0 48 48"
              >
                <defs>
                  <linearGradient id="clinicflowSpinner">
                    <stop
                      offset="0%"
                      stopColor="#13B2B3"
                    />

                    <stop
                      offset="100%"
                      stopColor="#0877C9"
                    />
                  </linearGradient>
                </defs>

                <circle
                  cx="24"
                  cy="24"
                  r="18"
                  fill="none"
                  stroke="#E2E8F0"
                  strokeWidth="4"
                />

                <circle
                  cx="24"
                  cy="24"
                  r="18"
                  fill="none"
                  stroke="url(#clinicflowSpinner)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray="80 120"
                />
              </svg>
            </div>

            <p className="mt-4 text-sm font-bold text-slate-900">
              Loading...
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Please wait a moment...
            </p>

            <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full animate-[bookingLoader_650ms_ease-out_forwards] rounded-full bg-gradient-to-r from-[#13B2B3] to-[#0877C9]" />
            </div>
          </div>
        </div>
      )}

      {!bookingSuccess && (
        <BookingProgress currentStep={currentStep} />
      )}
      {appointmentHold &&
  holdSecondsRemaining > 0 &&
  !bookingSuccess && (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-teal-200 bg-teal-50 px-5 py-4">
      <div>
        <p className="text-sm font-bold text-slate-900">
          Appointment time reserved
        </p>

        <p className="mt-1 text-xs text-slate-600">
          Complete your booking before this reservation
          expires.
        </p>
      </div>

      <div className="shrink-0 rounded-xl bg-white px-4 py-2 text-center shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Time left
        </p>

        <p className="mt-0.5 font-mono text-xl font-bold text-[#13B2B3]">
          {formattedHoldTime}
        </p>
      </div>
    </div>
  )}

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}

      {currentStep === 1 && !bookingSuccess && (
        <>
          {isLoadingDoctors && (
            <div className="rounded-2xl border border-teal-100 bg-teal-50 px-5 py-4 text-sm font-medium text-teal-700">
              Loading physicians...
            </div>
          )}

          <ReasonForVisitStep
            appointmentReasons={appointmentReasons}

            selectedReasonId={
              bookingData.appointmentReasonId
            }
            reasonDetails={
              bookingData.reasonForVisit
            }
            selectedDoctorId={bookingData.doctorId}
            physicians={physicians}
            onReasonSelect={(reasonId) => {
              void handleReasonSelect(reasonId);
            }}
            onReasonDetailsChange={(value) => {
              setBookingData((currentData) => ({
                ...currentData,
                reasonForVisit: value,
              }));

              setError("");
            }}
            onPhysicianSelect={handlePhysicianSelect}
            onContinue={handleStepOneContinue}
          />
        </>
      )}

      {currentStep === 2 && !bookingSuccess && (
        <DateTimeStep
          selectedDate={bookingData.appointmentDate}
          selectedTime={bookingData.startTime}
          durationMinutes={
            selectedAppointmentReason
              ?.duration_minutes ?? 30
          }
          availableTimes={availableTimes}
          longVisitLimitReached={longVisitLimitReached}
          selectedTimeIsHeld={selectedTimeIsHeld}
          isLoadingSlots={isLoadingSlots}
          slotsError={slotsError}
          onDateSelect={(date) => {
            void (async () => {
              /*
              * If the user changes dates while holding a time,
              * release the old reservation immediately.
              */
              if (appointmentHold) {
                await releaseAppointmentHold();
              }

              setBookingData((currentData) => ({
                ...currentData,
                appointmentDate: date,
                startTime: "",
              }));

              setSlotsError("");
              setError("");
            })();
          }}
          onTimeSelect={(time) => {
            void handleTimeSelect(time);
          }}
                    onBack={() => {
                      if (
                        appointmentHold &&
                        holdSecondsRemaining > 0
                      ) {
                        sessionStorage.setItem(
                          "clinicflow_pending_booking_navigation",
                          "__booking_step_1__",
                        );

                        setShowLeaveBookingModal(true);
                        return;
                      }

                      setError("");
                      goToStep(1);
                    }}
                    onContinue={handleStepTwoContinue}
                  />
                )}

      {currentStep === 3 && !bookingSuccess && (
  <PatientDetailsStep
    patients={patients}
    selectedPatientId={bookingData.patientId}
    notes={bookingData.notes}
    isLoadingPatients={isLoadingPatients}

    lockedPatient={isPatientBooking}

    onPatientSelect={(patientId) => {
      if (isPatientBooking) {
        return;
      }

      setBookingData((currentData) => ({
        ...currentData,
        patientId,
      }));

      setError("");
    }}

    onNotesChange={(notes) => {
      setBookingData((currentData) => ({
        ...currentData,
        notes,
      }));

      setError("");
    }}

    onBack={() => {
      setError("");
      goToStep(2);
    }}

    onContinue={handleStepThreeContinue}
  />
)}

      {currentStep === 4 && !bookingSuccess && (
        <ReviewBookingStep
          patient={selectedPatient}
          physician={selectedPhysician}
          appointmentReason={
            selectedAppointmentReason ??
            undefined
          }
          appointmentDate={
            bookingData.appointmentDate
          }
          startTime={bookingData.startTime}
          durationMinutes={
            selectedAppointmentReason
              ?.duration_minutes ?? 30
          }
          reasonDetails={
            bookingData.reasonForVisit
          }
          notes={bookingData.notes}
          isSubmitting={isSubmitting}
          isPatientBooking={isPatientBooking}
          onBack={() => {
            setError("");
            goToStep(3);
          }}
          onBookAppointment={
            handleBookAppointment
          }
        />
      )}

      {bookingSuccess && (
        <section className="rounded-[26px] border border-emerald-200 bg-white p-8 text-center shadow-sm sm:p-12">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-[#13B2B3]">
            <CheckCircle2 size={34} />
          </div>

          <h2 className="mt-5 text-2xl font-bold text-slate-950">
            Appointment Booked
          </h2>

          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
            The appointment for{" "}
            <span className="font-bold text-slate-800">
              {selectedPatient?.first_name}{" "}
              {selectedPatient?.last_name}
            </span>{" "}
            has been successfully added to the clinic
            schedule.
          </p>

          <div className="mx-auto mt-6 max-w-md rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-slate-500">
                Patient
              </span>

              <span className="text-right font-bold text-slate-800">
                {selectedPatient
                  ? `${selectedPatient.first_name} ${selectedPatient.last_name}`
                  : "Not available"}
              </span>
            </div>

            <div className="mt-3 flex justify-between gap-4 text-sm">
              <span className="text-slate-500">
                Physician
              </span>

              <span className="text-right font-bold text-slate-800">
                {selectedPhysician
                  ? `Dr. ${selectedPhysician.firstName} ${selectedPhysician.lastName}`
                  : "Not available"}
              </span>
            </div>

            <div className="mt-3 flex justify-between gap-4 text-sm">
              <span className="text-slate-500">
                Appointment date
              </span>

              <span className="font-bold text-slate-800">
                {formatBookingDate(
                  bookingData.appointmentDate,
                )}
              </span>
            </div>

            <div className="mt-3 flex justify-between gap-4 text-sm">
              <span className="text-slate-500">
                Start time
              </span>

              <span className="font-bold text-slate-800">
                {formatBookingTime(
                  bookingData.startTime,
                )}
              </span>
            </div>

            <div className="mt-3 flex justify-between gap-4 text-sm">
              <span className="text-slate-500">
                Duration
              </span>

              <span className="font-bold text-slate-800">
                {selectedAppointmentReason?.duration_minutes ?? 30} minutes
              </span>
            </div>
          </div>

          <button
  type="button"
  onClick={() =>
    navigate(
      isPatientBooking
        ? "/patient/appointments"
        : "/appointments/today",
    )
  }
  className="mt-7 rounded-xl bg-slate-950 px-6 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
>
  {isPatientBooking
    ? "View My Appointments"
    : "View Today's Appointments"}
</button>
        </section>
      )}

      {showLeaveBookingModal && (
  <div data-dialog className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/50 px-4 backdrop-blur-sm">
    <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
        <CalendarDays size={23} />
      </div>

      <h2 className="mt-5 text-xl font-bold text-slate-950">
        Leave appointment booking?
      </h2>

      <p className="mt-2 text-sm leading-6 text-slate-600">
        {appointmentHold
          ? "Your selected appointment time is temporarily reserved. Leaving this page will release your reservation."
          : "Your current booking progress will be lost if you leave this page."}
      </p>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={handleContinueBooking}
          data-dialog-close
          disabled={isLeavingBooking}
          className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue Booking
        </button>

        <button
          type="button"
          onClick={() => {
            void handleLeaveBooking();
          }}
          disabled={isLeavingBooking}
          className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLeavingBooking
            ? "Leaving..."
            : appointmentHold
              ? "Leave & Release Time"
              : "Leave Booking"}
        </button>
      </div>
    </div>
  </div>
)}
    </section>
  );
}

export default BookAppointmentPage;