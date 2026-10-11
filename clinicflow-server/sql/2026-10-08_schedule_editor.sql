-- Schedule editor: time off and clinic holidays.
--
-- doctor_schedule_blocks stays the weekly template (which
-- hours each weekday are booked appointments, walk-ins or
-- blocked). doctor_time_off removes hours on specific
-- dates: a doctor's vacation or appointment, or (doctor_id
-- NULL) a day the whole clinic is closed.
--
-- effective_schedule_blocks(date) is what every schedule
-- query reads: the weekly blocks for that date's weekday
-- with any time off cut out (returned as blocked time,
-- reason 'time_off'). Safe to run more than once.

CREATE TABLE IF NOT EXISTS doctor_time_off (
  time_off_id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- NULL = the whole clinic is closed (holiday).
  doctor_id     INTEGER REFERENCES doctors (doctor_id) ON DELETE CASCADE,

  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,

  -- Both NULL = all day. Otherwise these hours on each
  -- day of the range.
  start_time    TIME,
  end_time      TIME,

  reason        VARCHAR(200),

  created_by_staff_user_id INTEGER
    REFERENCES staff_users (staff_user_id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT doctor_time_off_dates CHECK (end_date >= start_date),
  CONSTRAINT doctor_time_off_hours CHECK (
    (start_time IS NULL AND end_time IS NULL)
    OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )
);

CREATE INDEX IF NOT EXISTS doctor_time_off_dates_idx
  ON doctor_time_off (start_date, end_date);


CREATE OR REPLACE FUNCTION effective_schedule_blocks(p_date DATE)
RETURNS TABLE (
  schedule_block_id INTEGER,
  doctor_id         INTEGER,
  day_of_week       SMALLINT,
  start_time        TIME,
  end_time          TIME,
  block_type        VARCHAR,
  block_reason      VARCHAR,
  is_active         BOOLEAN
)
LANGUAGE sql
STABLE
AS $$
  WITH blocks AS (
    SELECT b.*
    FROM doctor_schedule_blocks AS b
    WHERE b.is_active = TRUE
      AND b.day_of_week = EXTRACT(DOW FROM p_date)::INTEGER
  ),
  time_off AS (
    SELECT
      b.schedule_block_id,
      range_agg(
        tsrange(
          p_date + COALESCE(t.start_time, TIME '00:00'),
          CASE
            WHEN t.end_time IS NULL THEN (p_date + 1)::timestamp
            ELSE p_date + t.end_time
          END
        )
      ) AS hours_off
    FROM blocks AS b
    JOIN doctor_time_off AS t
      ON (t.doctor_id IS NULL OR t.doctor_id = b.doctor_id)
      AND p_date BETWEEN t.start_date AND t.end_date
    GROUP BY b.schedule_block_id
  )
  SELECT
    b.schedule_block_id,
    b.doctor_id,
    b.day_of_week,
    lower(piece)::time,
    upper(piece)::time,
    b.block_type,
    b.block_reason,
    TRUE
  FROM blocks AS b
  LEFT JOIN time_off AS o
    ON o.schedule_block_id = b.schedule_block_id
  CROSS JOIN LATERAL unnest(
    tsmultirange(tsrange(p_date + b.start_time, p_date + b.end_time))
    - COALESCE(o.hours_off, '{}'::tsmultirange)
  ) AS piece

  UNION ALL

  -- The hours taken off, as blocked time with reason
  -- "time_off", so schedules show why they are unavailable.
  SELECT
    b.schedule_block_id,
    b.doctor_id,
    b.day_of_week,
    lower(piece)::time,
    upper(piece)::time,
    'blocked'::varchar,
    'time_off'::varchar,
    TRUE
  FROM blocks AS b
  JOIN time_off AS o
    ON o.schedule_block_id = b.schedule_block_id
  CROSS JOIN LATERAL unnest(
    tsmultirange(tsrange(p_date + b.start_time, p_date + b.end_time))
    * o.hours_off
  ) AS piece
$$;
