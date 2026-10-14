import Storefront from '../storefront';
import { notFound } from 'next/navigation';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default async function CleanStorePage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  if (!slugPattern.test(storeSlug)) notFound();
  return <Storefront storeSlug={storeSlug} />;
}
