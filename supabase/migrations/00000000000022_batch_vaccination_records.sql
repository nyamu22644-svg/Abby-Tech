-- Records vaccines completed for a batch.
-- Due/upcoming vaccine work is derived automatically from business_settings.required_vaccination_rules.

CREATE TABLE IF NOT EXISTS batch_vaccination_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
    batch_id uuid NOT NULL REFERENCES egg_batches(id) ON DELETE CASCADE,
    vaccine_name varchar(255) NOT NULL,
    due_day integer NOT NULL DEFAULT 0 CHECK (due_day >= 0),
    due_date date NOT NULL,
    cost_per_chick numeric(12,2) NOT NULL DEFAULT 0 CHECK (cost_per_chick >= 0),
    completed_at timestamp with time zone NOT NULL DEFAULT now(),
    notes text,
    recorded_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    UNIQUE (batch_id, vaccine_name, due_day)
);

CREATE INDEX IF NOT EXISTS idx_batch_vaccination_records_batch ON batch_vaccination_records(batch_id, due_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_batch_vaccination_records_due ON batch_vaccination_records(due_date, completed_at) WHERE deleted_at IS NULL;

ALTER TABLE batch_vaccination_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated access batch_vaccination_records" ON batch_vaccination_records;
CREATE POLICY "authenticated access batch_vaccination_records" ON batch_vaccination_records
FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS set_updated_at_batch_vaccination_records ON batch_vaccination_records;
CREATE TRIGGER set_updated_at_batch_vaccination_records
BEFORE UPDATE ON batch_vaccination_records
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
