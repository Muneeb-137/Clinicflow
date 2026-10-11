/*
 * Scenario checks for the wait-time engine (pure, no
 * database). Run: npm run test:engine
 */
import { simulateClinic } from "./QueueSimulator.js";
import { checkWalkInAdmission, predictClinic } from "./PredictionEngine.js";
import type { ClinicState, ClinicStatePatient, ClinicStateProvider } from "./types.js";
const now = new Date("2026-11-03T15:00:00Z"); // 10:00 Toronto, after DST ends
const at = (min: number) => new Date(now.getTime() + min * 60000).toISOString();
const doc = (id: number, status: ClinicStateProvider["status"], over: Partial<ClinicStateProvider> = {}): ClinicStateProvider => ({ doctorId: id, firstName: "Doc", lastName: String(id), status, statusReason: null, currentAppointmentId: null, roomName: "Room " + id, walkInEligibleNow: true, walkInBlockEndsAt: at(120), estimatedReadyAt: null, readinessEstimateMinutes: null, readinessEstimateUpdatedAt: null, todayBlocks: [], ...over });
const pt = (id: number, o: Partial<ClinicStatePatient>): ClinicStatePatient => ({ appointmentId: id, patientId: id, doctorId: null, assignmentMode: "auto", appointmentTypeId: null, visitType: "walk_in", status: "checked_in", scheduledStartAt: null, durationMinutes: 20, arrivedAt: at(-30), checkedInAt: at(-20), roomedAt: null, consultStartedAt: null, ...o });
const base = (o: Partial<ClinicState>): ClinicState => ({ generatedAt: now.toISOString(), providers: [], scheduledQueue: [], walkInQueue: [], pendingWalkIns: [], activeVisits: [], upcomingScheduledAppointments: [], durationStats: {}, ...o });
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail: unknown) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : JSON.stringify(detail)); };

// 1. Booked patient waiting for Dr 1 goes first; walk-in should not jump ahead of it on Dr 1.
{ const s = base({ providers: [doc(1, "available")], scheduledQueue: [pt(10, { visitType: "scheduled", doctorId: 1, scheduledStartAt: at(-5), durationMinutes: 30 })], walkInQueue: [pt(20, {})] });
  const r = simulateClinic(s, now);
  const booked = r.scheduledAssignments[0], walk = r.assignments[0];
  check("booked patient seen now", booked?.estimatedWaitMinutes === 0, booked);
  check("walk-in waits behind booked patient (30 min)", walk?.estimatedWaitMinutes === 30, walk); }

// 2. Walk-in that doesn't fit before the next booked slot goes after it (not dropped).
{ const s = base({ providers: [doc(1, "available")], walkInQueue: [pt(20, { durationMinutes: 30 })], upcomingScheduledAppointments: [pt(11, { visitType: "scheduled", status: "scheduled", doctorId: 1, scheduledStartAt: at(10), durationMinutes: 15, checkedInAt: null })] });
  const r = simulateClinic(s, now);
  check("walk-in placed after the 10-min booked slot (25 min)", r.assignments[0]?.estimatedWaitMinutes === 25, r); }

// 3. Short walk-in fits in the gap before the booked slot.
{ const s = base({ providers: [doc(1, "available")], walkInQueue: [pt(20, { durationMinutes: 10 })], upcomingScheduledAppointments: [pt(11, { visitType: "scheduled", status: "scheduled", doctorId: 1, scheduledStartAt: at(10), durationMinutes: 15, checkedInAt: null })] });
  check("short walk-in fits before booked slot", simulateClinic(s, now).assignments[0]?.estimatedWaitMinutes === 0, null); }

// 4. Two doctors: second walk-in goes to the other free doctor.
{ const s = base({ providers: [doc(1, "available"), doc(2, "available")], walkInQueue: [pt(20, { checkedInAt: at(-20) }), pt(21, { checkedInAt: at(-10) })] });
  const r = simulateClinic(s, now);
  check("two free doctors -> both walk-ins seen now", r.assignments.every(a => a.estimatedWaitMinutes === 0) && r.assignments[0].projectedDoctorId !== r.assignments[1].projectedDoctorId, r.assignments); }

// 5. Walk-in window ends before the doctor is free -> unassigned, wait null (not 0).
{ const s = base({ providers: [doc(1, "in_consult", { walkInBlockEndsAt: at(5) })], activeVisits: [pt(30, { status: "roomed", doctorId: 1, consultStartedAt: at(-5), durationMinutes: 30 })], walkInQueue: [pt(20, {})] });
  const p = predictClinic(s, now).predictions[0];
  check("no projection -> null wait with explanation", p.expectedWaitMinutes === null, p); }

// 6. In-consult doctor: free at consult start + duration.
{ const s = base({ providers: [doc(1, "in_consult")], activeVisits: [pt(30, { status: "roomed", doctorId: 1, consultStartedAt: at(-10), durationMinutes: 30 })], walkInQueue: [pt(20, {})] });
  check("waits for current consult to finish (20 min)", simulateClinic(s, now).assignments[0]?.estimatedWaitMinutes === 20, null); }

// 7. Overrun proportional, flagged.
{ const s = base({ providers: [doc(1, "in_consult")], activeVisits: [pt(30, { status: "roomed", doctorId: 1, consultStartedAt: at(-60), durationMinutes: 30 })], walkInQueue: [pt(20, {})] });
  const a = simulateClinic(s, now).assignments[0];
  check("overrun flagged with extra time", a?.delayStatus === "consult_overrun" && a.estimatedWaitMinutes > 0, a); }

// 8. Range: lower <= expected <= upper and not all equal when someone is ahead.
{ const s = base({ providers: [doc(1, "available")], walkInQueue: [pt(20, { checkedInAt: at(-20), durationMinutes: 40 }), pt(21, { checkedInAt: at(-10), durationMinutes: 40 })] });
  const p = predictClinic(s, now).predictions.find(x => x.appointmentId === 21)!;
  check("wait range spans", p.lowerWaitMinutes! < p.expectedWaitMinutes! && p.expectedWaitMinutes! < p.upperWaitMinutes!, p); }

// 9. Booked patient with unavailable doctor -> null.
{ const s = base({ providers: [doc(1, "unavailable")], scheduledQueue: [pt(10, { visitType: "scheduled", doctorId: 1, scheduledStartAt: at(0) })] });
  const p = predictClinic(s, now).predictions[0];
  check("unavailable doctor -> null + reason", p.expectedWaitMinutes === null && p.explanation[0].includes("unavailable"), p); }

// 10. Pending (not checked in) walk-in is behind checked-in ones; walk-in-now estimate after everyone.
{ const s = base({ providers: [doc(1, "available")], walkInQueue: [pt(20, {})], pendingWalkIns: [pt(22, { status: "scheduled", checkedInAt: null })] });
  const r = predictClinic(s, now);
  const pend = r.predictions.find(x => x.appointmentId === 22)!;
  check("pending walk-in projected behind checked-in (20)", pend.expectedWaitMinutes === 20, pend);
  check("walk-in-now estimate (40)", r.newWalkIn.expectedWaitMinutes === 40, r.newWalkIn); }

// 11. History overrides booked duration.
{ const s = base({ providers: [doc(1, "in_consult")], activeVisits: [pt(30, { status: "roomed", doctorId: 1, appointmentTypeId: 7, consultStartedAt: at(0), durationMinutes: 45 })], walkInQueue: [pt(20, {})], durationStats: { 7: { medianMinutes: 18, p25Minutes: 14, p75Minutes: 25, sampleSize: 12 } } });
  check("uses historical median (18) not booked 45", simulateClinic(s, now).assignments[0]?.estimatedWaitMinutes === 18, null); }

// 12. Manual walk-in stays with its doctor.
{ const s = base({ providers: [doc(1, "available"), doc(2, "in_consult")], activeVisits: [pt(30, { status: "roomed", doctorId: 2, consultStartedAt: at(0), durationMinutes: 15 })], walkInQueue: [pt(20, { assignmentMode: "manual", doctorId: 2 })] });
  const a = simulateClinic(s, now).assignments[0];
  check("manual walk-in waits for its doctor", a?.projectedDoctorId === 2 && a.estimatedWaitMinutes === 15, a); }

// ---- Schedule-aware behaviour (todayBlocks) ----
const block = (blockType: string, startMin: number, endMin: number) => ({ blockType, startAt: at(startMin), endAt: at(endMin) });

// 13. Walk-in before walk-in hours: waits for the walk-in block (policy: walk-in hours only).
//     With spillover switched on, it would use the doctor's free booked-session time now.
{ const s = base({ providers: [doc(1, "available", { walkInEligibleNow: false, walkInBlockEndsAt: null, todayBlocks: [block("scheduled", -60, 30), block("walk_in", 30, 150)] })], walkInQueue: [pt(20, {})] });
  const a = simulateClinic(s, now).assignments[0];
  check("default: walk-in waits for the walk-in block (30), no spillover", a?.estimatedWaitMinutes === 30 && !a.spillover, a);
  const b = simulateClinic(s, now, { allowSpillover: true }).assignments[0];
  check("spillover switched on: uses free booked-session time now", b?.estimatedWaitMinutes === 0 && b.spillover, b); }
{ const s = base({ providers: [doc(1, "available", { walkInEligibleNow: false, walkInBlockEndsAt: null, todayBlocks: [block("scheduled", -60, 30), block("walk_in", 30, 150)] })], walkInQueue: [pt(20, {})], upcomingScheduledAppointments: [pt(11, { visitType: "scheduled", status: "scheduled", doctorId: 1, scheduledStartAt: at(5), durationMinutes: 25, checkedInAt: null })] });
  const a = simulateClinic(s, now).assignments[0];
  check("booking fills the free time -> walk-in waits for walk-in block (30), not spillover", a?.estimatedWaitMinutes === 30 && !a.spillover, a); }

// 14. Booked patient who arrives before the doctor's shift: seen when the shift starts.
{ const s = base({ providers: [doc(1, "unavailable", { walkInEligibleNow: false, walkInBlockEndsAt: null, todayBlocks: [block("scheduled", 10, 180)] })], scheduledQueue: [pt(10, { visitType: "scheduled", doctorId: 1, scheduledStartAt: at(10) })] });
  const p = predictClinic(s, now).predictions[0];
  check("booked patient before shift -> seen at shift start (10 min)", p.expectedWaitMinutes === 10, p); }

// 15. Doctor unavailable DURING their shift (stepped away) -> can't estimate.
{ const s = base({ providers: [doc(1, "unavailable", { todayBlocks: [block("scheduled", -30, 180)] })], scheduledQueue: [pt(10, { visitType: "scheduled", doctorId: 1, scheduledStartAt: at(0) })] });
  check("doctor away mid-shift -> null", predictClinic(s, now).predictions[0].expectedWaitMinutes === null, null); }

// 16. Lunch is never used: a 20-min walk-in at 11:55 with lunch 12:00-13:00 goes after lunch.
{ const s = base({ providers: [doc(1, "available", { todayBlocks: [block("walk_in", -60, 5), block("blocked", 5, 65), block("walk_in", 65, 240)] })], walkInQueue: [pt(20, { durationMinutes: 20 })] });
  const lunchVisit = simulateClinic(s, now).assignments[0];
  check("walk-in skips lunch (65 min)", lunchVisit?.estimatedWaitMinutes === 65, null);
  check("lunch is not counted as a patient ahead", lunchVisit?.patientsAhead === 0, lunchVisit); }

// 17. Walk-in still doing forms can't be roomed before check-in time (default 5 min after arrival).
{ const s = base({ providers: [doc(1, "available")], pendingWalkIns: [pt(22, { status: "scheduled", checkedInAt: null, arrivedAt: at(-1) })] });
  check("pending walk-in waits for forms (4 min)", simulateClinic(s, now).assignments[0]?.estimatedWaitMinutes === 4, null); }

// 18. Late, not-arrived booked patient does not push back a booked patient who is waiting.
{ const s = base({ providers: [doc(1, "available")], scheduledQueue: [pt(10, { visitType: "scheduled", doctorId: 1, scheduledStartAt: at(5) })], upcomingScheduledAppointments: [pt(11, { visitType: "scheduled", status: "scheduled", doctorId: 1, scheduledStartAt: at(-5), durationMinutes: 30, checkedInAt: null })] });
  check("late not-arrived booking ignored -> waiting patient seen at their 5-min appointment time", predictClinic(s, now).predictions[0].expectedWaitMinutes === 5, null); }

// Early booked patient (appointment in 60 min) does not jump ahead of walk-ins.
{ const s = base({ providers: [doc(1, "available")], scheduledQueue: [pt(10, { visitType: "scheduled", doctorId: 1, assignmentMode: "manual", scheduledStartAt: at(60), durationMinutes: 30, checkedInAt: at(-2) })], walkInQueue: [pt(20, { checkedInAt: at(-10), durationMinutes: 15 }), pt(21, { checkedInAt: at(-5), durationMinutes: 15 })] });
  const r = predictClinic(s, now);
  const booked = r.predictions.find((x) => x.appointmentId === 10)!;
  const w1 = r.predictions.find((x) => x.appointmentId === 20)!;
  const w2 = r.predictions.find((x) => x.appointmentId === 21)!;
  check("early booked patient waits for appointment time (60), walk-ins seen first (0, 15)", booked.expectedWaitMinutes === 60 && w1.expectedWaitMinutes === 0 && w2.expectedWaitMinutes === 15, { booked, w1, w2 }); }

// ---- End of walk-in hours ----
// One doctor, walk-in hours end in 50 min, evening block 3h later.
const endOfHours = () => doc(1, "available", { todayBlocks: [block("walk_in", -60, 50), block("scheduled", 50, 170), block("walk_in", 195, 435)] });

// 19. Near the cutoff the range is capped at the block end, not the evening block.
// 4th walk-in: expected start 45 (fits); if visits run long it may start past 50 (risk flag);
// the likely range only covers runs where they are seen in this block.
{ const s = base({ providers: [endOfHours()], walkInQueue: [1, 2, 3, 4].map((n) => pt(20 + n, { checkedInAt: at(-40 + n), durationMinutes: 15 })) });
  const p = predictClinic(s, now).predictions.find((x) => x.appointmentId === 24)!;
  check("cutoff: expected 45, range stays inside the block (<= 50), risk flagged", p.expectedWaitMinutes === 45 && p.upperWaitMinutes! <= 50 && p.lowerWaitMinutes! < 45 && p.mayMissWalkInHours && p.walkInBlock?.status === "current", p); }

// 20. Overflow beyond the cutoff -> next block, marked "later", walk-in-now status "full".
// 5th walk-in would start at 60 -> past 50 -> next walk-in hours (195).
// (With spillover switched on it would take free booked-session time at 60.)
{ const s = base({ providers: [endOfHours()], walkInQueue: [1, 2, 3, 4, 5].map((n) => pt(20 + n, { checkedInAt: at(-40 + n), durationMinutes: 15 })) });
  const r = predictClinic(s, now);
  const last = r.predictions.find((x) => x.appointmentId === 25)!;
  check("overflow walk-in waits for next walk-in hours (195), marked 'later'", last.expectedWaitMinutes === 195 && last.walkInBlock?.status === "later" && !last.spillover, last);
  const spill = simulateClinic(s, now, { allowSpillover: true }).assignments.find((x) => x.appointmentId === 25);
  check("spillover switched on: overflow takes free time at 60", spill?.estimatedWaitMinutes === 60 && spill.spillover, spill);
  check("walk-in-now is 'full' with next opening and 0 spots", r.newWalkIn.status === "full" && r.newWalkIn.spotsLeft === 0 && r.newWalkIn.nextOpeningAt !== null, r.newWalkIn); }

// 21. Spots left counts walk-ins that can still FINISH before hours end (50 min / 20-min default visits: 0-20, 20-40).
{ const s = base({ providers: [endOfHours()] });
  const r = predictClinic(s, now);
  check("empty clinic: 2 spots left (finish by 50)", r.newWalkIn.status === "open" && r.newWalkIn.spotsLeft === 2, r.newWalkIn); }

// 22. Before walk-in hours start -> 'not_started'.
{ const s = base({ providers: [doc(1, "available", { walkInEligibleNow: false, walkInBlockEndsAt: null, todayBlocks: [block("scheduled", -60, 60), block("walk_in", 60, 180)] })] });
  const r = predictClinic(s, now);
  check("walk-in hours not started -> 'not_started' at +60", r.newWalkIn.status === "not_started" && r.newWalkIn.expectedWaitMinutes === 60, r.newWalkIn); }

// ---- Walk-in admission (Add Walk-In) ----
// Hours end in 50 min; two 15-min walk-ins already waiting (busy 0-30).
const admissionState = () => base({ providers: [endOfHours()], walkInQueue: [pt(20, { checkedInAt: at(-20), durationMinutes: 15 }), pt(21, { checkedInAt: at(-10), durationMinutes: 15 })] });

{ const a = checkWalkInAdmission(admissionState(), now, { appointmentTypeId: null, durationMinutes: 15, assignmentMode: "auto", doctorId: null });
  check("admission: 15-min visit fits (30-45, hours end 50)", a.status === "fits" && a.fits && a.expectedWaitMinutes === 30, a); }

{ const a = checkWalkInAdmission(admissionState(), now, { appointmentTypeId: null, durationMinutes: 45, assignmentMode: "auto", doctorId: null });
  check("admission: 45-min visit runs over by 25 min (30-75 vs 50)", a.status === "runs_over" && !a.fits && a.overrunMinutes === 25 && a.nextOpeningAt !== null, a); }

{ const s = base({ providers: [endOfHours()], walkInQueue: [1, 2, 3, 4].map((n) => pt(20 + n, { checkedInAt: at(-40 + n), durationMinutes: 15 })) });
  const a = checkWalkInAdmission(s, now, { appointmentTypeId: null, durationMinutes: 15, assignmentMode: "auto", doctorId: null });
  check("admission: queue fills hours -> full with next opening (195)", a.status === "full" && !a.fits && a.expectedWaitMinutes === 195, a); }

{ const s = base({ providers: [endOfHours(), doc(2, "available", { todayBlocks: [block("walk_in", -60, 50)] })], walkInQueue: [pt(20, { checkedInAt: at(-20), assignmentMode: "manual", doctorId: 1, durationMinutes: 15 })] });
  const a = checkWalkInAdmission(s, now, { appointmentTypeId: null, durationMinutes: 45, assignmentMode: "manual", doctorId: 1 });
  check("admission: manual to a doctor who cannot finish in time -> runs_over by 10", a.status === "runs_over" && a.projectedDoctorId === 1 && a.overrunMinutes === 10, a); }

// ---- Relocation: no preferred doctor ----
// Two doctors in walk-in hours. Dr 1 would take the walk-in first...
const relocationDoctors = (doctor1Status: ClinicStateProvider["status"]) => [
  doc(1, doctor1Status, { todayBlocks: [block("walk_in", -60, 120)] }),
  doc(2, "in_consult", { todayBlocks: [block("walk_in", -60, 120)] }),
];
const relocationVisits = [pt(31, { status: "roomed", doctorId: 2, consultStartedAt: at(-10), durationMinutes: 20 })];

{ const s = base({ providers: relocationDoctors("available"), activeVisits: relocationVisits, walkInQueue: [pt(20, {})] });
  const a = simulateClinic(s, now).assignments[0];
  check("relocation baseline: walk-in projected to free Dr 1 now", a?.projectedDoctorId === 1 && a.estimatedWaitMinutes === 0, a); }

// ...then Dr 1 steps away during walk-in hours: the walk-in moves to Dr 2 (free in 10 min).
{ const s = base({ providers: relocationDoctors("unavailable"), activeVisits: relocationVisits, walkInQueue: [pt(20, {})] });
  const a = simulateClinic(s, now).assignments[0];
  check("doctor steps away -> auto walk-in relocates to Dr 2 (10 min)", a?.projectedDoctorId === 2 && a.estimatedWaitMinutes === 10 && !a.spillover, a); }

// A walk-in assigned to Dr 1 by choice (manual) is not moved.
{ const s = base({ providers: relocationDoctors("unavailable"), activeVisits: relocationVisits, walkInQueue: [pt(20, { assignmentMode: "manual", doctorId: 1 })] });
  const p = predictClinic(s, now).predictions[0];
  check("preferred (manual) doctor away -> stays with them, no estimate", p.expectedWaitMinutes === null, p); }

console.log(`\n${pass} passed, ${fail} failed`);
