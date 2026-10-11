-- Long-visit limit: at most this many long (45+ minute)
-- booked visits per doctor per day, so complex visits can't
-- crowd out short ones. NULL = no limit. Safe to run more
-- than once.
ALTER TABLE doctor_schedule_settings
  ADD COLUMN IF NOT EXISTS max_long_visits_per_day INTEGER
    CHECK (max_long_visits_per_day IS NULL OR max_long_visits_per_day >= 0);
