-- Walk-ins accepted although their visit is expected to run past the end
-- of walk-in hours (staff override in Add Walk-In). Shown as "short visit"
-- to staff, doctors and the patient, and countable in analytics.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS walk_in_capacity_override BOOLEAN NOT NULL DEFAULT FALSE;
