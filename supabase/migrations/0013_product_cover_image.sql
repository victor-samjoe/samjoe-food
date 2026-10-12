-- Add cover_image_url to products for inline base64/data-URL images
ALTER TABLE products ADD COLUMN IF NOT EXISTS cover_image_url text;
