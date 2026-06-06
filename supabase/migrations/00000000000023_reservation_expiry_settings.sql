-- Business-controlled release window for unpaid reserved stock.

ALTER TABLE business_settings
ADD COLUMN IF NOT EXISTS reservation_expiry_days integer NOT NULL DEFAULT 3 CHECK (reservation_expiry_days >= 0);
