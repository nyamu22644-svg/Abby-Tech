-- Order inventory handover quantities and lightweight sales intelligence fields.

ALTER TABLE order_dispatches
ADD COLUMN IF NOT EXISTS handover_quantity integer CHECK (handover_quantity IS NULL OR handover_quantity > 0);

CREATE INDEX IF NOT EXISTS idx_order_dispatches_order_created
ON order_dispatches(order_id, created_at DESC);

ALTER TABLE egg_batches
ADD COLUMN IF NOT EXISTS daily_holding_cost_per_chick numeric(12,4) NOT NULL DEFAULT 0 CHECK (daily_holding_cost_per_chick >= 0);
