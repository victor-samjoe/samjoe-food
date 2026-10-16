-- Static PIX key for stores that want manual PIX (no Mercado Pago integration)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS pix_key text;
