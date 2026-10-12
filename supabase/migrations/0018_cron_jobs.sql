-- O histórico dos jobs fica disponível em cron.job_run_details no Supabase.
-- Em um PostgreSQL local sem pg_cron, a migration não agenda jobs.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron';
    EXECUTE $schedule$
      SELECT cron.schedule(
        'foodapp-expire-inventory-reservations',
        '*/5 * * * *',
        'SELECT public.expire_inventory_reservations()'
      )
    $schedule$;
    EXECUTE $schedule$
      SELECT cron.schedule(
        'foodapp-expire-simulated-payments',
        '*/15 * * * *',
        'SELECT public.expire_simulated_payments()'
      )
    $schedule$;
  END IF;
END
$$;

