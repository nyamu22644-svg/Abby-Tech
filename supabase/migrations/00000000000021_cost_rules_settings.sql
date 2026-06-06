-- Cost rules used to estimate batch cost automatically from daily hatchery work.
-- These are additive settings only; existing operational records are not changed.

ALTER TABLE business_settings
ADD COLUMN IF NOT EXISTS electricity_cost_per_unit numeric(12,2) NOT NULL DEFAULT 25 CHECK (electricity_cost_per_unit >= 0),
ADD COLUMN IF NOT EXISTS incubator_units_per_day numeric(10,2) NOT NULL DEFAULT 10 CHECK (incubator_units_per_day >= 0),
ADD COLUMN IF NOT EXISTS brooder_units_per_day numeric(10,2) NOT NULL DEFAULT 4 CHECK (brooder_units_per_day >= 0),
ADD COLUMN IF NOT EXISTS hatchery_labor_cost_per_day numeric(12,2) NOT NULL DEFAULT 0 CHECK (hatchery_labor_cost_per_day >= 0),
ADD COLUMN IF NOT EXISTS generator_fuel_cost_per_day numeric(12,2) NOT NULL DEFAULT 0 CHECK (generator_fuel_cost_per_day >= 0),
ADD COLUMN IF NOT EXISTS brooder_labor_cost_per_day numeric(12,2) NOT NULL DEFAULT 0 CHECK (brooder_labor_cost_per_day >= 0),
ADD COLUMN IF NOT EXISTS starter_feed_price_per_kg numeric(12,2) NOT NULL DEFAULT 80 CHECK (starter_feed_price_per_kg >= 0),
ADD COLUMN IF NOT EXISTS starter_feed_grams_per_chick_day numeric(10,2) NOT NULL DEFAULT 15 CHECK (starter_feed_grams_per_chick_day >= 0),
ADD COLUMN IF NOT EXISTS grower_feed_price_per_kg numeric(12,2) NOT NULL DEFAULT 80 CHECK (grower_feed_price_per_kg >= 0),
ADD COLUMN IF NOT EXISTS grower_feed_grams_per_chick_day numeric(10,2) NOT NULL DEFAULT 35 CHECK (grower_feed_grams_per_chick_day >= 0),
ADD COLUMN IF NOT EXISTS grower_feed_starts_day integer NOT NULL DEFAULT 8 CHECK (grower_feed_starts_day > 0),
ADD COLUMN IF NOT EXISTS holding_overhead_cost_per_day numeric(12,2) NOT NULL DEFAULT 0 CHECK (holding_overhead_cost_per_day >= 0),
ADD COLUMN IF NOT EXISTS target_profit_margin_percent numeric(5,2) NOT NULL DEFAULT 25 CHECK (target_profit_margin_percent >= 0),
ADD COLUMN IF NOT EXISTS required_vaccination_rules jsonb NOT NULL DEFAULT '[]'::jsonb;
