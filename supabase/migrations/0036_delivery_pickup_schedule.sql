-- 0036: delivery_immediate_enabled + pickup_schedule
-- Admin 19: flag para pausar entrega imediata sem afetar a configuração de frete
-- Admin 20: flag + JSONB de datas/horários para retirada agendada

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS delivery_immediate_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS pickup_schedule_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pickup_schedule            JSONB;
