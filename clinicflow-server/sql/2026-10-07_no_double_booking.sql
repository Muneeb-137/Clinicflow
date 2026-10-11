-- Prevent double booking at the database level: a doctor cannot have two
-- ACTIVE booked appointments whose times overlap. Applies only to booked
-- (scheduled) visits that are still scheduled / checked in / roomed, so
-- completed, missed and cancelled history (including old test duplicates)
-- is untouched.
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'appointments_no_overlapping_active_bookings'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_no_overlapping_active_bookings
      EXCLUDE USING gist (
        doctor_id WITH =,
        tsrange(
          appointment_date + start_time,
          appointment_date + start_time
            + make_interval(mins => COALESCE(duration_minutes, 1))
        ) WITH &&
      )
      WHERE (
        visit_type = 'scheduled'
        AND status IN ('scheduled', 'checked_in', 'roomed')
        AND start_time IS NOT NULL
        AND doctor_id IS NOT NULL
      );
  END IF;
END $$;
