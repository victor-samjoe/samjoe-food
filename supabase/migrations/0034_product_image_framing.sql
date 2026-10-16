-- Non-destructive framing controls for product cover images.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cover_image_scale numeric(4,2) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cover_image_position_x smallint NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS cover_image_position_y smallint NOT NULL DEFAULT 50;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_cover_image_scale_check,
  ADD CONSTRAINT products_cover_image_scale_check
    CHECK (cover_image_scale >= 0.75 AND cover_image_scale <= 2),
  DROP CONSTRAINT IF EXISTS products_cover_image_position_x_check,
  ADD CONSTRAINT products_cover_image_position_x_check
    CHECK (cover_image_position_x >= 0 AND cover_image_position_x <= 100),
  DROP CONSTRAINT IF EXISTS products_cover_image_position_y_check,
  ADD CONSTRAINT products_cover_image_position_y_check
    CHECK (cover_image_position_y >= 0 AND cover_image_position_y <= 100);
