BEGIN;

CREATE OR REPLACE FUNCTION expire_inventory_reservations()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  expired_count integer;
BEGIN
  WITH expired AS (
    UPDATE inventory_reservations
    SET status = 'EXPIRED', updated_at = now()
    WHERE status = 'ACTIVE'
      AND expires_at <= now()
    RETURNING tenant_id, variant_id, quantity
  ), released AS (
    SELECT tenant_id, variant_id, sum(quantity)::integer AS quantity
    FROM expired
    GROUP BY tenant_id, variant_id
  ), inventory_update AS (
    UPDATE inventory_levels inventory
    SET reserved = greatest(0, inventory.reserved - released.quantity),
        version = inventory.version + 1,
        updated_at = now()
    FROM released
    WHERE inventory.tenant_id = released.tenant_id
      AND inventory.variant_id = released.variant_id
    RETURNING inventory.tenant_id
  )
  SELECT count(*)::integer INTO expired_count FROM expired;

  RETURN expired_count;
END;
$$;

CREATE OR REPLACE FUNCTION expire_simulated_payments()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  expired_count integer;
BEGIN
  WITH expired AS (
    UPDATE payments
    SET status = 'EXPIRED', updated_at = now()
    WHERE status IN ('PENDING', 'AUTHORIZED')
      AND updated_at < now() - interval '30 minutes'
      AND (left(provider, 5) = 'fake_' OR provider = 'pix')
    RETURNING id, tenant_id, provider
  ), recorded AS (
    INSERT INTO payment_events (
      tenant_id,
      payment_id,
      provider_event_id,
      provider_status,
      normalized_status,
      payload,
      occurred_at
    )
    SELECT
      tenant_id,
      id,
      'reconcile-' || id,
      'expired',
      'EXPIRED',
      jsonb_build_object('source', 'supabase_cron', 'provider', provider),
      now()
    FROM expired
    ON CONFLICT (tenant_id, provider_event_id) DO NOTHING
    RETURNING payment_id
  )
  SELECT count(*)::integer INTO expired_count FROM expired;

  RETURN expired_count;
END;
$$;

COMMIT;

