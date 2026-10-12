import Storefront from './storefront';

export default function Home() {
  const storeSlug = process.env.NEXT_PUBLIC_DEFAULT_STORE_SLUG ?? 'samjoe-confeitaria';
  return <Storefront storeSlug={storeSlug} />;
}

