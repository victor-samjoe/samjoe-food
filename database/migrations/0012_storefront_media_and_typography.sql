BEGIN;

UPDATE stores
SET storefront_config = storefront_config || '{
  "logo_url": null,
  "font_family": "CLASSIC",
  "text_case": "AS_TYPED"
}'::jsonb;

COMMIT;
