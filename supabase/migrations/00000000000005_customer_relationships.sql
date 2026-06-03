-- Customer relationship fields for sales history, preferences, and follow-up work.

ALTER TABLE customers
ADD COLUMN IF NOT EXISTS preferred_breed varchar(150),
ADD COLUMN IF NOT EXISTS preferred_payment_method payment_method,
ADD COLUMN IF NOT EXISTS relationship_notes text,
ADD COLUMN IF NOT EXISTS follow_up_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS follow_up_reason varchar(255),
ADD COLUMN IF NOT EXISTS customer_status varchar(50) NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_customers_follow_up_at
ON customers(follow_up_at)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_customer_status
ON customers(customer_status)
WHERE deleted_at IS NULL;
