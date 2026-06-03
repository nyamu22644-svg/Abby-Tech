-- Smart batch intake and incubator placement support.
-- Adds typed receiver names and slot-level incubator allocation records.

ALTER TABLE egg_batches
ADD COLUMN IF NOT EXISTS received_by_name varchar(255),
ADD COLUMN IF NOT EXISTS placement_summary text;

ALTER TABLE incubators
ADD COLUMN IF NOT EXISTS columns_count integer NOT NULL DEFAULT 6 CHECK (columns_count > 0),
ADD COLUMN IF NOT EXISTS tray_rows integer NOT NULL DEFAULT 2 CHECK (tray_rows > 0),
ADD COLUMN IF NOT EXISTS eggs_per_slot integer NOT NULL DEFAULT 88 CHECK (eggs_per_slot > 0);

UPDATE incubators
SET capacity = COALESCE(capacity, columns_count * tray_rows * eggs_per_slot)
WHERE capacity IS NULL;

CREATE TABLE IF NOT EXISTS batch_incubator_allocations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid NOT NULL REFERENCES egg_batches(id) ON DELETE CASCADE,
    incubator_id uuid NOT NULL REFERENCES incubators(id) ON DELETE RESTRICT,
    column_number integer NOT NULL CHECK (column_number > 0),
    row_number integer NOT NULL CHECK (row_number > 0),
    slot_capacity integer NOT NULL CHECK (slot_capacity > 0),
    eggs_allocated integer NOT NULL CHECK (eggs_allocated > 0),
    assigned_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    assigned_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    UNIQUE (incubator_id, column_number, row_number, batch_id)
);

CREATE INDEX IF NOT EXISTS idx_batch_incubator_allocations_batch
ON batch_incubator_allocations(batch_id);

CREATE INDEX IF NOT EXISTS idx_batch_incubator_allocations_incubator
ON batch_incubator_allocations(incubator_id);
