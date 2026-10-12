BEGIN;

-- Add hero display mode, carousel images, and hero section size to storefront_config
UPDATE stores
SET storefront_config = storefront_config || jsonb_build_object(
  'hero_display_mode', 'CORNER',
  'hero_images', '[]'::jsonb,
  'hero_section_size', 'NORMAL'
)
WHERE storefront_config->>'hero_display_mode' IS NULL;

COMMIT;
