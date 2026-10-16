BEGIN;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS payments_pix_expiration_idx
  ON payments (expires_at)
  WHERE method = 'PIX' AND status IN ('CREATED', 'PENDING');

CREATE OR REPLACE FUNCTION expire_pix_payments()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  expired_payment record;
  expired_reservation record;
  expired_count integer := 0;
  order_cancelled boolean;
BEGIN
  FOR expired_payment IN
    UPDATE payments
       SET status = 'EXPIRED', updated_at = now()
     WHERE method = 'PIX'
       AND status IN ('CREATED', 'PENDING')
       AND expires_at IS NOT NULL
       AND expires_at <= now()
     RETURNING id, tenant_id, order_id, amount_cents, currency
  LOOP
    expired_count := expired_count + 1;

    INSERT INTO payment_events (
      tenant_id, payment_id, provider_event_id, provider_status,
      normalized_status, payload, occurred_at
    ) VALUES (
      expired_payment.tenant_id,
      expired_payment.id,
      'pix-expired-' || expired_payment.id,
      'expired',
      'EXPIRED',
      jsonb_build_object('source', 'supabase_cron', 'expires_at_reached', true),
      now()
    ) ON CONFLICT (tenant_id, provider_event_id) DO NOTHING;

    UPDATE orders
       SET status = 'CANCELLED', updated_at = now()
     WHERE id = expired_payment.order_id
       AND tenant_id = expired_payment.tenant_id
       AND status = 'PAYMENT_PENDING';
    order_cancelled := FOUND;

    IF order_cancelled THEN
      FOR expired_reservation IN
        UPDATE inventory_reservations
           SET status = 'EXPIRED', updated_at = now()
         WHERE tenant_id = expired_payment.tenant_id
           AND order_id = expired_payment.order_id
           AND status = 'ACTIVE'
         RETURNING variant_id, quantity
      LOOP
        UPDATE inventory_levels
           SET reserved = greatest(0, reserved - expired_reservation.quantity),
               version = version + 1,
               updated_at = now()
         WHERE tenant_id = expired_payment.tenant_id
           AND variant_id = expired_reservation.variant_id;
      END LOOP;

      INSERT INTO order_status_events (
        tenant_id, order_id, from_status, to_status, actor_type, reason
      ) VALUES (
        expired_payment.tenant_id,
        expired_payment.order_id,
        'PAYMENT_PENDING',
        'CANCELLED',
        'SYSTEM',
        'Prazo de 30 minutos do pagamento Pix expirado'
      );

      INSERT INTO integration_outbox (
        tenant_id, event_type, aggregate_type, aggregate_id, payload
      ) VALUES (
        expired_payment.tenant_id,
        'foodapp.order.status_changed.v1',
        'order',
        expired_payment.order_id,
        jsonb_build_object(
          'order_id', expired_payment.order_id,
          'from_status', 'PAYMENT_PENDING',
          'to_status', 'CANCELLED',
          'source', 'pix_expiration'
        )
      );
    END IF;
  END LOOP;

  RETURN expired_count;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
      FROM cron.job
     WHERE jobname = 'foodapp-expire-pix-payments';
    PERFORM cron.schedule(
      'foodapp-expire-pix-payments',
      '* * * * *',
      'SELECT public.expire_pix_payments()'
    );
  END IF;
END
$$;

COMMIT;
