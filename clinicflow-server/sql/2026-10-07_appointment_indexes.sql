-- Indexes for the queries every screen runs. Without them
-- each query reads the whole appointments table, which
-- grows by every visit ever recorded.
--
-- Safe to run more than once.

-- Today's queue, check-in, flow board, calendar and
-- analytics: "appointments on this date (in this status)".
CREATE INDEX IF NOT EXISTS appointments_date_status_idx
  ON appointments (appointment_date, status);

-- A doctor's day: schedules, availability, rooming.
CREATE INDEX IF NOT EXISTS appointments_doctor_date_idx
  ON appointments (doctor_id, appointment_date, start_time);

-- Patient history, "open visit today" check, patient
-- portal appointments.
CREATE INDEX IF NOT EXISTS appointments_patient_date_idx
  ON appointments (patient_id, appointment_date);

-- The missed-appointment sweep (runs every 30 seconds and
-- on page loads) only looks at booked visits still waiting.
CREATE INDEX IF NOT EXISTS appointments_pending_booked_idx
  ON appointments (appointment_date, start_time)
  WHERE status = 'scheduled' AND visit_type = 'scheduled';

-- End-of-day cleanup: visits still open.
CREATE INDEX IF NOT EXISTS appointments_open_visits_idx
  ON appointments (appointment_date)
  WHERE status IN ('checked_in', 'roomed');

-- Active holds per patient (portal hold limit).
CREATE INDEX IF NOT EXISTS appointment_holds_patient_active_idx
  ON appointment_holds (patient_id)
  WHERE status = 'active';

ANALYZE appointments;
ANALYZE appointment_holds;
