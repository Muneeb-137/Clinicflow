import { useMemo, useState } from "react";
import { DoorOpen, Stethoscope } from "lucide-react";

import { EXAM_ROOM_NAMES, roomNumber } from "../config/clinic";
import type { DashboardProvider } from "../pages/DashboardPage";
import { Card, CardHeader } from "../components/ui/Card";
import { StatusBadge, type StatusTone } from "../components/ui/StatusBadge";
import { Tabs } from "../components/ui/Tabs";

type View = "rooms" | "providers";

const providerStatus: Record<
  DashboardProvider["current_status"],
  { label: string; tone: StatusTone }
> = {
  available: { label: "Available", tone: "success" },
  in_consult: { label: "In consult", tone: "info" },
  unavailable: { label: "Unavailable", tone: "neutral" },
};

/*
 * Examination rooms and doctors, one tab each. Same live
 * data as the provider status page.
 */
function RoomsProvidersPanel({
  providers,
  loading,
}: {
  providers: DashboardProvider[];
  loading: boolean;
}) {
  const [view, setView] = useState<View>("rooms");

  const rooms = useMemo(
    () =>
      EXAM_ROOM_NAMES.map((roomName) => {
        const provider = providers.find((item) => item.room_name === roomName);

        if (!provider) {
          return {
            roomName,
            number: roomNumber(roomName),
            status: { label: "Unassigned", tone: "neutral" as StatusTone },
            doctor: "No doctor assigned",
            helper: "Available for assignment",
          };
        }

        return {
          roomName,
          number: roomNumber(roomName),
          status: providerStatus[provider.current_status],
          doctor: `Dr. ${provider.last_name}`,
          helper:
            provider.current_status === "in_consult"
              ? provider.patient_first_name
                ? `With ${provider.patient_first_name} ${provider.patient_last_name ?? ""}`.trim()
                : "Consultation in progress"
              : provider.current_status === "available"
                ? "Ready for the next patient"
                : provider.status_reason ?? "Temporarily unavailable",
        };
      }),
    [providers],
  );

  const inUse = rooms.filter((room) => room.status.label !== "Unassigned").length;

  return (
    <Card>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <CardHeader
          icon={view === "rooms" ? <DoorOpen size={18} /> : <Stethoscope size={18} />}
          title={view === "rooms" ? "Room status" : "Providers"}
          description={
            view === "rooms"
              ? `${inUse} of ${rooms.length} rooms assigned`
              : `${providers.filter((p) => p.current_status === "available").length} available · ${
                  providers.filter((p) => p.current_status === "in_consult").length
                } in consult`
          }
        />

        <Tabs
          label="Rooms or providers"
          value={view}
          onChange={setView}
          options={[
            { value: "rooms", label: "Rooms" },
            { value: "providers", label: "Providers" },
          ]}
        />
      </div>

      {loading ? (
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
          {rooms.map((room) => (
            <div key={room.roomName} className="h-28 animate-pulse rounded-control bg-slate-100" />
          ))}
        </div>
      ) : view === "rooms" ? (
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
          {rooms.map((room) => (
            <div
              key={room.roomName}
              className="rounded-control border border-slate-200 bg-slate-50/70 p-3.5 transition hover:border-brand-200 hover:bg-white"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Room
                </p>
                <p className="text-xl font-bold text-slate-900">{room.number}</p>
              </div>

              <div className="mt-2">
                <StatusBadge tone={room.status.tone} dot>
                  {room.status.label}
                </StatusBadge>
              </div>

              <p className="mt-3 truncate text-sm font-semibold text-slate-900">
                {room.doctor}
              </p>
              <p className="truncate text-xs text-slate-500" title={room.helper}>
                {room.helper}
              </p>
            </div>
          ))}
        </div>
      ) : providers.length === 0 ? (
        <p className="mt-5 rounded-control border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          No doctors are scheduled right now.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {providers.map((provider) => {
            const status = providerStatus[provider.current_status];
            return (
              <li
                key={provider.doctor_id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                    {provider.first_name.charAt(0)}
                    {provider.last_name.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">
                      Dr. {provider.first_name} {provider.last_name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {provider.specialty ?? "General practice"}
                      {provider.room_name && ` · ${provider.room_name}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {provider.current_status === "in_consult" && provider.patient_first_name && (
                    <span className="hidden text-xs text-slate-500 sm:inline">
                      With {provider.patient_first_name} {provider.patient_last_name}
                    </span>
                  )}
                  {provider.current_status === "unavailable" && provider.status_reason && (
                    <span className="hidden text-xs text-slate-500 sm:inline">
                      {provider.status_reason}
                    </span>
                  )}
                  <StatusBadge tone={status.tone} dot>
                    {status.label}
                  </StatusBadge>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export default RoomsProvidersPanel;
