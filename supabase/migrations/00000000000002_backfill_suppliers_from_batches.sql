-- Backfill suppliers from existing egg_batches records
-- Uses contact_person as supplier name when no supplier_id exists

WITH source AS (
  SELECT DISTINCT ON (
    tenant_id,
    COALESCE(NULLIF(contact_person, ''), 'Unknown Supplier'),
    COALESCE(supplier_phone, ''),
    COALESCE(supplier_location, '')
  )
    tenant_id,
    COALESCE(NULLIF(contact_person, ''), 'Unknown Supplier') AS name,
    NULLIF(contact_person, '') AS contact_name,
    NULLIF(supplier_phone, '') AS phone,
    NULLIF(supplier_location, '') AS address,
    created_by
  FROM egg_batches
  WHERE supplier_id IS NULL
    AND (
      contact_person IS NOT NULL
      OR supplier_phone IS NOT NULL
      OR supplier_location IS NOT NULL
    )
)
INSERT INTO suppliers (
  tenant_id,
  name,
  contact_name,
  phone,
  address,
  created_by,
  created_at,
  updated_at,
  sync_version
)
SELECT
  tenant_id,
  name,
  contact_name,
  phone,
  address,
  created_by,
  now(),
  now(),
  1
FROM source;

UPDATE egg_batches b
SET supplier_id = s.id
FROM suppliers s
WHERE b.supplier_id IS NULL
  AND b.tenant_id IS NOT DISTINCT FROM s.tenant_id
  AND COALESCE(NULLIF(b.contact_person, ''), 'Unknown Supplier') = s.name
  AND COALESCE(b.supplier_phone, '') = COALESCE(s.phone, '')
  AND COALESCE(b.supplier_location, '') = COALESCE(s.address, '');
