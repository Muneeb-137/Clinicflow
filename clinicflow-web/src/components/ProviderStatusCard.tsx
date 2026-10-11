import { EXAM_ROOM_NAMES, roomNumber } from "../config/clinic";
import { CLINIC_TIME_ZONE } from "../utils/clinicTime";
import { apiFetch } from "../lib/api";
import { useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Stethoscope,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";

export type ProviderStatus = {
  doctor_id: number;
  first_name: string;
  last_name: string;
  specialty: string | null;

  current_status:
    | "available"
    | "in_consult"
    | "unavailable";

  status_reason: string | null;
  current_appointment_id: number | null;
  status_updated_at: string | null;

  estimated_ready_at: string | null;
  readiness_estimate_minutes: number | null;
  readiness_estimate_updated_at: string | null;

  room_name: string | null;
  assignment_date: string | null;

  patient_id: number | null;
  patient_first_name: string | null;
  patient_last_name: string | null;

  appointment_start_time: string | null;
  appointment_type_name: string | null;
};

type Props = {
  provider: ProviderStatus;
  onChanged?: () => void;
};

const unavailableReasons = [
  "Temporarily unavailable",
  "Room cleaning",
  "Lunch",
  "Meeting",
  "Administrative work",
  "Doctor away",
  "Room unavailable",
];

function ProviderStatusCard({
  provider,
  onChanged,
}: Props) {
  const [updating, setUpdating] =
    useState(false);

  const [actionError, setActionError] =
    useState("");

  const [reason, setReason] =
    useState(
      provider.status_reason ??
        "Temporarily unavailable",
    );

  async function updateStatus(
    status:
      | "available"
      | "in_consult"
      | "unavailable",
    reasonOverride?: string,
  ) {
    try {
      setActionError("");
      setUpdating(true);

      const response = await apiFetch(
        `/api/provider-status/${provider.doctor_id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            current_status: status,
            status_reason:
              status === "available"
                ? null
                : status ===
                    "in_consult"
                  ? "Patient consultation"
                  : reasonOverride ??
                    reason,
          }),
        },
      );

      if (!response.ok) {
        const data =
          await response.json();

        throw new Error(
          data.message ??
            "Unable to update status.",
        );
      }

      onChanged?.();
    } catch (error) {
      console.error(error);

      setActionError(
        error instanceof Error
          ? error.message
          : "Something went wrong.",
      );
    } finally {
      setUpdating(false);
    }
  }

  async function updateRoom(
    roomName: string,
  ) {
    try {
      setActionError("");
      setUpdating(true);

      const response = await apiFetch(
        `/api/provider-status/${provider.doctor_id}/room`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            room_name: roomName,
          }),
        },
      );

      if (!response.ok) {
        const data = await response
          .json()
          .catch(() => ({}));

        throw new Error(
          data.message ??
            "Unable to update room.",
        );
      }

      onChanged?.();
    } catch (error) {
      console.error(error);

      setActionError(
        error instanceof Error
          ? error.message
          : "Something went wrong.",
      );
    } finally {
      setUpdating(false);
    }
  }

  async function completeConsult() {
    try {
      setActionError("");
      setUpdating(true);

      const response = await apiFetch(
        `/api/provider-status/${provider.doctor_id}/complete-consult`,
        {
          method: "PATCH",
        },
      );

      if (!response.ok) {
        const data = await response
          .json()
          .catch(() => ({}));

        throw new Error(
          data.message ??
            "Unable to complete consultation.",
        );
      }

      onChanged?.();
    } catch (error) {
      console.error(error);

      setActionError(
        error instanceof Error
          ? error.message
          : "Something went wrong.",
      );
    } finally {
      setUpdating(false);
    }
  }

  function formatTime(
    value: string | null,
  ) {
    if (!value) {
      return "Not updated";
    }

    const date = new Date(value);

    return date.toLocaleTimeString("en-US", {
      timeZone: CLINIC_TIME_ZONE,
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function statusLabel() {
    if (
      provider.current_status ===
      "in_consult"
    ) {
      return "In Consult";
    }

    if (
      provider.current_status ===
      "available"
    ) {
      return "Available";
    }

    return "Unavailable";
  }

  const statusColor =
    provider.current_status ===
    "available"
      ? "bg-emerald-500"
      : provider.current_status ===
          "in_consult"
        ? "bg-blue-500"
        : "bg-slate-400";

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}

      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
        <div>
          <h2 className="text-lg font-bold text-slate-950">
            Dr. {provider.first_name}{" "}
            {provider.last_name}
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            {provider.specialty ??
              "Physician"}
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">
          <span
            className={`h-2 w-2 rounded-full ${statusColor}`}
          />

          {statusLabel()}
        </div>
      </div>

      {actionError && (
        <p
          role="alert"
          className="border-b border-red-100 bg-red-50 px-6 py-3 text-sm font-medium text-red-700"
        >
          {actionError}
        </p>
      )}

      <div className="space-y-5 px-6 py-5">
        {/* Summary */}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase text-slate-400">
              Current Status
            </p>

            <p className="mt-2 text-sm font-semibold text-slate-700">
              {statusLabel()}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase text-slate-400">
              Today's Room
            </p>

            <select
              value={
                provider.room_name ?? ""
              }
              disabled={updating}
              onChange={(event) =>
                updateRoom(
                  event.target.value,
                )
              }
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium"
            >
              <option value="">
                Not assigned
              </option>

              {EXAM_ROOM_NAMES.map(
                (room) => (
                  <option
                    key={room}
                    value={room}
                  >
                    Exam Room {roomNumber(room)}
                  </option>
                ),
              )}
            </select>
          </div>

          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase text-slate-400">
              Last Updated
            </p>

            <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Clock3
                size={15}
                className="text-[#13B2B3]"
              />

              {formatTime(
                provider.status_updated_at,
              )}
            </p>
          </div>
        </div>

        {/* Current consult */}

        {provider.current_status ===
          "in_consult" && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-xs font-semibold uppercase text-blue-500">
              Current Consultation
            </p>

            {provider.patient_first_name ? (
              <>
                <p className="mt-1 font-bold text-slate-900">
                  {
                    provider.patient_first_name
                  }{" "}
                  {
                    provider.patient_last_name
                  }
                </p>

                <p className="mt-1 text-sm text-slate-600">
                  {
                    provider.appointment_type_name
                  }

                  {provider.room_name &&
                    ` • ${provider.room_name}`}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-blue-700">
                Consultation in progress.
              </p>
            )}

            {provider.current_appointment_id && (
              <button
                type="button"
                onClick={
                  completeConsult
                }
                disabled={updating}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#13B2B3] px-4 py-2.5 text-sm font-bold text-white"
              >
                <CheckCircle2
                  size={17}
                />
                Complete Consult
              </button>
            )}
          </div>
        )}

        {/* Buttons */}

        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            disabled={updating}
            onClick={() =>
              updateStatus(
                "available",
              )
            }
            className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold ${
              provider.current_status ===
              "available"
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            <UserRoundCheck
              size={17}
            />

            Available
          </button>

          <button
            type="button"
            disabled={updating}
            onClick={() =>
              updateStatus(
                "in_consult",
              )
            }
            className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold ${
              provider.current_status ===
              "in_consult"
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-blue-200 bg-blue-50 text-blue-700"
            }`}
          >
            <Stethoscope
              size={17}
            />

            In Consult
          </button>

          <button
            type="button"
            disabled={updating}
            onClick={() =>
              updateStatus(
                "unavailable",
                reason,
              )
            }
            className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold ${
              provider.current_status ===
              "unavailable"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-slate-100 text-slate-700"
            }`}
          >
            <UserRoundX size={17} />

            Unavailable
          </button>
        </div>

        {/* Unavailable reason */}

        {provider.current_status ===
          "unavailable" && (
          <select
            value={reason}
            disabled={updating}
            onChange={(event) => {
              const newReason =
                event.target.value;

              setReason(newReason);

              updateStatus(
                "unavailable",
                newReason,
              );
            }}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"
          >
            {unavailableReasons.map(
              (item) => (
                <option
                  key={item}
                  value={item}
                >
                  {item}
                </option>
              ),
            )}
          </select>
        )}
      </div>
    </article>
  );
}

export default ProviderStatusCard;