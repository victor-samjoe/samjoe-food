-- Sequential order counter per store for human-friendly order numbers (#S001, #S002…)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS order_counter integer NOT NULL DEFAULT 0;
