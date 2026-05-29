-- Migration for Financial Foundation

-- Add financial fields to egg_batches
ALTER TABLE egg_batches
ADD COLUMN egg_purchase_cost numeric(12,2) DEFAULT 0,
ADD COLUMN transport_cost numeric(12,2) DEFAULT 0,
ADD COLUMN misc_initial_cost numeric(12,2) DEFAULT 0,
ADD COLUMN total_initial_cost numeric(12,2) DEFAULT 0;

-- Create operational_costs table
CREATE TABLE IF NOT EXISTS operational_costs (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    batch_id uuid NOT NULL REFERENCES egg_batches(id) ON DELETE CASCADE,
    category varchar(255) NOT NULL,
    description text NOT NULL,
    amount numeric(12,2) NOT NULL,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

-- Index for faster batch-level cost lookups
CREATE INDEX IF NOT EXISTS idx_operational_costs_batch_id ON operational_costs(batch_id);

-- Add support for orders financial total (if not already there)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'total_amount') THEN
        ALTER TABLE orders ADD COLUMN total_amount numeric(12,2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'balance_due') THEN
        ALTER TABLE orders ADD COLUMN balance_due numeric(12,2) DEFAULT 0;
    END IF;
END
$$;
