import { EXAM_ROOM_NAMES } from "../config/clinic";
import { motion } from "motion/react";
import { useMemo } from "react";
import type { DashboardProvider } from "../pages/DashboardPage";

import { Footprints } from "lucide-react";

import {
  BaselineDelta,
  MinutesValue,
} from "../components/waittime/WaitTimeTiles";

import {
  getVisitTypeSummary,
  pluralize,
  presentWalkInNow,
  roundMinutes,
  visitTypeLabels,
} from "../components/waittime/waitTimeFormat";

import type {
  VisitType,
  WaitTimeSummary,
} from "../components/waittime/waitTimeTypes";

import {
  headingAnimation,
  itemAnimation,
  roomPanelAnimation,
  waitPanelAnimation,
} from "../animations/animationsAll";


type LiveOperationsProps = {
  providers: DashboardProvider[];
  loading: boolean;
  waitSummary: WaitTimeSummary | null;
  waitLoading: boolean;
  waitError: string;
};

const visitTypes: VisitType[] = ["walk_in", "scheduled"];
const statusStyles = {
  Available: {
    dot: "bg-emerald-400",
    badge: "bg-emerald-100 text-emerald-700",
  },
  "In Consult": {
    dot: "bg-blue-400",
    badge: "bg-blue-100 text-blue-700",
  },
  Unavailable: {
    dot: "bg-slate-400",
    badge: "bg-slate-200 text-slate-700",
  },
  Unassigned: {
    dot: "bg-slate-300",
    badge: "bg-slate-100 text-slate-600",
  },
};

function LiveOperations({
  providers,
  waitSummary,
  waitLoading,
  waitError,
}: LiveOperationsProps) {
  const newWalkIn = waitSummary?.newWalkIn ?? null;

  const walkInNow = presentWalkInNow(newWalkIn);

  const waitUnavailable = !waitLoading && !waitSummary;

  const examinationRooms = EXAM_ROOM_NAMES;

const liveRooms = useMemo(() => {
  return examinationRooms.map((roomName) => {
    const provider = providers.find(
      (item) => item.room_name === roomName,
    );

    const roomNumber = roomName.replace(
      "Examination Room ",
      "",
    );

    if (!provider) {
      return {
        roomName,
        roomNumber,
        status: "Unassigned",
        doctorName: "Unassigned",
        helper: "Available for assignment",
      };
    }

    if (provider.current_status === "in_consult") {
      return {
        roomName,
        roomNumber,
        status: "In Consult",
        doctorName: `Dr. ${provider.last_name}`,
        helper: "Consultation in progress",
      };
    }

    if (provider.current_status === "available") {
      return {
        roomName,
        roomNumber,
        status: "Available",
        doctorName: `Dr. ${provider.last_name}`,
        helper: "Ready for the next patient",
      };
    }

    return {
      roomName,
      roomNumber,
      status: "Unavailable",
      doctorName: `Dr. ${provider.last_name}`,
      helper:
        provider.status_reason ??
        "Temporarily unavailable",
    };
  });
}, [providers]);
  return (
    <motion.section
      className="mt-10 overflow-hidden px-6 pb-8"
      initial="hidden"
      whileInView="visible"
      viewport={{
        once: true,
        amount: 0.03,
        margin: "0px 0px 140px 0px",
      }}
    >
      <div className="mx-auto max-w-7xl">
        <motion.div
          className="mb-5 text-center"
          variants={headingAnimation}
        >
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#13B2B3]">
            Real-Time Operations
          </p>

          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            Live Clinic Operations
          </h2>

          <p className="mx-auto mt-2 max-w-2xl text-base leading-6 text-slate-600">
            Monitor current patient wait times and examination room
            availability from one live dashboard.
          </p>
        </motion.div>

        <div className="grid items-start gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          {/* Live queue */}
          <motion.div
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
            variants={waitPanelAnimation}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[#13B2B3]">
                  Live Queue
                </p>

                <h3 className="mt-1 text-2xl font-bold text-slate-900">
                  Current Wait Times
                </h3>

                <p className="mt-2 text-sm text-slate-500">
                  Average check-in → room wait today, updated as
                  patients move through the clinic.
                </p>
              </div>

              {waitSummary ? (
                <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                  Live
                </div>
              ) : waitUnavailable ? (
                <div className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">
                  Offline
                </div>
              ) : null}
            </div>

            {waitUnavailable && (
              <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-500">
                {waitError || "Wait times are unavailable right now."}
              </p>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3">
              {visitTypes.map((visitType, index) => {
                const visitSummary = getVisitTypeSummary(
                  waitSummary,
                  visitType,
                );

                const longestNow = roundMinutes(
                  visitSummary?.longestCurrentWaitMinutes,
                );

                const medianToday = roundMinutes(
                  visitSummary?.medianWaitMinutes,
                );

                return (
                  <motion.div
                    key={visitType}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3.5"
                    variants={itemAnimation}
                    custom={0.9 + index * 0.14}
                  >
                    <h4 className="font-semibold text-slate-900">
                      {visitTypeLabels[visitType]}
                    </h4>

                    <p className="text-xs text-slate-500">
                      Average wait today
                    </p>

                    <div className="mt-2">
                      <MinutesValue
                        minutes={visitSummary?.averageWaitMinutes}
                        emptyLabel="No visits yet today"
                        loading={waitLoading}
                        size="md"
                      />
                    </div>

                    {!waitLoading && visitSummary && visitSummary.seenCount > 0 && (
                      <p className="text-xs text-slate-500">
                        {pluralize(visitSummary.seenCount, "patient")} seen
                        {medianToday !== null &&
                          ` · median ${medianToday} min`}
                      </p>
                    )}

                    {!waitLoading && (
                      <BaselineDelta summary={visitSummary} />
                    )}

                    <div className="mt-3 border-t border-slate-200 pt-3 text-xs">
                      <p className="font-semibold text-slate-700">
                        {waitLoading || !visitSummary
                          ? "—"
                          : visitSummary.waitingCount === 0
                            ? "No one waiting"
                            : `${visitSummary.waitingCount} waiting now`}
                      </p>

                      {!waitLoading && visitSummary && visitSummary.waitingCount > 0 && longestNow !== null && (
                        <p className="mt-0.5 text-slate-500">
                          Longest current wait {longestNow} min
                        </p>
                      )}
                    </div>
                  </motion.div>
                );
              })}

              <motion.div
                className="col-span-2 flex items-center justify-between gap-4 rounded-xl border border-[#13B2B3]/20 bg-[#13B2B3]/5 p-3.5"
                variants={itemAnimation}
                custom={0.9 + visitTypes.length * 0.14}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#13B2B3]">
                    <Footprints size={18} />
                  </div>

                  <div className="min-w-0">
                    <h4 className="font-semibold text-slate-900">
                      Walk in now
                    </h4>

                    <p className="text-xs text-slate-500">
                      {newWalkIn?.status === "open" && newWalkIn.acceptingDoctors > 0
                        ? `${pluralize(newWalkIn.acceptingDoctors, "doctor")} seeing walk-ins${
                            walkInNow.spotsLabel ? ` · ${walkInNow.spotsLabel}` : ""
                          }`
                        : "Estimated wait for a new walk-in"}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  {waitLoading ? (
                    <span className="text-xl font-bold text-slate-900">
                      —
                    </span>
                  ) : waitUnavailable ? (
                    <span className="text-sm font-semibold text-slate-500">
                      Unavailable
                    </span>
                  ) : walkInNow.minutes === null ? (
                    <>
                      <p
                        className={`text-sm font-semibold ${
                          walkInNow.tone === "warning"
                            ? "text-amber-700"
                            : "text-slate-500"
                        }`}
                      >
                        {walkInNow.headline}
                      </p>

                      {walkInNow.detail && (
                        <p className="text-xs text-slate-500">
                          {walkInNow.detail}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p>
                        <span className="text-xl font-bold text-slate-900">
                          ~{walkInNow.minutes}
                        </span>

                        <span className="ml-1 text-sm text-slate-500">
                          min
                        </span>
                      </p>

                      {walkInNow.detail && (
                        <p className="text-xs text-slate-500">
                          {walkInNow.detail}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            </div>
          </motion.div>

          {/* Rooms */}
          <motion.div
            className="rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-xl"
            variants={roomPanelAnimation}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[#13B2B3]">
                  Examination Rooms
                </p>

                <h3 className="mt-1 text-2xl font-bold">
                  Room Status
                </h3>

                <p className="mt-2 text-sm text-slate-500">
                  Live room availability across the clinic.
                </p>
              </div>

              <div className="rounded-full border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-[#13B2B3]">
                {liveRooms.length} rooms
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              {liveRooms.map((room, index) => {
                const currentStyle =
                  statusStyles[
                    room.status as keyof typeof statusStyles
                  ];

                return (
                  <motion.div
                    key={room.roomNumber}
                    className="group rounded-xl border border-slate-200 bg-slate-50 p-3 transition-[border-color,background-color,box-shadow] duration-300 hover:border-teal-300 hover:bg-white hover:shadow-lg"
                    variants={itemAnimation}
                    custom={1.15 + index * 0.11}
                    whileHover={{
                      y: -4,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Examination Room
                        </p>

                        <h4 className="mt-0.5 text-2xl font-bold">
                          {room.roomNumber}
                        </h4>
                      </div>

                      <span
                        className={`mt-1 h-3 w-3 rounded-full ${currentStyle.dot}`}
                      />
                    </div>

                    <div className="mt-3">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${currentStyle.badge}`}
                      >
                        {room.status}
                      </span>
                    </div>

                    <div className="mt-3 space-y-1 border-t border-slate-200 pt-3">
                      <p className="text-sm font-semibold text-slate-900">
                        {room.doctorName}
                      </p>

                      <p className="text-xs leading-5 text-slate-500">
                        {room.helper}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}

export default LiveOperations;