-- Abby Tech Smart Hatchery OS - Full Production Schema
-- Single source of truth for all operational domains
-- TABLE INVENTORY:
-- tenants, business_settings, sequence_counters
-- roles, permissions, role_permissions, user_profiles, user_roles
-- devices, device_assignments, device_metrics, device_readings, telemetry_ingest_queue
-- suppliers, customers, incubators, incubator_maintenance_logs, incubator_environmental_logs
-- egg_batches, batch_phase_definitions, batch_phase_events, hatch_results
-- mortality_events, operational_logs
-- reservations, orders, order_items, order_payments, order_dispatches
-- expense_categories, cost_entries, profitability_snapshots
-- alert_rules, alert_events, notifications, system_events
-- audit_logs, audit_log_changes
-- sync_outbox, sync_conflicts
-- AUDIT STRATEGY: audit_logs + audit_log_changes per field
-- SOFT DELETE STRATEGY: deleted_at on operational tables with partial indexes
-- SYNC STRATEGY: sync_version/client_updated_at/last_synced_at + sync_outbox/sync_conflicts
--
-- RELATIONSHIPS (selected):
-- user_profiles -> auth.users, roles (primary_role_id)
-- user_roles -> user_profiles, roles
-- devices -> user_profiles (registered_by)
-- device_assignments -> devices, incubators
-- incubator_environmental_logs -> incubators, egg_batches
-- egg_batches -> suppliers, incubators
-- batch_phase_events -> egg_batches, batch_phase_definitions
-- hatch_results -> egg_batches
-- mortality_events -> egg_batches
-- orders -> customers, reservations
-- order_items -> orders, egg_batches
-- order_payments -> orders
-- order_dispatches -> orders
-- cost_entries -> expense_categories, egg_batches, orders
-- profitability_snapshots -> egg_batches
-- alert_rules -> devices, incubators, device_metrics
-- alert_events -> alert_rules, devices, incubators, egg_batches, device_metrics
-- notifications -> user_profiles
-- audit_log_changes -> audit_logs

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE user_status AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');
CREATE TYPE supplier_status AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE incubator_type AS ENUM ('SETTER', 'HATCHER', 'BROODER');
CREATE TYPE incubator_status AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE');
CREATE TYPE maintenance_status AS ENUM ('GOOD', 'DUE_FOR_MAINTENANCE', 'NEEDS_REPAIR');
CREATE TYPE maintenance_type AS ENUM ('CLEANING', 'SERVICE', 'REPAIR', 'CALIBRATION', 'OTHER');
CREATE TYPE batch_status AS ENUM ('LOGGED', 'SETTER', 'HATCHER', 'BROODER', 'COMPLETED', 'FAILED', 'DISCARDED', 'CANCELLED');
CREATE TYPE phase_status AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'SKIPPED');
CREATE TYPE mortality_stage AS ENUM ('INCUBATION', 'HATCHING', 'BROODER', 'TRANSPORT');
CREATE TYPE mortality_cause AS ENUM ('OVERHEATING', 'HUMIDITY_FAILURE', 'POWER_FAILURE', 'DISEASE', 'WEAK_HATCH', 'DEFORMITY', 'CRUSHING', 'UNKNOWN', 'OTHER');
CREATE TYPE reservation_status AS ENUM ('ACTIVE', 'CONFIRMED', 'EXPIRED', 'CANCELLED');
CREATE TYPE order_status AS ENUM ('INQUIRY', 'RESERVED', 'CONFIRMED', 'ALLOCATED', 'READY_FOR_DISPATCH', 'DISPATCHED', 'DELIVERED', 'CANCELLED');
CREATE TYPE order_item_status AS ENUM ('UNALLOCATED', 'ALLOCATED', 'FULFILLED', 'CANCELLED');
CREATE TYPE payment_status AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'REFUNDED');
CREATE TYPE payment_method AS ENUM ('M_PESA', 'CASH', 'BANK_TRANSFER', 'CARD', 'OTHER');
CREATE TYPE payment_record_status AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');
CREATE TYPE dispatch_status AS ENUM ('PENDING', 'SCHEDULED', 'DISPATCHED', 'DELIVERED', 'FAILED');
CREATE TYPE expense_type AS ENUM ('EGG_PURCHASE', 'FEED', 'ELECTRICITY', 'FUEL', 'MEDICINE', 'VACCINE', 'LABOR', 'MAINTENANCE', 'TRANSPORT', 'OTHER');
CREATE TYPE profitability_snapshot_type AS ENUM ('BATCH', 'PERIOD');
CREATE TYPE alert_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE alert_status AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'SILENCED');
CREATE TYPE device_status AS ENUM ('ONLINE', 'OFFLINE', 'MAINTENANCE', 'DECOMMISSIONED');
CREATE TYPE device_type AS ENUM ('INCUBATOR_SENSOR', 'BROODER_SENSOR', 'ENVIRONMENT_SENSOR', 'POWER_MONITOR', 'GENERATOR_MONITOR', 'OTHER');
CREATE TYPE notification_channel AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'WHATSAPP', 'WEBHOOK');
CREATE TYPE notification_status AS ENUM ('QUEUED', 'SENT', 'FAILED', 'READ');
CREATE TYPE audit_action AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'ALLOCATION', 'PAYMENT', 'LOG_RECORDED', 'ALERT_TRIGGERED', 'SYNC_CONFLICT');
CREATE TYPE sync_operation AS ENUM ('INSERT', 'UPDATE', 'DELETE');
CREATE TYPE sync_status AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');
CREATE TYPE ingest_status AS ENUM ('PENDING', 'PROCESSED', 'FAILED');
CREATE TYPE system_event_severity AS ENUM ('INFO', 'WARN', 'ERROR', 'CRITICAL');
CREATE TYPE comparison_operator AS ENUM ('GT', 'GTE', 'LT', 'LTE', 'EQ', 'NEQ');

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TENANCY & CONFIGURATION
-- ============================================================================

CREATE TABLE tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(255) NOT NULL,
    legal_name varchar(255),
    timezone varchar(64) NOT NULL DEFAULT 'UTC',
    currency_code char(3) NOT NULL DEFAULT 'USD',
    country_code char(2),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone
);

CREATE INDEX idx_tenants_active ON tenants(is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_deleted_at ON tenants(deleted_at) WHERE deleted_at IS NULL;

CREATE TABLE business_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    business_name varchar(255) NOT NULL,
    timezone varchar(64) NOT NULL DEFAULT 'UTC',
    currency_code char(3) NOT NULL DEFAULT 'USD',
    default_incubation_days integer NOT NULL DEFAULT 21 CHECK (default_incubation_days > 0),
    default_hatch_rate_target numeric(5,2) NOT NULL DEFAULT 85.00 CHECK (default_hatch_rate_target >= 0),
    default_chick_price numeric(12,2) NOT NULL DEFAULT 0 CHECK (default_chick_price >= 0),
    alerts_enabled boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone
);

CREATE UNIQUE INDEX uq_business_settings_tenant ON business_settings(tenant_id);

CREATE TABLE sequence_counters (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    sequence_key varchar(64) NOT NULL,
    current_value bigint NOT NULL DEFAULT 0 CHECK (current_value >= 0),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_sequence_counters_key ON sequence_counters(tenant_id, sequence_key);

-- ============================================================================
-- IDENTITY & ACCESS
-- ============================================================================

CREATE TABLE roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
    role_code varchar(50) NOT NULL,
    role_name varchar(100) NOT NULL,
    description text,
    is_system boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid
);

CREATE UNIQUE INDEX uq_roles_code ON roles(tenant_id, role_code);

CREATE TABLE permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    permission_key varchar(150) NOT NULL UNIQUE,
    description text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid
);

CREATE TABLE role_permissions (
    role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
    email varchar(255) NOT NULL UNIQUE,
    first_name varchar(100),
    last_name varchar(100),
    phone varchar(50),
    status user_status NOT NULL DEFAULT 'INVITED',
    primary_role_id uuid REFERENCES roles(id) ON DELETE SET NULL,
    activated_at timestamp with time zone,
    deactivated_at timestamp with time zone,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid
);

CREATE INDEX idx_user_profiles_tenant ON user_profiles(tenant_id);
CREATE INDEX idx_user_profiles_status ON user_profiles(status) WHERE deleted_at IS NULL;

CREATE TABLE user_roles (
    user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    is_primary boolean NOT NULL DEFAULT false,
    assigned_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    assigned_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid,
    PRIMARY KEY (user_id, role_id)
);

CREATE UNIQUE INDEX uq_user_primary_role ON user_roles(user_id) WHERE is_primary = true;

-- ============================================================================
-- DEVICES & TELEMETRY
-- ============================================================================

CREATE TABLE devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
    device_type device_type NOT NULL,
    name varchar(255) NOT NULL,
    serial_number varchar(100) NOT NULL UNIQUE,
    mac_address varchar(50) UNIQUE,
    firmware_version varchar(50),
    status device_status NOT NULL DEFAULT 'OFFLINE',
    registered_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    installed_at timestamp with time zone,
    last_seen_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL
);

CREATE INDEX idx_devices_tenant ON devices(tenant_id);
CREATE INDEX idx_devices_status ON devices(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_devices_deleted_at ON devices(deleted_at) WHERE deleted_at IS NULL;

CREATE TABLE device_metrics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(100) NOT NULL UNIQUE,
    unit varchar(32),
    description text,
    min_value numeric(12,3),
    max_value numeric(12,3),
    is_alertable boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL
);

ALTER TABLE user_profiles
ADD CONSTRAINT fk_user_profiles_origin_device
FOREIGN KEY (origin_device_id) REFERENCES devices(id) ON DELETE SET NULL;

ALTER TABLE roles
ADD CONSTRAINT fk_roles_origin_device
FOREIGN KEY (origin_device_id) REFERENCES devices(id) ON DELETE SET NULL;

ALTER TABLE permissions
ADD CONSTRAINT fk_permissions_origin_device
FOREIGN KEY (origin_device_id) REFERENCES devices(id) ON DELETE SET NULL;

ALTER TABLE role_permissions
ADD CONSTRAINT fk_role_permissions_origin_device
FOREIGN KEY (origin_device_id) REFERENCES devices(id) ON DELETE SET NULL;

ALTER TABLE user_roles
ADD CONSTRAINT fk_user_roles_origin_device
FOREIGN KEY (origin_device_id) REFERENCES devices(id) ON DELETE SET NULL;

-- ============================================================================
-- HATCHERY OPERATIONS
-- ============================================================================

CREATE TABLE suppliers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
    name varchar(255) NOT NULL,
    contact_name varchar(255),
    phone varchar(50),
    email varchar(255),
    address text,
    city varchar(100),
    country varchar(100),
    status supplier_status NOT NULL DEFAULT 'ACTIVE',
    created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL
);

CREATE INDEX idx_suppliers_tenant ON suppliers(tenant_id);
CREATE INDEX idx_suppliers_status ON suppliers(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_suppliers_deleted_at ON suppliers(deleted_at) WHERE deleted_at IS NULL;

CREATE TABLE customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
    name varchar(255) NOT NULL,
    email varchar(255),
    phone varchar(50),
    address text,
    city varchar(100),
    country varchar(100),
    created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL
);

CREATE INDEX idx_customers_tenant ON customers(tenant_id);
CREATE INDEX idx_customers_name ON customers(name) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_deleted_at ON customers(deleted_at) WHERE deleted_at IS NULL;

CREATE TABLE incubators (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
    name varchar(255) NOT NULL,
    unit_code varchar(100),
    type incubator_type NOT NULL,
    capacity integer NOT NULL CHECK (capacity > 0),
    operational_status incubator_status NOT NULL DEFAULT 'ACTIVE',
    maintenance_status maintenance_status NOT NULL DEFAULT 'GOOD',
    controller_model varchar(255),
    serial_number varchar(100),
    location varchar(255),
    installed_at timestamp with time zone,
    created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL
);

CREATE INDEX idx_incubators_tenant ON incubators(tenant_id);
CREATE INDEX idx_incubators_status ON incubators(operational_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_incubators_deleted_at ON incubators(deleted_at) WHERE deleted_at IS NULL;

CREATE TABLE incubator_maintenance_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    incubator_id uuid NOT NULL REFERENCES incubators(id) ON DELETE CASCADE,
    maintenance_type maintenance_type NOT NULL,
    notes text,
    performed_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    performed_at timestamp with time zone NOT NULL DEFAULT now(),
    next_due_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
    CHECK (next_due_at IS NULL OR next_due_at >= performed_at)
);

CREATE INDEX idx_incubator_maintenance_incubator ON incubator_maintenance_logs(incubator_id, performed_at DESC);

CREATE TABLE device_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    incubator_id uuid NOT NULL REFERENCES incubators(id) ON DELETE CASCADE,
    assigned_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    assigned_at timestamp with time zone NOT NULL DEFAULT now(),
    unassigned_at timestamp with time zone,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
    CHECK ((is_active = true AND unassigned_at IS NULL) OR (is_active = false))
);

CREATE UNIQUE INDEX uq_device_active_assignment ON device_assignments(device_id) WHERE is_active = true;
CREATE INDEX idx_device_assignments_incubator ON device_assignments(incubator_id);

CREATE TABLE egg_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
    batch_number varchar(100) NOT NULL,
    supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
    incubator_id uuid REFERENCES incubators(id) ON DELETE SET NULL,
    quantity_received integer NOT NULL CHECK (quantity_received > 0),
    quantity_set integer CHECK (quantity_set >= 0),
    status batch_status NOT NULL DEFAULT 'LOGGED',
    set_date timestamp with time zone,
    expected_hatch_date timestamp with time zone,
    actual_hatch_date timestamp with time zone,
    quantity_hatched integer CHECK (quantity_hatched >= 0),
    quantity_culled integer CHECK (quantity_culled >= 0),
    mortality_count integer NOT NULL DEFAULT 0 CHECK (mortality_count >= 0),
    total_financial_loss numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_financial_loss >= 0),
    egg_purchase_cost numeric(12,2) NOT NULL DEFAULT 0 CHECK (egg_purchase_cost >= 0),
    transport_cost numeric(12,2) NOT NULL DEFAULT 0 CHECK (transport_cost >= 0),
    misc_initial_cost numeric(12,2) NOT NULL DEFAULT 0 CHECK (misc_initial_cost >= 0),
    total_initial_cost numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_initial_cost >= 0),
    notes text,
    created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
    UNIQUE (tenant_id, batch_number),
    CHECK (quantity_set IS NULL OR quantity_set <= quantity_received),
    CHECK (quantity_hatched IS NULL OR quantity_set IS NULL OR quantity_hatched <= quantity_set)
);

CREATE INDEX idx_egg_batches_tenant ON egg_batches(tenant_id);
CREATE INDEX idx_egg_batches_status ON egg_batches(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_egg_batches_incubator ON egg_batches(incubator_id);
CREATE INDEX idx_egg_batches_deleted_at ON egg_batches(deleted_at) WHERE deleted_at IS NULL;

CREATE TABLE incubator_environmental_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    incubator_id uuid NOT NULL REFERENCES incubators(id) ON DELETE CASCADE,
    batch_id uuid REFERENCES egg_batches(id) ON DELETE SET NULL,
    temperature numeric(5,2),
    humidity numeric(5,2),
    turning_status varchar(50),
    power_source varchar(50),
    alarm_state varchar(100),
    notes text,
    recorded_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    recorded_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL
);

CREATE INDEX idx_incubator_logs_incubator ON incubator_environmental_logs(incubator_id, recorded_at DESC);
CREATE INDEX idx_incubator_logs_batch ON incubator_environmental_logs(batch_id, recorded_at DESC);

CREATE TABLE batch_phase_definitions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
    name varchar(100) NOT NULL,
    phase_code varchar(50) NOT NULL,
    sequence integer NOT NULL CHECK (sequence > 0),
    default_duration_days integer CHECK (default_duration_days > 0),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_phase_definitions ON batch_phase_definitions(tenant_id, phase_code);

CREATE TABLE batch_phase_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid NOT NULL REFERENCES egg_batches(id) ON DELETE CASCADE,
    phase_id uuid NOT NULL REFERENCES batch_phase_definitions(id) ON DELETE RESTRICT,
    status phase_status NOT NULL DEFAULT 'ACTIVE',
    started_at timestamp with time zone NOT NULL DEFAULT now(),
    ended_at timestamp with time zone,
    recorded_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX idx_batch_phase_events_batch ON batch_phase_events(batch_id, started_at DESC);

CREATE TABLE hatch_results (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid NOT NULL REFERENCES egg_batches(id) ON DELETE CASCADE,
    total_set integer NOT NULL CHECK (total_set >= 0),
    total_hatched integer NOT NULL CHECK (total_hatched >= 0),
    total_culled integer NOT NULL CHECK (total_culled >= 0),
    hatch_rate numeric(5,2) NOT NULL CHECK (hatch_rate >= 0),
    recorded_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    recorded_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
    CHECK (total_hatched + total_culled <= total_set)
);

CREATE UNIQUE INDEX uq_hatch_results_batch ON hatch_results(batch_id);

CREATE TABLE mortality_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid NOT NULL REFERENCES egg_batches(id) ON DELETE CASCADE,
    stage mortality_stage NOT NULL,
    cause mortality_cause NOT NULL,
    count integer NOT NULL CHECK (count > 0),
    notes text,
    photo_url text,
    estimated_financial_loss numeric(12,2) NOT NULL DEFAULT 0 CHECK (estimated_financial_loss >= 0),
    recorded_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    recorded_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL
);

CREATE INDEX idx_mortality_events_batch ON mortality_events(batch_id, recorded_at DESC);

CREATE TABLE operational_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_type varchar(50) NOT NULL,
    entity_id uuid NOT NULL,
    log_type varchar(50) NOT NULL,
    notes text,
    recorded_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    recorded_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL
);

CREATE INDEX idx_operational_logs_entity ON operational_logs(entity_type, entity_id, recorded_at DESC);

-- ============================================================================
-- COMMERCIAL OPERATIONS
-- ============================================================================

CREATE TABLE reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
    customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    batch_id uuid REFERENCES egg_batches(id) ON DELETE SET NULL,
    quantity integer NOT NULL CHECK (quantity > 0),
    status reservation_status NOT NULL DEFAULT 'ACTIVE',
    reserved_at timestamp with time zone NOT NULL DEFAULT now(),
    expires_at timestamp with time zone,
    notes text,
    created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL
    ,CHECK (expires_at IS NULL OR expires_at >= reserved_at)
);

CREATE INDEX idx_reservations_customer ON reservations(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_reservations_status ON reservations(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_reservations_deleted_at ON reservations(deleted_at) WHERE deleted_at IS NULL;

CREATE TABLE orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
    order_number varchar(100) NOT NULL,
    customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL,
    status order_status NOT NULL DEFAULT 'INQUIRY',
    order_date timestamp with time zone NOT NULL DEFAULT now(),
    required_by_date timestamp with time zone,
    total_quantity integer NOT NULL CHECK (total_quantity > 0),
    subtotal_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
    discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    total_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    amount_paid numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    balance_due numeric(12,2) NOT NULL DEFAULT 0 CHECK (balance_due >= 0),
    payment_status payment_status NOT NULL DEFAULT 'PENDING',
    dispatch_status dispatch_status NOT NULL DEFAULT 'PENDING',
    notes text,
    created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
    UNIQUE (tenant_id, order_number),
    CHECK (total_amount >= amount_paid)
);

CREATE INDEX idx_orders_tenant ON orders(tenant_id);
CREATE INDEX idx_orders_customer ON orders(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_status ON orders(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_deleted_at ON orders(deleted_at) WHERE deleted_at IS NULL;

CREATE TABLE order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    batch_id uuid REFERENCES egg_batches(id) ON DELETE SET NULL,
    description varchar(255),
    quantity integer NOT NULL CHECK (quantity > 0),
    unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
    total_price numeric(12,2) NOT NULL CHECK (total_price >= 0),
    status order_item_status NOT NULL DEFAULT 'UNALLOCATED',
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_batch ON order_items(batch_id);

CREATE TABLE order_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    payment_method payment_method NOT NULL,
    status payment_record_status NOT NULL DEFAULT 'PENDING',
    amount numeric(12,2) NOT NULL CHECK (amount > 0),
    transaction_reference varchar(150),
    paid_at timestamp with time zone,
    recorded_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    recorded_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL
);

CREATE INDEX idx_order_payments_order ON order_payments(order_id, recorded_at DESC);

CREATE TABLE order_dispatches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status dispatch_status NOT NULL DEFAULT 'PENDING',
    carrier varchar(100),
    tracking_number varchar(150),
    vehicle_number varchar(50),
    driver_name varchar(100),
    driver_phone varchar(50),
    scheduled_at timestamp with time zone,
    dispatched_at timestamp with time zone,
    delivered_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL
    ,CHECK (dispatched_at IS NULL OR scheduled_at IS NULL OR dispatched_at >= scheduled_at)
    ,CHECK (delivered_at IS NULL OR dispatched_at IS NULL OR delivered_at >= dispatched_at)
);

CREATE INDEX idx_order_dispatches_order ON order_dispatches(order_id, created_at DESC);

-- ============================================================================
-- FINANCIAL INTELLIGENCE
-- ============================================================================

CREATE TABLE expense_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
    name varchar(100) NOT NULL,
    expense_type expense_type NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone
);

CREATE UNIQUE INDEX uq_expense_categories_name ON expense_categories(tenant_id, name);
CREATE INDEX idx_expense_categories_deleted_at ON expense_categories(deleted_at) WHERE deleted_at IS NULL;

CREATE TABLE cost_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
    category_id uuid NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
    batch_id uuid REFERENCES egg_batches(id) ON DELETE SET NULL,
    order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
    amount numeric(12,2) NOT NULL CHECK (amount > 0),
    description text,
    incurred_at timestamp with time zone NOT NULL DEFAULT now(),
    recorded_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL
);

CREATE INDEX idx_cost_entries_batch ON cost_entries(batch_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_cost_entries_order ON cost_entries(order_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_cost_entries_category ON cost_entries(category_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_cost_entries_deleted_at ON cost_entries(deleted_at) WHERE deleted_at IS NULL;

CREATE TABLE profitability_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
    snapshot_type profitability_snapshot_type NOT NULL,
    batch_id uuid REFERENCES egg_batches(id) ON DELETE SET NULL,
    period_start date,
    period_end date,
    total_cost numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
    total_revenue numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_revenue >= 0),
    gross_profit numeric(12,2) NOT NULL DEFAULT 0,
    cost_per_chick numeric(12,4) NOT NULL DEFAULT 0 CHECK (cost_per_chick >= 0),
    profit_per_chick numeric(12,4) NOT NULL DEFAULT 0,
    total_hatched integer NOT NULL DEFAULT 0 CHECK (total_hatched >= 0),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone
);

CREATE INDEX idx_profitability_snapshots_batch ON profitability_snapshots(batch_id, created_at DESC);

-- ============================================================================
-- TELEMETRY READINGS
-- ============================================================================

CREATE TABLE device_readings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    metric_id uuid NOT NULL REFERENCES device_metrics(id) ON DELETE RESTRICT,
    incubator_id uuid REFERENCES incubators(id) ON DELETE SET NULL,
    batch_id uuid REFERENCES egg_batches(id) ON DELETE SET NULL,
    value numeric(12,4) NOT NULL,
    recorded_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL
);

CREATE INDEX idx_device_readings_device ON device_readings(device_id, recorded_at DESC);
CREATE INDEX idx_device_readings_metric ON device_readings(metric_id, recorded_at DESC);

CREATE TABLE telemetry_ingest_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
    device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
    topic varchar(255) NOT NULL,
    payload_text text NOT NULL,
    status ingest_status NOT NULL DEFAULT 'PENDING',
    received_at timestamp with time zone NOT NULL DEFAULT now(),
    processed_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_telemetry_ingest_status ON telemetry_ingest_queue(status, received_at DESC);

-- ============================================================================
-- ALERTS & NOTIFICATIONS
-- ============================================================================

CREATE TABLE alert_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
    name varchar(255) NOT NULL,
    description text,
    device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
    incubator_id uuid REFERENCES incubators(id) ON DELETE SET NULL,
    metric_id uuid REFERENCES device_metrics(id) ON DELETE SET NULL,
    operator comparison_operator NOT NULL,
    threshold_value numeric(12,4) NOT NULL,
    severity alert_severity NOT NULL DEFAULT 'MEDIUM',
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL
);

CREATE INDEX idx_alert_rules_active ON alert_rules(is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_alert_rules_deleted_at ON alert_rules(deleted_at) WHERE deleted_at IS NULL;

CREATE TABLE alert_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
    alert_rule_id uuid REFERENCES alert_rules(id) ON DELETE SET NULL,
    device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
    incubator_id uuid REFERENCES incubators(id) ON DELETE SET NULL,
    batch_id uuid REFERENCES egg_batches(id) ON DELETE SET NULL,
    metric_id uuid REFERENCES device_metrics(id) ON DELETE SET NULL,
    observed_value numeric(12,4),
    severity alert_severity NOT NULL,
    status alert_status NOT NULL DEFAULT 'ACTIVE',
    title varchar(255) NOT NULL,
    description text,
    triggered_at timestamp with time zone NOT NULL DEFAULT now(),
    acknowledged_at timestamp with time zone,
    acknowledged_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    resolved_at timestamp with time zone,
    resolved_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL
);

CREATE INDEX idx_alert_events_status ON alert_events(status, triggered_at DESC);

CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
    user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    channel notification_channel NOT NULL,
    status notification_status NOT NULL DEFAULT 'QUEUED',
    subject varchar(255),
    message text NOT NULL,
    related_entity_type varchar(50),
    related_entity_id uuid,
    sent_at timestamp with time zone,
    read_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    sync_version integer NOT NULL DEFAULT 1 CHECK (sync_version >= 1),
    client_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL
);

CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);

CREATE TABLE system_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
    event_type varchar(100) NOT NULL,
    severity system_event_severity NOT NULL DEFAULT 'INFO',
    message text NOT NULL,
    entity_type varchar(50),
    entity_id uuid,
    created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL
);

CREATE INDEX idx_system_events_severity ON system_events(severity, created_at DESC);
CREATE INDEX idx_system_events_entity ON system_events(entity_type, entity_id, created_at DESC);

-- ============================================================================
-- AUDIT LOGGING
-- ============================================================================

CREATE TABLE audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_type varchar(50) NOT NULL,
    entity_id uuid NOT NULL,
    action audit_action NOT NULL,
    performed_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
    performed_at timestamp with time zone NOT NULL DEFAULT now(),
    ip_address varchar(64),
    user_agent text,
    request_id varchar(128),
    origin_device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id, performed_at DESC);
CREATE INDEX idx_audit_logs_performer ON audit_logs(performed_by, performed_at DESC);

CREATE TABLE audit_log_changes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_log_id uuid NOT NULL REFERENCES audit_logs(id) ON DELETE CASCADE,
    field_name varchar(100) NOT NULL,
    old_value text,
    new_value text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_changes_log ON audit_log_changes(audit_log_id);

-- ============================================================================
-- OFFLINE SYNCHRONIZATION
-- ============================================================================

CREATE TABLE sync_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
    table_name varchar(100) NOT NULL,
    record_id uuid NOT NULL,
    operation sync_operation NOT NULL,
    payload_checksum varchar(128),
    status sync_status NOT NULL DEFAULT 'PENDING',
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    last_error text,
    queued_at timestamp with time zone NOT NULL DEFAULT now(),
    processed_at timestamp with time zone,
    created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_sync_outbox_status ON sync_outbox(status, queued_at DESC);

CREATE TABLE sync_conflicts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE RESTRICT,
    table_name varchar(100) NOT NULL,
    record_id uuid NOT NULL,
    local_version integer NOT NULL,
    remote_version integer NOT NULL,
    conflict_detected_at timestamp with time zone NOT NULL DEFAULT now(),
    resolved_at timestamp with time zone,
    resolution_strategy varchar(50),
    resolved_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL
);

CREATE INDEX idx_sync_conflicts_table ON sync_conflicts(table_name, conflict_detected_at DESC);

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE TRIGGER set_updated_at_tenants
BEFORE UPDATE ON tenants
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_business_settings
BEFORE UPDATE ON business_settings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_sequence_counters
BEFORE UPDATE ON sequence_counters
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_roles
BEFORE UPDATE ON roles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_permissions
BEFORE UPDATE ON permissions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_user_profiles
BEFORE UPDATE ON user_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_devices
BEFORE UPDATE ON devices
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_device_metrics
BEFORE UPDATE ON device_metrics
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_suppliers
BEFORE UPDATE ON suppliers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_customers
BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_incubators
BEFORE UPDATE ON incubators
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_device_assignments
BEFORE UPDATE ON device_assignments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_egg_batches
BEFORE UPDATE ON egg_batches
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_batch_phase_definitions
BEFORE UPDATE ON batch_phase_definitions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_reservations
BEFORE UPDATE ON reservations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_orders
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_order_items
BEFORE UPDATE ON order_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_order_dispatches
BEFORE UPDATE ON order_dispatches
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_expense_categories
BEFORE UPDATE ON expense_categories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_cost_entries
BEFORE UPDATE ON cost_entries
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_alert_rules
BEFORE UPDATE ON alert_rules
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
