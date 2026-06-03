-- Stable keys for generated operational task alerts.

ALTER TABLE alert_events
ADD COLUMN IF NOT EXISTS alert_key text;

ALTER TABLE alert_events
ADD COLUMN IF NOT EXISTS source varchar(50);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_alert_events_alert_key'
    ) THEN
        ALTER TABLE alert_events
        ADD CONSTRAINT uq_alert_events_alert_key UNIQUE (alert_key);
    END IF;
END;
$$;
