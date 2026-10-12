export interface RouteResult {
  distanceMeters: number;
  duration: string | null;
  source: 'google-routes-v2' | 'postal-prefix-v2' | 'postal-prefix-fallback';
}

type AddressLike = {
  street?: string | null; number?: string | null; district?: string | null;
  city?: string | null; state?: string | null; postal_code?: string | null;
};

export function addressToRouteString(addr: AddressLike): string {
  return [addr.street, addr.number, addr.district, addr.city, addr.state, 'Brasil']
    .filter(Boolean).join(', ');
}

export function postalCodeDistance(customerCep: string, storeCep?: string | null): number {
  const clean = (s: string) => s.replace(/\D/g, '').padEnd(8, '0').slice(0, 8);
  const c = clean(customerCep);
  if (!storeCep) return 1_000 + Number(c.slice(0, 2)) * 1_500;
  const diff = Math.abs(Number(c.slice(0, 5)) - Number(clean(storeCep).slice(0, 5)));
  return Math.max(100, 100 + diff * 4);
}

export async function computeDrivingDistance(
  originAddress: string,
  destinationAddress: string,
  apiKey: string,
): Promise<{ distanceMeters: number; duration: string | null } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7_000);
  try {
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration',
      },
      body: JSON.stringify({
        origin: { address: originAddress },
        destination: { address: destinationAddress },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE',
        computeAlternativeRoutes: false,
        languageCode: 'pt-BR',
        units: 'METRIC',
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = await response.json() as { routes?: Array<{ distanceMeters?: number; duration?: string }> };
    const route = data?.routes?.[0];
    if (!route || !Number.isFinite(route.distanceMeters)) return null;
    return { distanceMeters: route.distanceMeters!, duration: route.duration ?? null };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveDistance(params: {
  customerAddress: AddressLike;
  storeAddress: AddressLike | null;
  storeCep?: string | null;
  googleApiKey?: string | null | undefined;
}): Promise<RouteResult> {
  const { customerAddress, storeAddress, storeCep, googleApiKey } = params;

  if (googleApiKey && storeAddress) {
    const origin = addressToRouteString(storeAddress);
    const destination = addressToRouteString(customerAddress);
    const route = await computeDrivingDistance(origin, destination, googleApiKey);
    if (route) {
      return { distanceMeters: route.distanceMeters, duration: route.duration, source: 'google-routes-v2' };
    }
    // Google falhou — cai no heurístico
    return {
      distanceMeters: postalCodeDistance(customerAddress.postal_code ?? '', storeCep),
      duration: null,
      source: 'postal-prefix-fallback',
    };
  }

  return {
    distanceMeters: postalCodeDistance(customerAddress.postal_code ?? '', storeCep),
    duration: null,
    source: 'postal-prefix-v2',
  };
}
