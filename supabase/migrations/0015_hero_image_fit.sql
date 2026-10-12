BEGIN;
UPDATE stores
SET storefront_config = storefront_config || '{"hero_image_fit": "FILL"}'::jsonb
WHERE storefront_config->>'hero_image_fit' IS NULL;
COMMIT;
