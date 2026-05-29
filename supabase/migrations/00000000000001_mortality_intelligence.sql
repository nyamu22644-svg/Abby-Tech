-- Migration for Mortality Intelligence

-- Enum types for Mortality
CREATE TYPE mortality_stage AS ENUM ('INCUBATION', 'HATCHING', 'BROODER', 'TRANSPORT');
CREATE TYPE mortality_cause AS ENUM ('OVERHEATING', 'HUMIDITY_FAILURE', 'POWER_FAILURE', 'DISEASE', 'WEAK_HATCH', 'DEFORMITY', 'CRUSHING', 'UNKNOWN', 'OTHER');

-- Create mortality_events table
CREATE TABLE IF NOT EXISTS mortality_events (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    batch_id uuid NOT NULL REFERENCES egg_batches(id) ON DELETE CASCADE,
    stage mortality_stage NOT NULL,
    cause mortality_cause NOT NULL,
    count integer NOT NULL CHECK (count > 0),
    notes text,
    photo_url text,
    estimated_financial_loss numeric(12,2) DEFAULT 0,
    recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    recorded_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_mortality_events_batch_id ON mortality_events(batch_id);
CREATE INDEX IF NOT EXISTS idx_mortality_events_recorded_at ON mortality_events(recorded_at);

-- Add aggregated mortality fields to egg_batches for quick access
ALTER TABLE egg_batches
ADD COLUMN mortality_count integer DEFAULT 0,
ADD COLUMN total_financial_loss numeric(12,2) DEFAULT 0;
