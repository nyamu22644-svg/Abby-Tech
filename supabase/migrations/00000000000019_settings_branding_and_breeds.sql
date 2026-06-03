-- Persist operator-facing settings that must drive receipts, order copy, and
-- batch/order breed selection.

ALTER TABLE business_settings
ADD COLUMN IF NOT EXISTS receipt_title varchar(255),
ADD COLUMN IF NOT EXISTS receipt_tagline text,
ADD COLUMN IF NOT EXISTS receipt_phone varchar(50),
ADD COLUMN IF NOT EXISTS receipt_location text,
ADD COLUMN IF NOT EXISTS receipt_footer text,
ADD COLUMN IF NOT EXISTS receipt_show_system_branding boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS breed_options jsonb NOT NULL DEFAULT '[]'::jsonb;
