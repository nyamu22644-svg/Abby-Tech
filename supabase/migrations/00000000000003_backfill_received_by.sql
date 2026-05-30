-- Backfill received_by for batches that do not have it set
-- Uses created_by when available

UPDATE egg_batches
SET received_by = created_by
WHERE received_by IS NULL
  AND created_by IS NOT NULL;
