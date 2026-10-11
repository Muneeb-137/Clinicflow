# Testing wait-time predictions

There are two levels of testing. Do them in this order:

1. **Automated checks:** about a minute for the engine tests, about 10 minutes for the accuracy report. No setup.
2. **Live test in the real app:** confirm the screens update in real time with real check-ins and roomings.

---

## How the engine decides (what you are checking)

For every doctor, the engine works out **when they are next free**:

| Doctor's situation | Next free |
|---|---|
| Available | Now |
| In consult, and gave a "ready in N min" | That time |
| In consult, within the visit's expected length | Consult start + expected length |
| In consult, **past** the expected length (running over) | Now + 25% of the visit length (min 5 min). This is flagged "Doctor still in consultation" and recalculated every minute. |
| Unavailable, shift not started yet | Start of their next schedule block |
| Unavailable during their shift (stepped away) | Unknown, so no estimate |

The expected length is the booked length until there are 8 or more completed visits of that type with a recorded end time. After that it's the typical (median) real length.

Then it fills each doctor's timeline:

1. **Booked patients first**, on their own doctor, in appointment-time order. A booked patient's turn starts at their **appointment time**, even if they arrive early; the doctor uses the time before it for walk-ins. A late patient is seen as soon as the doctor is free. If the doctor is behind, the booked patient waits. Lunch and blocked time are skipped.
2. **Walk-ins, first come first served.** Each one goes to the doctor who can start them earliest, inside one of that doctor's walk-in blocks today, and only if the doctor has a room. A walk-in never delays a booked patient. If a walk-in doesn't fit before a booking, it goes after it.
   - A walk-in assigned to a specific doctor (manual) only waits for that doctor.
   - A walk-in still doing forms can't start until their expected check-in time (the clinic's typical forms time, 5 min by default).
   - If two doctors can start at the same moment, the one whose walk-in block ends sooner gets the patient.

The **likely range** comes from playing the queue out 150 times with realistic, mixed visit lengths and taking the middle 60% of the waits. It describes when the patient is seen *if* they are seen in their walk-in block. If at least 1 in 5 of those runs misses walk-in hours, the screens show **"May run past walk-in hours (ends 3:00 PM)"** instead of stretching the range.

### When a waiting walk-in won't be seen before walk-in hours end

Walk-ins are seen only during walk-in hours. The Live Queue flags these patients with a **Choose next step** button, which offers two options:

- **Next available doctor:** the earliest walk-in hours of any doctor, for example "Dr. Thompson at 5:15 PM".
- **A specific doctor:** that doctor's next walk-in hours.

The times are simulated with the rest of the queue, so they're realistic. The patient keeps their place in line either way, and can step out and come back.

### Walk-in capacity (Add Walk-In)

A new walk-in is accepted for the current walk-in hours only if their visit is expected to **finish** before walk-in hours end. The check uses that visit type's length and everyone already waiting.

- **Fits:** "Fits — est. wait ~N min, finished by about h:mm".
- **Would run over, or hours are full:** a warning with the end time (or next opening). Staff can choose **Add anyway (short visit)**. The visit is then flagged **Short visit** for staff, the doctor and the patient.
- **Server re-check:** the server checks again when the walk-in is saved, so an out-of-date screen can't skip the rule.
- **Same rule everywhere:** "Spots left" and "If you walk in now" use the same must-finish rule.
- **Walk-ins already waiting** keep their place. They only need to *start* before walk-in hours end.

---

## 1. Automated checks

In `clinicflow-server`:

```bash
npm run test:engine
```

There are 20 scenario checks, covering doctors running over, "ready at" estimates, booked patients first, walk-ins moved after a booking, later walk-in blocks, shift start, lunch, forms time, manual walk-ins, late bookings, and the time-zone change. **All must pass.**

```bash
npm run eval:waittime
```

This plays 20 simulated clinic days per scenario (quiet, normal and busy) where the true waits are known, and scores the engine:

- **avg error:** how far off it was.
- **within 10m:** share of predictions within 10 minutes of the real wait.
- **in range:** share of real waits inside the "likely" range. The range is the middle 60% of simulated outcomes, so around 65–80% is well calibrated; much higher means the range is too wide to be useful.
- **naive avg error:** the error of the simple "today's average so far" guess.

The engine should beat the naive guess clearly. Current results:

| Scenario | Walk-in avg error | Naive guess | In range |
|---|---|---|---|
| Quiet | ~3 min | ~20 min | ~93% |
| Normal | ~9 min | ~66 min | ~77% |
| Busy | ~12 min | ~110 min | ~71% |

The last table replays your real history. It only means something once real clinic days are recorded (consults started and completed in the app).

---

## 2. Live test in the real app

This checks that the real screens update **in real time** with real actions.

### Setup (about 5 minutes)

1. **Two doctors** with portal logins (Doctor A and Doctor B). Open their **Doctor Status** pages in separate browsers or private windows.
2. As admin, on **Provider Status**: set both to **Available** and **assign each a room** for today.
3. **Both must be inside a walk-in block right now.** Schedules have no editing screen yet. If no walk-in block covers the current time, add a temporary one in the database, then remove it after testing:

   ```sql
   -- Add an all-day walk-in block for today (replace the doctor ids):
   INSERT INTO doctor_schedule_blocks
     (doctor_id, day_of_week, start_time, end_time, block_type, block_reason, is_active)
   VALUES
     (1, EXTRACT(DOW FROM CURRENT_DATE)::int, '00:00', '23:59', 'walk_in', 'other', TRUE),
     (2, EXTRACT(DOW FROM CURRENT_DATE)::int, '00:00', '23:59', 'walk_in', 'other', TRUE);

   -- Remove after testing (matches only these test blocks):
   DELETE FROM doctor_schedule_blocks
   WHERE block_type = 'walk_in'
     AND block_reason = 'other'
     AND start_time = '00:00'
     AND end_time = '23:59';
   ```

   I checked both statements against your database inside a transaction that was rolled back, so nothing was saved. No existing block matches the delete.

4. Keep **Current Queue** open in one window and the **Dashboard** in another.
5. Use **Follow-up (15 min)** and **General Consultation (30 min)** visit types, so the expected lengths are easy to check.

Times below assume the booked lengths are being used (fewer than 8 recorded consults per type).

### Test steps and expected results

| # | Do this | Expect (Current Queue / Dashboard) |
|---|---|---|
| 1 | Add walk-in **W1** (Follow-up, auto-assign), complete forms, **Check In**. | W1 shows **Ready now** with a projected doctor. Dashboard "walk in now" is about 0 min. |
| 2 | **Move to Room** W1. | W1 goes to the projected doctor (say A). A shows In consult. |
| 3 | Add **W2** (General, auto), check in. | W2 is projected to **Doctor B**, Ready now. |
| 4 | Room W2. | Both doctors are busy. |
| 5 | Add **W3** (Follow-up), check in. | W3 is projected to **Doctor A** with about 15 min minus the time since W1 was roomed. A range is shown. |
| 6 | Add **W4** (Follow-up), check in. | W4 goes to whichever doctor frees up next (A after W3, or B after W2). Its wait is longer than W3's. |
| 7 | Add **W5** with forms **not** done. | W5 shows an estimate (behind W4) that includes the forms time. |
| 8 | Let Doctor A go **past 15 minutes** in W1 without completing. | Within a minute (auto-refresh), W3 shows the **consult-overrun** note. Its estimate stays at a few minutes and does not drop to 0. Patients behind it move later. |
| 9 | In Doctor A's **Doctor Status** page, a **"When will you be ready?"** prompt appears. Choose **10 minutes**. | W3's estimate becomes about **10 min**. Everyone queued behind Doctor A shifts by the same amount. |
| 10 | Doctor A clicks **Complete Visit** for W1. | W3 changes to **Ready now** for Doctor A immediately, without a refresh. |
| 11 | **Book** a patient **P1** (Follow-up) with Doctor B for about 5 minutes from now. Check them in. | P1 waits for Doctor B's current visit to end. Walk-ins projected to B move **after** P1. |
| 12 | Add walk-in **W6** with **manual** assignment to the busier doctor. | W6 waits for that doctor only, even if the other is free. |
| 12a | Near the end of walk-in hours, open **Add Walk-In** and pick a **Follow-up (15 min)**, then a **Complex (45 min)**. | The 15-min visit says **Fits** while the 45-min one warns it would end after walk-in hours. **Add anyway** saves it with a **Short visit** badge, visible on the doctor's queue too. |
| 12b | Book a patient for **3:00 PM** and check them in at 2:00 PM, while walk-ins wait for the same doctor. | The booked patient's estimate points to **3:00 PM**; walk-ins are seen before then. |
| 13 | On **Provider Status**, set Doctor B **Unavailable** (with no patient roomed). | Patients waiting only for B show **Can't estimate**. Auto walk-ins move to Doctor A. |
| 14 | Open the **patient** Live Queue as W3's patient (if they have a portal login). | "Your estimated wait" matches the staff queue for W3. |

Note on step 13: Unavailable is refused while a patient is roomed with that doctor. Complete or cancel the visit first.

### Clean up

- Complete or cancel the test visits.
- Run the DELETE statement from setup step 3 to remove the test schedule blocks.
- The test visits appear in analytics. Cancel them, or use a date range that excludes today, when reviewing real numbers.

### If something looks wrong

Note the time, the patient, what the queue showed and what you expected.. Hover the estimate on the Live Queue to see the engine's reasons. Check whether it's the data, for example a doctor left In consult or no room assigned.
