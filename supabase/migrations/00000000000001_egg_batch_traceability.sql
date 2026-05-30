-- Egg Batch Operational Traceability Module
-- Extends egg_batches table with comprehensive reception, inspection, and assignment workflow

-- ============================================================================
-- ALTER EXISTING TABLES
-- ============================================================================

-- Extend egg_batches table with additional operational fields
ALTER TABLE egg_batches
ADD COLUMN IF NOT EXISTS date_received timestamp with time zone,
ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS breed_type varchar(255),
ADD COLUMN IF NOT EXISTS invoice_number varchar(100),
ADD COLUMN IF NOT EXISTS contact_person varchar(255),
ADD COLUMN IF NOT EXISTS supplier_phone varchar(50),
ADD COLUMN IF NOT EXISTS supplier_location text,
ADD COLUMN IF NOT EXISTS loading_offloading_cost numeric(12,2) NOT NULL DEFAULT 0 CHECK (loading_offloading_cost >= 0),
ADD COLUMN IF NOT EXISTS responsible_technician uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS inspection_status varchar(50) NOT NULL DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS inspection_completed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS cracked_eggs integer NOT NULL DEFAULT 0 CHECK (cracked_eggs >= 0),
ADD COLUMN IF NOT EXISTS dirty_eggs integer NOT NULL DEFAULT 0 CHECK (dirty_eggs >= 0),
ADD COLUMN IF NOT EXISTS rejected_eggs integer NOT NULL DEFAULT 0 CHECK (rejected_eggs >= 0),
ADD COLUMN IF NOT EXISTS accepted_eggs integer CHECK (accepted_eggs >= 0),
ADD COLUMN IF NOT EXISTS cost_per_accepted_egg numeric(12,4),
ADD COLUMN IF NOT EXISTS inspection_notes text;

-- Update total_initial_cost calculation to include loading/offloading
-- (This will be handled by application logic for existing records)

-- ============================================================================
-- NEW TABLES
-- ============================================================================

-- Batch inspection details (for traceability and audit)
CREATE TABLE IF NOT EXISTS batch_inspection_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid NOT NULL REFERENCES egg_batches(id) ON DELETE CASCADE,
    cracked_eggs integer NOT NULL CHECK (cracked_eggs >= 0),
    dirty_eggs integer NOT NULL CHECK (dirty_eggs >= 0),
    rejected_eggs integer NOT NULL CHECK (rejected_eggs >= 0),
    accepted_eggs integer NOT NULL CHECK (accepted_eggs > 0),
    inspection_notes text,
    inspected_by uuid NOT NULL REFERENCES user_profiles(id) ON DELETE SET NULL,
    inspected_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL
);

CREATE INDEX idx_batch_inspection_records_batch ON batch_inspection_records(batch_id);
CREATE INDEX idx_batch_inspection_records_inspected_at ON batch_inspection_records(inspected_at DESC);

-- Batch attachment/photo storage metadata
CREATE TABLE IF NOT EXISTS batch_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid NOT NULL REFERENCES egg_batches(id) ON DELETE CASCADE,
    attachment_type varchar(50) NOT NULL, -- 'INVOICE', 'INSPECTION_PHOTO', 'DOCUMENT', 'OTHER'
    file_name varchar(255) NOT NULL,
    file_size_bytes integer CHECK (file_size_bytes > 0),
    mime_type varchar(100),
    storage_path varchar(500) NOT NULL, -- Path in Supabase Storage
    uploaded_by uuid NOT NULL REFERENCES user_profiles(id) ON DELETE SET NULL,
    uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
    description text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL
);

CREATE INDEX idx_batch_attachments_batch ON batch_attachments(batch_id);
CREATE INDEX idx_batch_attachments_type ON batch_attachments(attachment_type);
CREATE INDEX idx_batch_attachments_uploaded_at ON batch_attachments(uploaded_at DESC);

-- Batch incubation assignments (separate for multi-step workflow)
CREATE TABLE IF NOT EXISTS batch_incubation_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid NOT NULL REFERENCES egg_batches(id) ON DELETE CASCADE,
    incubator_id uuid NOT NULL REFERENCES incubators(id) ON DELETE RESTRICT,
    responsible_technician uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    set_date timestamp with time zone NOT NULL,
    expected_hatch_date timestamp with time zone NOT NULL,
    assignment_notes text,
    assigned_by uuid NOT NULL REFERENCES user_profiles(id) ON DELETE SET NULL,
    assigned_at timestamp with time zone NOT NULL DEFAULT now(),
    actual_set_date timestamp with time zone,
    hatch_date_adjusted_at timestamp with time zone,
    status varchar(50) NOT NULL DEFAULT 'ASSIGNED', -- 'ASSIGNED', 'TRANSFERRED', 'COMPLETED', 'CANCELLED'
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
    CHECK (expected_hatch_date > set_date),
    CHECK (hatch_date_adjusted_at IS NULL OR hatch_date_adjusted_at >= assigned_at)
);

CREATE INDEX idx_batch_incubation_assignments_batch ON batch_incubation_assignments(batch_id);
CREATE INDEX idx_batch_incubation_assignments_incubator ON batch_incubation_assignments(incubator_id);
CREATE INDEX idx_batch_incubation_assignments_status ON batch_incubation_assignments(status);
CREATE INDEX idx_batch_incubation_assignments_assigned_at ON batch_incubation_assignments(assigned_at DESC);

-- Batch acquisition cost breakdown
CREATE TABLE IF NOT EXISTS batch_acquisition_costs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid NOT NULL REFERENCES egg_batches(id) ON DELETE CASCADE,
    cost_type varchar(50) NOT NULL, -- 'EGG_PURCHASE', 'TRANSPORT', 'LOADING_OFFLOADING', 'MISCELLANEOUS'
    amount numeric(12,2) NOT NULL CHECK (amount >= 0),
    currency char(3) NOT NULL DEFAULT 'KES',
    description text,
    cost_date date NOT NULL,
    recorded_by uuid NOT NULL REFERENCES user_profiles(id) ON DELETE SET NULL,
    recorded_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL
);

CREATE INDEX idx_batch_acquisition_costs_batch ON batch_acquisition_costs(batch_id);
CREATE INDEX idx_batch_acquisition_costs_cost_type ON batch_acquisition_costs(cost_type);
CREATE INDEX idx_batch_acquisition_costs_recorded_at ON batch_acquisition_costs(recorded_at DESC);

-- ============================================================================
-- TRIGGERS & AUTO-CALCULATION FUNCTIONS
-- ============================================================================

-- Calculate accepted_eggs when inspection completes
CREATE OR REPLACE FUNCTION calculate_accepted_eggs()
RETURNS TRIGGER AS $$
BEGIN
    -- Set accepted_eggs = quantity_received - (cracked + dirty + rejected)
    NEW.accepted_eggs := NEW.quantity_received - (NEW.cracked_eggs + NEW.dirty_eggs + NEW.rejected_eggs);
    
    -- Validate that accepted eggs is not negative
    IF NEW.accepted_eggs < 0 THEN
        RAISE EXCEPTION 'Rejected eggs exceed quantity received';
    END IF;
    
    -- Update inspection_status when inspection is completed
    IF NEW.inspection_status = 'COMPLETED' AND NEW.inspection_completed_at IS NULL THEN
        NEW.inspection_completed_at := now();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on egg_batches for accepted_eggs calculation
DROP TRIGGER IF EXISTS trg_calculate_accepted_eggs ON egg_batches;
CREATE TRIGGER trg_calculate_accepted_eggs
BEFORE INSERT OR UPDATE ON egg_batches
FOR EACH ROW
WHEN (NEW.inspection_status = 'COMPLETED')
EXECUTE FUNCTION calculate_accepted_eggs();

-- Calculate cost_per_accepted_egg
CREATE OR REPLACE FUNCTION calculate_cost_per_accepted_egg()
RETURNS TRIGGER AS $$
DECLARE
    total_cost numeric(12,2);
BEGIN
    IF NEW.accepted_eggs IS NOT NULL AND NEW.accepted_eggs > 0 THEN
        total_cost := (NEW.egg_purchase_cost + NEW.transport_cost + NEW.loading_offloading_cost + NEW.misc_initial_cost);
        NEW.cost_per_accepted_egg := total_cost / NEW.accepted_eggs;
        NEW.total_initial_cost := total_cost;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update cost calculations
DROP TRIGGER IF EXISTS trg_update_cost_calculations ON egg_batches;
CREATE TRIGGER trg_update_cost_calculations
BEFORE INSERT OR UPDATE ON egg_batches
FOR EACH ROW
WHEN (NEW.accepted_eggs IS NOT NULL)
EXECUTE FUNCTION calculate_cost_per_accepted_egg();

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_egg_batches_inspection_status ON egg_batches(inspection_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_egg_batches_received_at ON egg_batches(date_received DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_egg_batches_batch_number ON egg_batches(batch_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_egg_batches_supplier_received ON egg_batches(supplier_id, date_received DESC) WHERE deleted_at IS NULL;
