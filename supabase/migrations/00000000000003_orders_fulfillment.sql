-- Migration for Orders & Fulfillment Intelligence

CREATE TABLE IF NOT EXISTS customers (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    name varchar(255) NOT NULL,
    phone varchar(50),
    location varchar(255),
    business_name varchar(255),
    is_repeat_customer boolean NOT NULL DEFAULT false,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

ALTER TABLE orders
ADD COLUMN customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
ADD COLUMN notes text,
ADD COLUMN expected_hatch_date timestamp with time zone,
ADD COLUMN price_per_chick numeric(12,2) DEFAULT 0,
ADD COLUMN amount_paid numeric(12,2) DEFAULT 0;

-- Adjust orders constraints if necessary, but keep it flexible
-- Since existing rows might have NULL customer_id, we just leave it nullable for now

-- Let's define an audit table for order timeline
CREATE TYPE order_action_type AS ENUM ('CREATED', 'PAYMENT_RECEIVED', 'STATUS_UPDATED', 'DISPATCHED', 'CANCELLED', 'NOTES_ADDED');

CREATE TABLE IF NOT EXISTS order_audit_logs (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    action order_action_type NOT NULL,
    description text NOT NULL,
    performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_order_audit_logs_order_id ON order_audit_logs(order_id);
