import Storefront from './storefront';

export default function Home() {
  const storeSlug = process.env.NEXT_PUBLIC_DEFAULT_STORE_SLUG ?? 'doce-horizonte-centro';
  return <Storefront storeSlug={storeSlug} />;
}

