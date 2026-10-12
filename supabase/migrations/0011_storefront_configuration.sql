BEGIN;

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS storefront_config jsonb NOT NULL DEFAULT '{
    "brand_subtitle": "Confeitaria de demonstração",
    "hero_eyebrow": "feito com calma, servido com carinho",
    "hero_title": "Um pedaço de doçura para deixar o dia mais leve.",
    "hero_description": "Escolha seus favoritos, monte o carrinho e simule um pedido completo no novo FoodApp.",
    "primary_color": "#9f3f35",
    "accent_color": "#e7b55f",
    "background_color": "#fffaf4",
    "hero_image_enabled": true,
    "hero_image_url": null,
    "hero_image_size": "MEDIUM"
  }'::jsonb;

COMMIT;
