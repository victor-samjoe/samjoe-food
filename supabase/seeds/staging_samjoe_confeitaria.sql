BEGIN;

INSERT INTO tenants (id, name, slug, timezone, status)
VALUES (
  '51000000-0000-4000-8000-000000000001',
  'SamJoE Confeitaria',
  'samjoe-confeitaria',
  'America/Sao_Paulo',
  'ACTIVE'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  timezone = EXCLUDED.timezone,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO stores (
  id,
  tenant_id,
  name,
  slug,
  timezone,
  currency,
  status,
  storefront_config
)
SELECT
  '51000000-0000-4000-8000-000000000002',
  tenant.id,
  'SamJoE Confeitaria',
  'samjoe-confeitaria',
  'America/Sao_Paulo',
  'BRL',
  'ACTIVE',
  '{
    "brand_subtitle": "Confeitaria artesanal",
    "hero_eyebrow": "feito com carinho para momentos especiais",
    "hero_title": "Sabores que transformam momentos em memórias.",
    "hero_description": "Escolha seus favoritos e monte seu pedido.",
    "primary_color": "#9f3f35",
    "accent_color": "#e7b55f",
    "background_color": "#fffaf4",
    "hero_image_enabled": true,
    "hero_image_url": null,
    "hero_image_size": "MEDIUM",
    "hero_display_mode": "CORNER",
    "hero_images": [],
    "hero_section_size": "NORMAL",
    "hero_image_fit": "FILL",
    "logo_url": null,
    "font_family": "CLASSIC",
    "text_case": "AS_TYPED"
  }'::jsonb
FROM tenants AS tenant
WHERE tenant.slug = 'samjoe-confeitaria'
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  timezone = EXCLUDED.timezone,
  currency = EXCLUDED.currency,
  status = EXCLUDED.status,
  storefront_config = EXCLUDED.storefront_config,
  updated_at = now();

INSERT INTO store_domains (
  tenant_id,
  store_id,
  hostname,
  is_primary,
  status
)
SELECT
  store.tenant_id,
  store.id,
  'app.confeitaria.samjoe.com.br',
  false,
  'PENDING'
FROM stores AS store
WHERE store.slug = 'samjoe-confeitaria'
ON CONFLICT (lower(hostname)) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  store_id = EXCLUDED.store_id,
  is_primary = false,
  status = 'PENDING',
  verification_token = null,
  verified_at = null,
  updated_at = now();

COMMIT;
