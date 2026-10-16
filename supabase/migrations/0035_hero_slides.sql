-- 0035: hero_slides — per-image framing for storefront carousel
-- Migrates existing hero_images (string[]) to hero_slides ({image_url, scale, position_x, position_y}[])
-- Additive: preserves hero_images, adds hero_slides only when absent.

UPDATE stores
SET storefront_config = jsonb_set(
  storefront_config,
  '{hero_slides}',
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'image_url', elem.value::text,
        'scale',      1,
        'position_x', 50,
        'position_y', 50
      )
    )
    FROM jsonb_array_elements_text(storefront_config -> 'hero_images') AS elem
  )
)
WHERE storefront_config ? 'hero_images'
  AND jsonb_array_length(storefront_config -> 'hero_images') > 0
  AND NOT (storefront_config ? 'hero_slides');
