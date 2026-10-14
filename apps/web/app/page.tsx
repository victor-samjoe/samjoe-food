import DomainHome from './domain-home';

export default function Home() {
  const storeSlug = process.env.NEXT_PUBLIC_DEFAULT_STORE_SLUG ?? 'samjoe-confeitaria';
  return <DomainHome defaultStoreSlug={storeSlug} />;
}

