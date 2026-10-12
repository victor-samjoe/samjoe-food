BEGIN;

INSERT INTO tenants (id, name, slug, timezone)
VALUES ('10000000-0000-4000-8000-000000000010', 'Doce Horizonte Demo', 'doce-horizonte-demo', 'America/Sao_Paulo');

INSERT INTO stores (id, tenant_id, name, slug, timezone, origin_address)
VALUES (
  '10000000-0000-4000-8000-000000000011',
  '10000000-0000-4000-8000-000000000010',
  'Centro',
  'doce-horizonte-centro',
  'America/Sao_Paulo',
  '{"street":"Rua da Demonstração","number":"100","district":"Centro","city":"Cidade Exemplo","state":"SP","postal_code":"01000000"}'::jsonb
);

INSERT INTO categories (id, tenant_id, store_id, name, slug, sort_order)
VALUES (
  '10000000-0000-4000-8000-000000000012',
  '10000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000011',
  'Bolos no pote',
  'bolos-no-pote',
  1
);

INSERT INTO products (id, tenant_id, store_id, category_id, name, description)
VALUES
  ('10000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000012', 'Bolo no pote Aurora', 'Massa de chocolate e creme de baunilha.'),
  ('10000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000012', 'Bolo no pote Jardim', 'Massa branca e creme de frutas vermelhas.');

INSERT INTO product_variants (id, tenant_id, product_id, sku, name, attributes, price_cents, inventory_policy)
VALUES
  ('10000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000013', 'DEMO-AURORA-250', '250 ml', '{"size":"250 ml","flavor":"chocolate e baunilha"}'::jsonb, 1200, 'TRACKED'),
  ('10000000-0000-4000-8000-000000000016', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000014', 'DEMO-JARDIM-250', '250 ml', '{"size":"250 ml","flavor":"frutas vermelhas"}'::jsonb, 1350, 'UNLIMITED');

INSERT INTO inventory_levels (tenant_id, variant_id, on_hand, reserved)
VALUES ('10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000015', 20, 0);

INSERT INTO customers (id, tenant_id, name, phone_e164, email)
VALUES (
  '10000000-0000-4000-8000-000000000040',
  '10000000-0000-4000-8000-000000000010',
  'Cliente Demonstração',
  '+5511000000001',
  'cliente@example.test'
);

INSERT INTO tenants (id, name, slug, timezone)
VALUES ('20000000-0000-4000-8000-000000000010', 'Sabor Nuvem Demo', 'sabor-nuvem-demo', 'America/Sao_Paulo');

INSERT INTO stores (id, tenant_id, name, slug, timezone, origin_address)
VALUES (
  '20000000-0000-4000-8000-000000000011',
  '20000000-0000-4000-8000-000000000010',
  'Jardins',
  'sabor-nuvem-jardins',
  'America/Sao_Paulo',
  '{"street":"Avenida Fictícia","number":"200","district":"Jardins","city":"Cidade Exemplo","state":"SP","postal_code":"02000000"}'::jsonb
);

INSERT INTO categories (id, tenant_id, store_id, name, slug, sort_order)
VALUES (
  '20000000-0000-4000-8000-000000000012',
  '20000000-0000-4000-8000-000000000010',
  '20000000-0000-4000-8000-000000000011',
  'Salgados',
  'salgados',
  1
);

INSERT INTO products (id, tenant_id, store_id, category_id, name, description)
VALUES (
  '20000000-0000-4000-8000-000000000013',
  '20000000-0000-4000-8000-000000000010',
  '20000000-0000-4000-8000-000000000011',
  '20000000-0000-4000-8000-000000000012',
  'Empada Nuvem',
  'Massa amanteigada com recheio fictício de palmito.'
);

INSERT INTO product_variants (id, tenant_id, product_id, sku, name, attributes, price_cents, inventory_policy)
VALUES (
  '20000000-0000-4000-8000-000000000015',
  '20000000-0000-4000-8000-000000000010',
  '20000000-0000-4000-8000-000000000013',
  'DEMO-EMPADA-PALMITO',
  'Palmito',
  '{"flavor":"palmito"}'::jsonb,
  900,
  'UNLIMITED'
);

INSERT INTO users (id, email, display_name, password_hash)
VALUES
  (
    '30000000-0000-4000-8000-000000000001',
    'admin@doce-horizonte.example.test',
    'Administrador Demo',
    crypt('demo-local-only', gen_salt('bf', 8))
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    'viewer@sabor-nuvem.example.test',
    'Visualizador Demo',
    crypt('demo-local-only', gen_salt('bf', 8))
  );

INSERT INTO tenant_memberships (tenant_id, user_id, role)
VALUES
  ('10000000-0000-4000-8000-000000000010', '30000000-0000-4000-8000-000000000001', 'OWNER'),
  ('20000000-0000-4000-8000-000000000010', '30000000-0000-4000-8000-000000000002', 'VIEWER');

INSERT INTO delivery_pricing_rules (
  id, tenant_id, store_id, version, base_fee_cents, included_meters,
  price_per_extra_km_cents, standard_radius_meters, maximum_radius_meters,
  exception_fee_cents
)
VALUES
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000011', 'demo-2026-10-v1', 500, 3000, 200, 5000, 10000, 400),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000011', 'demo-2026-10-v1', 600, 3000, 250, 6000, 12000, 300);

COMMIT;

