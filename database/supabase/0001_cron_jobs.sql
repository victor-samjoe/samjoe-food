-- Aplicar somente no Supabase depois de validar as funções em staging.
-- O histórico dos jobs fica disponível em cron.job_run_details.

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'foodapp-expire-inventory-reservations',
  '*/5 * * * *',
  'SELECT public.expire_inventory_reservations()'
);

SELECT cron.schedule(
  'foodapp-expire-simulated-payments',
  '*/15 * * * *',
  'SELECT public.expire_simulated_payments()'
);

