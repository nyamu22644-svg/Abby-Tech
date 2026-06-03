-- Device-level ingest keys for ESP/IoT telemetry posts.
-- The raw key is never stored; server code stores a SHA-256 hash.

ALTER TABLE devices
ADD COLUMN IF NOT EXISTS ingest_token_hash text;

CREATE INDEX IF NOT EXISTS idx_devices_serial_active
ON devices(serial_number)
WHERE deleted_at IS NULL;
