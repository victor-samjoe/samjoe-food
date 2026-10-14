'use client';

import { useEffect, useState } from 'react';
import Storefront from './storefront';

export default function DomainHome({ defaultStoreSlug }: { defaultStoreSlug: string }) {
  const [storeSlug, setStoreSlug] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const hostname = window.location.hostname.toLowerCase();
    const technicalHost = hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === 'lojas.samjoe.com.br'
      || hostname.endsWith('.workers.dev')
      || hostname.endsWith('.pages.dev');
    if (technicalHost) {
      setStoreSlug(defaultStoreSlug);
      return;
    }
    fetch(`/api/backend/public/domains/${encodeURIComponent(hostname)}`, { cache: 'no-store' })
      .then(async response => {
        const body = await response.json() as { store_slug?: string; error?: { message?: string } };
        if (!response.ok || !body.store_slug) throw new Error(body.error?.message ?? 'Domínio não vinculado.');
        setStoreSlug(body.store_slug);
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Domínio não vinculado.'));
  }, [defaultStoreSlug]);

  if (error) return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',fontFamily:'system-ui'}}><div><h1>Loja indisponível</h1><p>{error}</p></div></main>;
  if (!storeSlug) return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',fontFamily:'system-ui'}}>Localizando loja…</main>;
  return <Storefront storeSlug={storeSlug} />;
}
