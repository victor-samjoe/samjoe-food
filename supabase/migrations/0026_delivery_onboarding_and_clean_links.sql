BEGIN;

ALTER TABLE stores
  ADD COLUMN delivery_status text NOT NULL DEFAULT 'PENDING'
  CHECK (delivery_status IN ('PENDING', 'ACTIVE'));

UPDATE stores store
SET delivery_status = 'ACTIVE'
WHERE store.origin_address ?& ARRAY['street', 'number', 'district', 'city', 'state', 'postal_code']
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_each_text(store.origin_address) field
    WHERE field.key = ANY(ARRAY['street', 'number', 'district', 'city', 'state', 'postal_code'])
      AND btrim(field.value) = ''
  )
  AND EXISTS (
    SELECT 1 FROM delivery_pricing_rules rule
    WHERE rule.tenant_id = store.tenant_id AND rule.store_id = store.id AND rule.is_active
  );

UPDATE control_plane.client_systems system
SET base_url = 'https://lojas.samjoe.com.br/' || (
      SELECT store.slug FROM stores store
      WHERE store.tenant_id = system.external_tenant_id
      ORDER BY store.created_at LIMIT 1
    ),
    updated_at = now()
WHERE system.system_code = 'food_app'
  AND system.environment = 'PRODUCTION'
  AND system.external_tenant_id IS NOT NULL;

COMMIT;
