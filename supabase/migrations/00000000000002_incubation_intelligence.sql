-- Migration for Incubation Intelligence

CREATE TYPE incubator_type AS ENUM ('SETTER', 'HATCHER', 'BROODER');
CREATE TYPE incubator_operational_status AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE');
CREATE TYPE incubator_maintenance_status AS ENUM ('GOOD', 'DUE_FOR_MAINTENANCE', 'NEEDS_REPAIR');

CREATE TABLE IF NOT EXISTS incubators (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    name varchar(255) NOT NULL,
    type incubator_type NOT NULL,
    controller_model varchar(255),
    capacity integer NOT NULL CHECK (capacity > 0),
    operational_status incubator_operational_status NOT NULL DEFAULT 'ACTIVE',
    maintenance_status incubator_maintenance_status NOT NULL DEFAULT 'GOOD',
    last_maintenance_date timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS incubator_environmental_logs (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    incubator_id uuid NOT NULL REFERENCES incubators(id) ON DELETE CASCADE,
    batch_id uuid REFERENCES egg_batches(id) ON DELETE SET NULL,
    temperature numeric(5,2),
    humidity numeric(5,2),
    turning_status varchar(50),
    power_source varchar(50),
    alarm_state varchar(100),
    notes text,
    recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    recorded_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_incubator_logs_incubator_id ON incubator_environmental_logs(incubator_id);

CREATE TYPE alert_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE alert_status AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED');

CREATE TABLE IF NOT EXISTS incubation_alerts (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    incubator_id uuid REFERENCES incubators(id) ON DELETE CASCADE,
    batch_id uuid REFERENCES egg_batches(id) ON DELETE CASCADE,
    title varchar(255) NOT NULL,
    description text NOT NULL,
    severity alert_severity NOT NULL,
    status alert_status NOT NULL DEFAULT 'ACTIVE',
    triggered_at timestamp with time zone NOT NULL DEFAULT now(),
    resolved_at timestamp with time zone,
    resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_incubation_alerts_status ON incubation_alerts(status);

-- Ensure incubator_id in egg_batches references incubators
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_egg_batches_incubator_id'
    ) THEN
        ALTER TABLE egg_batches
        ADD CONSTRAINT fk_egg_batches_incubator_id FOREIGN KEY (incubator_id) REFERENCES incubators(id) ON DELETE SET NULL;
    END IF;
END $$;
