'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import styles from './storefront.module.css';

type Money = { amount_cents: number; currency: string };
type Variant = { id: string; sku: string; name: string; price: Money; available: boolean };
type Product = { id: string; name: string; description: string | null; image_url: string | null; image_scale: number; image_position_x: number; image_position_y: number; variants: Variant[] };
type Category = { id: string | null; name: string | null; slug: string | null; products: Product[] };
type StorefrontConfig = { brand_subtitle:string; hero_eyebrow:string; hero_title:string; hero_description:string; whatsapp_phone_e164:string; primary_color:string; accent_color:string; background_color:string; header_background_color:string; brand_name_color:string; brand_subtitle_color:string; hero_eyebrow_color:string; hero_title_color:string; hero_description_color:string; hero_image_enabled:boolean; hero_image_url:string|null; hero_image_size:'SMALL'|'MEDIUM'|'LARGE'; hero_display_mode:'CORNER'|'FULLSCREEN'|'FLAME'|'CAROUSEL'; hero_images:string[]; hero_section_size:'COMPACT'|'NORMAL'|'TALL'; hero_image_fit:'FILL'|'FIT'; hero_image_scale:number; hero_image_position_x:number; hero_image_position_y:number; logo_url:string|null; font_family:'CLASSIC'|'MODERN'|'ROUNDED'; text_case:'AS_TYPED'|'UPPERCASE'; hero_bg_type?:'GRADIENT'|'COLOR'|'IMAGE'; hero_bg_color?:string|null; hero_bg_image_url?:string|null; hero_bg_image_scale:number; hero_bg_position_x:number; hero_bg_position_y:number };
type FulfillmentConfig = { delivery_enabled: boolean; scheduled_delivery_enabled: boolean; pickup_in_person_enabled: boolean; pickup_by_app_enabled: boolean; pickup_scheduling_enabled: boolean };
type PaymentConfig = { cash_enabled: boolean; card_on_site_enabled: boolean; pix_enabled: boolean; mercado_pago_enabled: boolean; pix_key?: string | null };
type BusinessHoursDay = { open: boolean; from: string | null; to: string | null };
type Catalog = { store: { name: string; slug: string; timezone: string; storefront:Partial<StorefrontConfig>; delivery_enabled?:boolean; is_open?:boolean; open_now?:boolean; reason_closed?:string|null; fulfillment_config?: FulfillmentConfig; payment_config?: PaymentConfig; business_hours?: Record<string, BusinessHoursDay> | null }; categories: Category[]; version: string };
type CartItem = { productId: string; productName: string; imageUrl: string | null; imageScale: number; imagePositionX: number; imagePositionY: number; variant: Variant; quantity: number };
type Fulfillment = 'PICKUP' | 'DELIVERY' | 'DELIVERY_SCHEDULED' | 'PICKUP_BY_APP';
type PaymentMethod = 'CASH' | 'CARD' | 'PIX' | 'MERCADO_PAGO';
type PixPayment = { qr_code: string; qr_code_base64: string; expires_at: string | null } | { pix_key: string };
type PublicPaymentStatus = {
  public_number: string; order_status: string; payment_status: string; payment_method: string;
  amount_cents: number; currency: string; paid_at: string | null; expires_at: string | null;
};
type CheckoutForm = {
  name: string; email: string; phone: string; fulfillment: Fulfillment; paymentMethod: PaymentMethod;
  street: string; number: string; complement: string; district: string; city: string; state: string; postalCode: string;
  scheduledFor: string;
};
type Suggestion = { product_id:string; product_name:string; description:string|null; image_url:string|null; variant_id:string; price_cents:number; currency:string; order_count:number };
type OrderDetails = { items: CartItem[]; fulfillment: Fulfillment; scheduledFor: string };

const fulfillmentLabel: Record<Fulfillment, string> = {
  PICKUP: 'Retirada no local',
  DELIVERY: 'Entrega imediata',
  DELIVERY_SCHEDULED: 'Entrega agendada',
  PICKUP_BY_APP: 'Retirada via app (motoboy)',
};

const initialForm: CheckoutForm = {
  name: '', email: '', phone: '', fulfillment: 'PICKUP', paymentMethod: 'CASH',
  street: '', number: '', complement: '', district: '', city: '', state: 'SP', postalCode: '',
  scheduledFor: '',
};
const defaultStorefront:StorefrontConfig={brand_subtitle:'Confeitaria artesanal',hero_eyebrow:'feito com calma, servido com carinho',hero_title:'Um pedaço de doçura para deixar o dia mais leve.',hero_description:'Escolha seus favoritos, monte o carrinho e envie seu pedido em poucos passos.',whatsapp_phone_e164:'',primary_color:'#9f3f35',accent_color:'#e7b55f',background_color:'#fffaf4',header_background_color:'#ffffff',brand_name_color:'#3f2d27',brand_subtitle_color:'#846f64',hero_eyebrow_color:'#9f3f35',hero_title_color:'#452d27',hero_description_color:'#795f53',hero_image_enabled:true,hero_image_url:null,hero_image_size:'MEDIUM',hero_display_mode:'CORNER',hero_images:[],hero_section_size:'NORMAL',hero_image_fit:'FILL',hero_image_scale:1,hero_image_position_x:50,hero_image_position_y:50,logo_url:null,font_family:'CLASSIC',text_case:'AS_TYPED',hero_bg_image_scale:1,hero_bg_position_x:50,hero_bg_position_y:50};

function readCache(cacheKey:string):{logoUrl:string|null;storeName:string|null}{try{const v=localStorage.getItem(cacheKey);return v?JSON.parse(v) as {logoUrl:string|null;storeName:string|null}:{logoUrl:null,storeName:null};}catch{return{logoUrl:null,storeName:null};}}

function money(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function normalizeBRPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return `+${digits.slice(0, 13)}`;
  return `+55${digits.slice(0, 11)}`;
}

function whatsappUrl(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits}`;
}

async function jsonRequest<T>(url: string, options?: RequestInit, retries = 0): Promise<T> {
  let lastError: (Error & { retryable?: boolean }) | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (response.ok) return body as T;
      lastError = new Error(body?.error?.message ?? `Erro HTTP ${response.status}`);
      const retryable = [500, 502, 503, 504].includes(response.status);
      lastError.retryable = retryable;
      if (!retryable || attempt === retries) throw lastError;
    } catch (cause) {
      lastError = cause instanceof Error ? cause : new Error('Falha de conexão.');
      if (lastError.retryable === false || attempt === retries) throw lastError;
    }
    const delay = 250 * (2 ** attempt) + Math.floor(Math.random() * 150);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw lastError ?? new Error('Não foi possível completar a solicitação.');
}

export default function Storefront({ storeSlug }: { storeSlug: string }) {
  const encodedStoreSlug = encodeURIComponent(storeSlug);
  const cacheKey = `sf_cache_${storeSlug}`;
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [form, setForm] = useState<CheckoutForm>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<{ id: string; public_number: string; status: string; total: Money; payment_method?: string } | null>(null);
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);
  const [mpCheckoutUrl, setMpCheckoutUrl] = useState<string | null>(null);
  const [mpError, setMpError] = useState<string | null>(null);
  const [pixPayment, setPixPayment] = useState<PixPayment | null>(null);
  const [pixError, setPixError] = useState<string | null>(null);
  const [pixPaymentStatus, setPixPaymentStatus] = useState<string | null>(null);
  const [pixCancelling, setPixCancelling] = useState(false);
  const [paymentReturn, setPaymentReturn] = useState<{
    state: 'checking' | 'paid' | 'pending' | 'error';
    publicNumber?: string;
    amountCents?: number;
    currency?: string;
  } | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsPersonalized, setSuggestionsPersonalized] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [mounted, setMounted] = useState(false);
  const phoneTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const [cachedBrand, setCachedBrand] = useState<{logoUrl:string|null;storeName:string|null}>({logoUrl:null,storeName:null});
  useEffect(()=>{
    setMounted(true);
    setCachedBrand(readCache(cacheKey));
    const urlPhone=new URLSearchParams(window.location.search).get('phone');
    if(urlPhone){
      const normalized=normalizeBRPhone(urlPhone);
      setForm(current=>({...current,phone:normalized}));
      void(async()=>{
        try{
          const result=await jsonRequest<{found:boolean;name?:string;address?:Record<string,unknown>|null}>(`/api/store/${encodedStoreSlug}/customers/lookup?phone=${encodeURIComponent(normalized)}`);
          if(result.found){
            setForm(current=>({...current,...(result.name?{name:result.name}:{})}));
            const addr=result.address as Record<string,string>|null;
            if(addr)setForm(current=>({...current,street:addr.street??current.street,number:addr.number??current.number,complement:addr.complement??current.complement,district:addr.district??current.district,city:addr.city??current.city,state:addr.state??current.state,postalCode:addr.postal_code??current.postalCode}));
            const sugData=await jsonRequest<{personalized:boolean;suggestions:Suggestion[]}>(`/api/store/${encodedStoreSlug}/suggestions?phone=${encodeURIComponent(normalized)}`);
            setSuggestions(sugData.suggestions);setSuggestionsPersonalized(sugData.personalized);
          }
        }catch{}
      })();
    }
  },[cacheKey,encodedStoreSlug]);
  const introOnDone = useCallback(()=>setIntroDone(true),[]);
  const showIntro = mounted && (!introDone || loading);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await jsonRequest<Catalog>(`/api/store/${encodedStoreSlug}/catalog`, undefined, 3);
      setCatalog(data);
      try { localStorage.setItem(cacheKey, JSON.stringify({ logoUrl: data.store.storefront?.logo_url ?? null, storeName: data.store.name })); } catch { /* ignore */ }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o catálogo.');
    } finally {
      setLoading(false);
    }
  }, [cacheKey, encodedStoreSlug]);

  const loadSuggestions = useCallback(async (phone?:string) => {
    try {
      const url = phone ? `/api/store/${encodedStoreSlug}/suggestions?phone=${encodeURIComponent(phone)}` : `/api/store/${encodedStoreSlug}/suggestions`;
      const data = await jsonRequest<{personalized:boolean;suggestions:Suggestion[]}>(url);
      setSuggestions(data.suggestions);
      setSuggestionsPersonalized(data.personalized);
    } catch { /* silent */ }
  }, [encodedStoreSlug]);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);
  useEffect(() => { void loadSuggestions(); }, [loadSuggestions]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('pedido');
    const paymentId = params.get('payment_id') ?? params.get('collection_id');
    if (!orderId || !paymentId || !params.get('pagamento')) return;

    setPaymentReturn({ state: 'checking' });
    void jsonRequest<{ payment: { status: string; public_number: string; amount_cents: number; currency: string } }>(
      `/api/store/${encodedStoreSlug}/orders/${encodeURIComponent(orderId)}/mp-payment/reconcile`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payment_id: paymentId }),
      },
    ).then((result) => {
      setPaymentReturn({
        state: result.payment.status === 'PAID' ? 'paid' : 'pending',
        publicNumber: result.payment.public_number,
        amountCents: result.payment.amount_cents,
        currency: result.payment.currency,
      });
    }).catch(() => {
      setPaymentReturn({ state: 'error' });
    }).finally(() => {
      const cleanUrl = new URL(window.location.href);
      for (const key of ['pedido', 'pagamento', 'payment_id', 'collection_id', 'collection_status', 'status', 'external_reference', 'preference_id', 'merchant_order_id']) {
        cleanUrl.searchParams.delete(key);
      }
      window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    });
  }, [encodedStoreSlug]);

  useEffect(() => {
    if (!order?.id || order.payment_method !== 'PIX' || !pixPayment || !('qr_code' in pixPayment)) return;
    if (['PAID', 'REFUNDED', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(pixPaymentStatus ?? '')) return;

    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const refreshStatus = async () => {
      try {
        const result = await jsonRequest<{ payment: PublicPaymentStatus }>(
          `/api/store/${encodedStoreSlug}/orders/${encodeURIComponent(order.id)}/payment-status`,
        );
        if (stopped) return;
        setPixPaymentStatus(result.payment.payment_status);
        setOrder(current => current?.id === order.id
          ? { ...current, status: result.payment.order_status }
          : current);
      } catch {
        // Uma falha transitória não interrompe a próxima consulta.
      }
    };
    void refreshStatus();
    timer = setInterval(() => void refreshStatus(), 2500);
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, [encodedStoreSlug, order?.id, order?.payment_method, pixPayment, pixPaymentStatus]);

  function handlePhoneChange(value:string){
    updateForm('phone', value);
    if(phoneTimerRef.current) clearTimeout(phoneTimerRef.current);
    const phonePattern = /^\+55\d{10,11}$/;
    if(phonePattern.test(value)){
      setPhoneLoading(true);
      phoneTimerRef.current = setTimeout(async()=>{
        try{
          const result = await jsonRequest<{found:boolean;name?:string;address?:Record<string,unknown>|null}>(`/api/store/${encodedStoreSlug}/customers/lookup?phone=${encodeURIComponent(value)}`);
          if(result.found){
            setForm(current=>({...current,...(result.name?{name:result.name}:{})}));
            const addr = result.address as Record<string,string>|null;
            if(addr) setForm(current=>({...current,street:addr.street??current.street,number:addr.number??current.number,complement:addr.complement??current.complement,district:addr.district??current.district,city:addr.city??current.city,state:addr.state??current.state,postalCode:addr.postal_code??current.postalCode}));
            void loadSuggestions(value);
          }
        }catch{ /* silent */ }finally{setPhoneLoading(false);}
      }, 600);
    } else { setPhoneLoading(false); }
  }

  const visibleCategories = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    return (catalog?.categories ?? []).map(category => ({
      ...category,
      products: category.products.filter(product => {
        const categoryMatches = activeCategory === 'all' || category.slug === activeCategory;
        const searchMatches = !normalized || `${product.name} ${product.description ?? ''}`.toLocaleLowerCase('pt-BR').includes(normalized);
        return categoryMatches && searchMatches;
      }),
    })).filter(category => category.products.length > 0);
  }, [catalog, query, activeCategory]);

  const cartItems = Object.values(cart);
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cartItems.reduce((sum, item) => sum + item.variant.price.amount_cents * item.quantity, 0);
  const storefront={...defaultStorefront,...(catalog?.store.storefront??{})};
  const storeName=catalog?.store.name??cachedBrand.storeName??'SamJoE Food';
  const heroBgStyle=useMemo(():CSSProperties|undefined=>{if(storefront.hero_bg_type==='IMAGE'&&storefront.hero_bg_image_url)return{backgroundImage:`url(${storefront.hero_bg_image_url})`,backgroundSize:storefront.hero_bg_image_scale>1?`${Math.round(storefront.hero_bg_image_scale*100)}% auto`:'cover',backgroundPosition:`${storefront.hero_bg_position_x}% ${storefront.hero_bg_position_y}%`,backgroundRepeat:'no-repeat'};if(storefront.hero_bg_type==='COLOR'&&storefront.hero_bg_color)return{background:storefront.hero_bg_color};return undefined;},[storefront.hero_bg_type,storefront.hero_bg_image_url,storefront.hero_bg_color,storefront.hero_bg_image_scale,storefront.hero_bg_position_x,storefront.hero_bg_position_y]);
  const storefrontStyle={'--store-primary':storefront.primary_color,'--store-accent':storefront.accent_color,'--store-background':storefront.background_color,'--store-header-background':storefront.header_background_color,'--store-brand-name':storefront.brand_name_color,'--store-brand-subtitle':storefront.brand_subtitle_color,'--store-hero-eyebrow':storefront.hero_eyebrow_color,'--store-hero-title':storefront.hero_title_color,'--store-hero-description':storefront.hero_description_color,'--store-font':storeFont(storefront.font_family),'--hero-fit':storefront.hero_image_fit==='FIT'?'contain':'cover'} as CSSProperties;
  const heroImageStyle={objectPosition:`${storefront.hero_image_position_x}% ${storefront.hero_image_position_y}%`,transform:`scale(${storefront.hero_image_scale})`} as CSSProperties;
  const heroImages = storefront.hero_images?.length ? storefront.hero_images : (storefront.hero_image_url ? [storefront.hero_image_url] : []);

  function add(product: Product, variant: Variant) {
    if (!variant.available) return;
    setCart(current => ({
      ...current,
      [variant.id]: {
        productId: product.id,
        productName: product.name,
        imageUrl: product.image_url,
        imageScale: product.image_scale ?? 1,
        imagePositionX: product.image_position_x ?? 50,
        imagePositionY: product.image_position_y ?? 50,
        variant,
        quantity: (current[variant.id]?.quantity ?? 0) + 1,
      },
    }));
    setCartOpen(true);
  }

  function changeQuantity(variantId: string, delta: number) {
    setCart(current => {
      const item = current[variantId];
      if (!item) return current;
      const quantity = item.quantity + delta;
      if (quantity <= 0) {
        const next = { ...current };
        delete next[variantId];
        return next;
      }
      return { ...current, [variantId]: { ...item, quantity } };
    });
  }

  function updateForm<K extends keyof CheckoutForm>(key: K, value: CheckoutForm[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  async function submitOrder(quoteId: string | null) {
    if (cartItems.length === 0) return;
    setSubmitting(true);
    setError('');
    const address = {
      street: form.street, number: form.number, complement: form.complement, district: form.district, city: form.city,
      state: form.state.toUpperCase(), postal_code: form.postalCode.replace(/\D/g, ''),
    };
    try {
      const created = await jsonRequest<{ id: string; public_number: string; status: string; total: Money; payment_method?: string }>(`/api/store/${encodedStoreSlug}/orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          customer: { name: form.name, phone_e164: form.phone, email: form.email || null },
          fulfillment: form.fulfillment,
          address: (form.fulfillment === 'DELIVERY' || form.fulfillment === 'DELIVERY_SCHEDULED' || form.fulfillment === 'PICKUP_BY_APP') ? address : null,
          delivery_quote_id: quoteId,
          scheduled_for: form.scheduledFor || null,
          items: cartItems.map(item => ({ variant_id: item.variant.id, quantity: item.quantity })),
          payment_method: form.paymentMethod,
          notes: '',
        }),
      });
      setOrder(created);
      setOrderDetails({ items: cartItems, fulfillment: form.fulfillment, scheduledFor: form.scheduledFor });
      setMpCheckoutUrl(null);
      setMpError(null);
      setPixPaymentStatus(null);
      setCart({});
      setCheckoutOpen(false);
      setCartOpen(false);
      if (created.payment_method === 'MERCADO_PAGO' && created.id) {
        try {
          const mpResult = await jsonRequest<{ checkout_url: string }>(`/api/store/${encodedStoreSlug}/orders/${encodeURIComponent(created.id)}/mp-payment`, { method: 'POST' });
          setMpCheckoutUrl(mpResult.checkout_url);
        } catch (err) {
          setMpError(err instanceof Error ? err.message : 'Erro ao iniciar pagamento no Mercado Pago.');
        }
      }
      if (created.payment_method === 'PIX' && created.id) {
        try {
          const pixResult = await jsonRequest<PixPayment>(`/api/store/${encodedStoreSlug}/orders/${encodeURIComponent(created.id)}/pix-payment`, { method: 'POST' });
          setPixPayment(pixResult);
          if ('qr_code' in pixResult) setPixPaymentStatus('PENDING');
        } catch (err) {
          setPixError(err instanceof Error ? err.message : 'Erro ao gerar informações PIX.');
        }
      }
      await loadCatalog();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar o pedido.');
    } finally {
      setSubmitting(false);
    }
  }

  async function retryMpPayment() {
    if (!order?.id) return;
    setMpError(null);
    try {
      const mpResult = await jsonRequest<{ checkout_url: string }>(`/api/store/${encodedStoreSlug}/orders/${encodeURIComponent(order.id)}/mp-payment`, { method: 'POST' });
      setMpCheckoutUrl(mpResult.checkout_url);
    } catch (err) {
      setMpError(err instanceof Error ? err.message : 'Erro ao iniciar pagamento no Mercado Pago.');
    }
  }

  async function retryPixPayment() {
    if (!order?.id) return;
    setPixError(null);
    try {
      const pixResult = await jsonRequest<PixPayment>(`/api/store/${encodedStoreSlug}/orders/${encodeURIComponent(order.id)}/pix-payment`, { method: 'POST' });
      setPixPayment(pixResult);
      if ('qr_code' in pixResult) setPixPaymentStatus('PENDING');
    } catch (err) {
      setPixError(err instanceof Error ? err.message : 'Erro ao gerar informações PIX.');
    }
  }

  async function cancelPixPayment() {
    if (!order?.id || pixCancelling) return;
    if (!window.confirm('Cancelar este pedido e inutilizar o QR Code Pix?')) return;
    setPixCancelling(true);
    setPixError(null);
    try {
      const result = await jsonRequest<{ payment_status: string; order_status: string }>(
        `/api/store/${encodedStoreSlug}/orders/${encodeURIComponent(order.id)}/pix-payment/cancel`,
        { method: 'POST' },
      );
      setPixPaymentStatus(result.payment_status);
      setOrder(current => current ? { ...current, status: result.order_status } : current);
    } catch (cause) {
      setPixError(cause instanceof Error ? cause.message : 'Não foi possível cancelar o Pix.');
    } finally {
      setPixCancelling(false);
    }
  }

  if (!catalog && loading) return <main className={`${styles.storeLoading} ${styles.storeBoot}`} aria-busy="true" aria-label="Carregando loja"><div className={styles.loadingWordmark}>SamJoE</div><span>Carregando sua loja…</span></main>;
  if(!catalog&&!loading&&error)return <main className={styles.storeLoading}>{cachedBrand.logoUrl?<img className={styles.loadingLogo} src={cachedBrand.logoUrl} alt="Logo"/>:<div className={styles.loadingMark}>SJ</div>}<strong>Não foi possível carregar a loja.</strong><span>{error}</span><button onClick={()=>void loadCatalog()}>Tentar novamente</button></main>;

  return (
    <>
      {showIntro&&<StoreIntro storeName={cachedBrand.storeName} logoUrl={cachedBrand.logoUrl} onDone={introOnDone} ready={!loading}/>}
    <main className={styles.page} style={storefrontStyle} data-case={storefront.text_case}>
      <header className={styles.header}>
        <a className={styles.brand} href="#inicio" aria-label={`${storeName}, início`}>
          {storefront.logo_url?<img className={styles.brandLogo} src={storefront.logo_url} alt={`Logo de ${storeName}`}/>:<span className={styles.brandMark}>{initials(storeName)}</span>}
          <span><strong>{storeName}</strong><small>{storefront.brand_subtitle}</small></span>
        </a>
        {catalog && catalog.store.open_now !== undefined && (
          <span className={catalog.store.open_now ? styles.openBadge : styles.closedBadge}>
            {catalog.store.open_now ? 'Aberta' : 'Fechada'}
          </span>
        )}
        <button className={styles.cartButton} onClick={() => setCartOpen(true)} aria-label={`Abrir carrinho com ${itemCount} itens`}>
          <span>Carrinho</span><b>{itemCount}</b>
        </button>
      </header>
      <section className={`${styles.hero} ${!storefront.hero_image_enabled?styles.heroWithoutImage:''} ${heroSectionClass(storefront.hero_section_size)} ${storefront.hero_image_enabled&&storefront.hero_display_mode==='FULLSCREEN'?styles.heroFullscreen:''}`} id="inicio" style={heroBgStyle}>
        {storefront.hero_image_enabled&&storefront.hero_display_mode==='FULLSCREEN'&&heroImages[0]&&<img className={styles.heroFullscreenBg} style={heroImageStyle} src={heroImages[0]} alt="" aria-hidden="true"/>}
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>{storefront.hero_eyebrow}</span>
          <h1>{storefront.hero_title}</h1>
          <p>{storefront.hero_description}</p>
          <a href="#cardapio" className={styles.heroAction}>Ver cardápio <span>↓</span></a>
        </div>
        {storefront.hero_image_enabled&&storefront.hero_display_mode==='CAROUSEL'&&heroImages.length>0&&<HeroCarousel images={heroImages} storeName={storeName} imageStyle={heroImageStyle}/>}
        {storefront.hero_image_enabled&&storefront.hero_display_mode==='CORNER'&&<div className={`${styles.heroArt} ${heroSizeClass(storefront.hero_image_size)}`} aria-hidden={!storefront.hero_image_url}>{storefront.hero_image_url?<img className={styles.heroImage} style={heroImageStyle} src={storefront.hero_image_url} alt={`Imagem principal de ${storeName}`}/>:<><div className={styles.sun}/><div className={styles.cake}><span/><i/></div><div className={styles.leafOne}>✦</div><div className={styles.leafTwo}>✦</div></>}</div>}
        {storefront.hero_image_enabled&&storefront.hero_display_mode==='FLAME'&&heroImages[0]&&<div className={`${styles.heroArt} ${styles.heroFlame} ${heroSizeClass(storefront.hero_image_size)}`}><img className={styles.heroImage} style={heroImageStyle} src={heroImages[0]} alt={`Imagem principal de ${storeName}`}/></div>}
        {storefront.hero_image_enabled&&storefront.hero_display_mode==='FLAME'&&!heroImages[0]&&<div className={`${styles.heroArt} ${styles.heroFlame} ${heroSizeClass(storefront.hero_image_size)}`}><><div className={styles.sun}/><div className={styles.cake}><span/><i/></div><div className={styles.leafOne}>✦</div><div className={styles.leafTwo}>✦</div></></div>}
      </section>

      {suggestions.length>0&&<section className={styles.suggestions} id="sugestoes">
        <div className={styles.suggestionsHeader}><div><span className={styles.kicker}>{suggestionsPersonalized?'SEUS FAVORITOS':'MAIS PEDIDOS'}</span><h2>{suggestionsPersonalized?'O que você costuma pedir':'O que os clientes mais adoram'}</h2></div></div>
        <div className={styles.suggestionsGrid}>{suggestions.map(s=><SuggestionCard key={s.product_id} suggestion={s} onAdd={()=>{const variant:Variant={id:s.variant_id,sku:'',name:s.product_name,price:{amount_cents:s.price_cents,currency:s.currency},available:true};const product:Product={id:s.product_id,name:s.product_name,description:s.description,image_url:s.image_url,image_scale:1,image_position_x:50,image_position_y:50,variants:[variant]};add(product,variant);}}/>)}</div>
      </section>}

      <section className={styles.catalog} id="cardapio">
        <div className={styles.catalogHeading}>
          <div><span className={styles.kicker}>CARDÁPIO DIGITAL</span></div>
          <label className={styles.search}><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar no cardápio" /></label>
        </div>
        <div className={styles.chips} aria-label="Categorias">
          <button className={activeCategory === 'all' ? styles.chipActive : styles.chip} onClick={() => setActiveCategory('all')}>Todos</button>
          {catalog?.categories.map(category => <button key={category.id ?? 'none'} className={activeCategory === category.slug ? styles.chipActive : styles.chip} onClick={() => setActiveCategory(category.slug ?? 'all')}>{category.name ?? 'Outros'}</button>)}
        </div>

        {loading && <div className={styles.message}>Preparando o cardápio…</div>}
        {error && <div className={styles.error}><span>{error}</span><button onClick={() => void loadCatalog()}>Tentar novamente</button></div>}
        {!loading && !error && visibleCategories.length === 0 && <div className={styles.message}>Nenhum produto combina com essa busca.</div>}
        {visibleCategories.map(category => <section key={category.id ?? 'none'} className={styles.categorySection}>
          <div className={styles.categoryTitle}><h3>{category.name ?? 'Outros sabores'}</h3><span>{category.products.length} opções</span></div>
          <div className={styles.productGrid}>{category.products.map((product, index) => <ProductCard key={product.id} product={product} index={index} onAdd={add} />)}</div>
        </section>)}
      </section>

      <section className={styles.promise}><span>✦</span><div><strong>Pedido direto com a loja</strong><p>Escolha seus produtos e acompanhe cada etapa do pedido em um só lugar.</p></div></section>
      {itemCount > 0 && <button className={styles.mobileCart} onClick={() => setCartOpen(true)}><b>{itemCount}</b><span>Ver carrinho</span><strong>{money(subtotal)}</strong></button>}

      {cartOpen && <>
        <button className={styles.backdrop} aria-label="Fechar carrinho" onClick={() => { setCartOpen(false); setCheckoutOpen(false); }} />
        <aside className={styles.drawer} aria-label="Carrinho de compras">
          <div className={styles.drawerHeader}><div><span className={styles.kicker}>SEU PEDIDO</span><h2>Carrinho</h2></div><button onClick={() => { setCartOpen(false); setCheckoutOpen(false); }} aria-label="Fechar">×</button></div>
          {cartItems.length === 0 ? <div className={styles.emptyCart}><span>◇</span><p>Seu carrinho está vazio.</p></div> : <>
            <div className={styles.cartList}>{cartItems.map(item => <div className={styles.cartItem} key={item.variant.id}>
              <div className={styles.cartThumb}>{item.imageUrl?<img src={item.imageUrl} alt="" className={styles.cartThumbImg} aria-hidden="true" style={{objectPosition:`${item.imagePositionX}% ${item.imagePositionY}%`,transform:`scale(${item.imageScale})`}}/>:item.productName.slice(0,1)}</div>
              <div className={styles.cartDetails}><strong>{item.productName}</strong><small>{item.variant.name}</small><span>{money(item.variant.price.amount_cents)}</span></div>
              <div className={styles.quantity}><button onClick={() => changeQuantity(item.variant.id, -1)}>−</button><b>{item.quantity}</b><button onClick={() => changeQuantity(item.variant.id, 1)}>+</button></div>
            </div>)}</div>
            {!checkoutOpen ? <div className={styles.cartFooter}><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><small>Taxa de entrega calculada na próxima etapa.</small><button className={styles.continueShoppingButton} onClick={() => setCartOpen(false)}>Continuar comprando</button>{catalog?.store.open_now === false ? <div className={styles.storeClosedNotice}><strong>Loja fechada</strong>{catalog.store.reason_closed && <span>{catalog.store.reason_closed}</span>}<span>Não estamos aceitando pedidos no momento.</span></div> : <button className={styles.primaryButton} onClick={() => setCheckoutOpen(true)}>Finalizar pedido</button>}</div>
              : <Checkout
                  storeSlug={storeSlug}
                  form={form}
                  updateForm={updateForm}
                  submitting={submitting}
                  onConfirm={submitOrder}
                  onBack={() => setCheckoutOpen(false)}
                  phoneLoading={phoneLoading}
                  onPhoneChange={handlePhoneChange}
                  cartItems={cartItems}
                  subtotal={subtotal}
                  deliveryEnabled={catalog?.store.delivery_enabled === true}
                  fulfillmentConfig={catalog?.store.fulfillment_config}
                  paymentConfig={catalog?.store.payment_config}
                  businessHours={catalog?.store.business_hours ?? null}
                  storeTimezone={catalog?.store.timezone ?? 'America/Sao_Paulo'}
                />}
          </>}
        </aside>
      </>}

      {order && <div className={styles.orderOverlay} role="dialog" aria-modal="true" aria-label="Pedido confirmado"><div className={styles.orderSuccess}>
        <span className={styles.successIcon}>✓</span><span className={styles.kicker}>PEDIDO CRIADO</span><h2>Deu tudo certo!</h2><p>Seu pedido entrou no painel da loja.</p>
        <strong className={styles.orderNumber}>{order.public_number}</strong>
        {orderDetails && <>
          <div className={styles.orderSummaryItems}>
            {orderDetails.items.map(item => <div key={item.variant.id} className={styles.orderSummaryItem}>
              <span>{item.quantity}× {item.productName}{item.variant.name !== item.productName ? ` — ${item.variant.name}` : ''}</span>
              <b>{money(item.variant.price.amount_cents * item.quantity)}</b>
            </div>)}
          </div>
          <div className={styles.orderSummaryMeta}>
            <span>{fulfillmentLabel[orderDetails.fulfillment]}</span>
            {orderDetails.scheduledFor && <span>{new Date(orderDetails.scheduledFor).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span>}
          </div>
        </>}
        <div className={styles.orderTotal}><span>Total</span><b>{money(order.total.amount_cents)}</b></div>
        {order.payment_method === 'MERCADO_PAGO' && (
          mpCheckoutUrl
            ? <a className={styles.mpPayButton} href={mpCheckoutUrl}>Ir para o pagamento →</a>
            : mpError
              ? <><p className={styles.mpPayError}>{mpError}</p><button className={styles.mpRetryButton} onClick={() => void retryMpPayment()}>Tentar novamente</button></>
              : <p className={styles.mpPayLoading}>Gerando link de pagamento…</p>
        )}
        {order.payment_method === 'PIX' && (
          pixPaymentStatus === 'PAID'
            ? <div className={styles.pixConfirmed} role="status">
                <span className={styles.pixConfirmedIcon}>✓</span>
                <strong>Pagamento Pix confirmado!</strong>
                <p>Recebemos o pagamento. Seu pedido já foi enviado para a loja.</p>
                {storefront.whatsapp_phone_e164 && <a className={styles.whatsappButton} href={whatsappUrl(storefront.whatsapp_phone_e164)} target="_blank" rel="noopener noreferrer">Falar com a loja no WhatsApp</a>}
              </div>
            : pixPaymentStatus === 'REFUNDED'
              ? <div className={styles.pixExpired}><strong>Pagamento estornado</strong><p>O valor deste pedido foi devolvido.</p></div>
            : pixPaymentStatus === 'CANCELLED'
              ? <div className={styles.pixExpired}><strong>Pedido cancelado</strong><p>O QR Code Pix foi cancelado e não pode mais ser utilizado.</p></div>
            : pixPaymentStatus === 'EXPIRED'
              ? <div className={styles.pixExpired}><strong>Prazo do Pix encerrado</strong><p>Este pedido expirou. Volte ao cardápio para fazer um novo pedido.</p></div>
            : pixPayment
            ? 'qr_code' in pixPayment
              ? <PixQrPayment payment={pixPayment} onCancel={() => void cancelPixPayment()} cancelling={pixCancelling} error={pixError} />
              : <div className={styles.pixBlock}>
                  <p className={styles.pixHint}>Copie a chave PIX abaixo e realize o pagamento pelo seu banco. Após o pagamento, avise a loja pelo WhatsApp.</p>
                  <div className={styles.pixCopyRow}>
                    <input className={styles.pixCode} readOnly value={pixPayment.pix_key} aria-label="Chave PIX" />
                    <button className={styles.pixCopyBtn} type="button" onClick={() => { void navigator.clipboard.writeText(pixPayment.pix_key); }}>Copiar</button>
                  </div>
                </div>
            : pixError
              ? <><p className={styles.mpPayError}>{pixError}</p><button className={styles.mpRetryButton} onClick={() => void retryPixPayment()}>Tentar novamente</button></>
              : <p className={styles.mpPayLoading}>Carregando informações PIX…</p>
        )}
        {storefront.whatsapp_phone_e164 && order.payment_method !== 'MERCADO_PAGO' && order.payment_method !== 'PIX' && <a className={styles.whatsappButton} href={whatsappUrl(storefront.whatsapp_phone_e164)} target="_blank" rel="noopener noreferrer">Falar com a loja no WhatsApp</a>}
        <button className={styles.primaryButton} onClick={() => { setOrder(null); setOrderDetails(null); setMpCheckoutUrl(null); setMpError(null); setPixPayment(null); setPixError(null); setPixPaymentStatus(null); }}>Voltar ao cardápio</button>
      </div></div>}
      {paymentReturn && <div className={styles.orderOverlay} role="dialog" aria-modal="true" aria-label="Confirmação do pagamento"><div className={`${styles.orderSuccess} ${styles.paymentReceipt}`}>
        <span className={`${styles.successIcon} ${paymentReturn.state === 'error' ? styles.receiptErrorIcon : ''}`}>{paymentReturn.state === 'checking' ? '…' : paymentReturn.state === 'paid' ? '✓' : '!'}</span>
        <span className={styles.kicker}>{paymentReturn.state === 'paid' ? 'PAGAMENTO CONFIRMADO' : 'STATUS DO PAGAMENTO'}</span>
        <h2>{paymentReturn.state === 'checking' ? 'Só um instante' : paymentReturn.state === 'paid' ? 'Tudo certo!' : paymentReturn.state === 'pending' ? 'Pagamento em análise' : 'Confirmação pendente'}</h2>
        <p>{paymentReturn.state === 'checking' ? 'Estamos confirmando o pagamento diretamente com o Mercado Pago.' : paymentReturn.state === 'paid' ? 'Seu pagamento foi aprovado e o pedido já foi enviado para a loja.' : paymentReturn.state === 'pending' ? 'O Mercado Pago ainda está processando. O webhook atualizará o pedido assim que houver aprovação.' : 'Não foi possível confirmar agora. O pedido continuará sendo verificado pelo webhook.'}</p>
        {paymentReturn.publicNumber && <strong className={styles.orderNumber}>{paymentReturn.publicNumber}</strong>}
        {paymentReturn.amountCents !== undefined && <div className={styles.orderTotal}><span>Valor pago</span><b>{money(paymentReturn.amountCents)}</b></div>}
        {paymentReturn.state === 'paid' && paymentReturn.publicNumber && storefront.whatsapp_phone_e164 && <a className={styles.whatsappButton} href={whatsappUrl(storefront.whatsapp_phone_e164)} target="_blank" rel="noopener noreferrer">Avisar a loja pelo WhatsApp</a>}
        {paymentReturn.state !== 'checking' && <button className={styles.primaryButton} onClick={() => setPaymentReturn(null)}>Voltar ao cardápio</button>}
      </div></div>}
    </main>
    </>
  );
}

function PixQrPayment({ payment, onCancel, cancelling, error }: {
  payment: Extract<PixPayment, { qr_code: string }>;
  onCancel: () => void;
  cancelling: boolean;
  error: string | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  const expiration = payment.expires_at ? Date.parse(payment.expires_at) : Number.NaN;
  const remainingMs = Number.isFinite(expiration) ? Math.max(0, expiration - now) : null;
  const expired = remainingMs === 0;

  useEffect(() => {
    if (!Number.isFinite(expiration) || expiration <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiration]);

  if (expired) {
    return <div className={styles.pixBlock}>
      <div className={styles.pixExpired}>
        <strong>Prazo do Pix encerrado</strong>
        <p>Este pedido expirou. Volte ao cardápio para fazer um novo pedido.</p>
      </div>
    </div>;
  }

  const remainingSeconds = remainingMs === null ? null : Math.ceil(remainingMs / 1000);
  const countdown = remainingSeconds === null
    ? null
    : `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`;

  return <div className={styles.pixBlock}>
    <p className={styles.pixHint}>Escaneie o QR code ou copie o código para pagar via PIX. O pedido é confirmado automaticamente.</p>
    {countdown && <p className={styles.pixExpiry}>Pague em até {countdown}</p>}
    <img className={styles.pixQr} src={`data:image/png;base64,${payment.qr_code_base64}`} alt="QR code PIX" />
    <div className={styles.pixCopyRow}>
      <input className={styles.pixCode} readOnly value={payment.qr_code} aria-label="Código PIX copia e cola" />
      <button className={styles.pixCopyBtn} type="button" onClick={() => { void navigator.clipboard.writeText(payment.qr_code); }}>Copiar</button>
    </div>
    {error && <p className={styles.mpPayError}>{error}</p>}
    <button className={styles.pixCancelButton} type="button" disabled={cancelling} onClick={onCancel}>
      {cancelling ? 'Cancelando…' : 'Cancelar pedido'}
    </button>
    {payment.expires_at && <small>Válido até {new Date(payment.expires_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small>}
  </div>;
}

function ProductCard({ product, index, onAdd }: { product: Product; index: number; onAdd: (product: Product, variant: Variant) => void }) {
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? '');
  const variant = product.variants.find(item => item.id === variantId) ?? product.variants[0];
  const tones = [styles.toneRose, styles.toneGold, styles.toneMint];
  const tone = tones[index % tones.length];
  return <article className={styles.productCard}>
    <div className={`${styles.productVisual} ${tone}`}>{product.image_url?<img className={styles.productPhoto} src={product.image_url} alt={product.name} style={{objectPosition:`${product.image_position_x ?? 50}% ${product.image_position_y ?? 50}%`,transform:`scale(${product.image_scale ?? 1})`}}/>:<><span className={styles.productMonogram}>{product.name.split(' ').slice(-1)[0]?.slice(0, 1)}</span><small>imagem em breve</small></>}</div>
    <div className={styles.productBody}><div className={styles.productTop}><h4>{product.name}</h4>{variant && <strong>{money(variant.price.amount_cents)}</strong>}</div><p>{product.description ?? 'Uma receita especial da casa.'}</p>
      {product.variants.length > 1 && <select value={variantId} onChange={event => setVariantId(event.target.value)} aria-label={`Variação de ${product.name}`}>{product.variants.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select>}
      <button className={variant?.available ? styles.addButton : styles.unavailableButton} disabled={!variant?.available} onClick={() => variant && onAdd(product, variant)}>{variant?.available ? <>Adicionar <span>+</span></> : 'Indisponível'}</button>
    </div>
  </article>;
}

function getPickupTimeSlots(businessHours: Record<string, BusinessHoursDay> | null | undefined, timezone: string): string[] {
  if (!businessHours) return [];
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = fmt.formatToParts(now);
  const weekday = parts.find(p => p.type === 'weekday')?.value?.toLowerCase() ?? '';
  const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10) % 24;
  const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  const day = businessHours[weekday];
  if (!day?.open || !day.to) return [];
  const [closingH, closingM] = day.to.split(':').map(Number);
  const closingMinutes = (closingH ?? 23) * 60 + (closingM ?? 59);
  const firstSlotMinutes = Math.ceil((h * 60 + m + 30) / 30) * 30;
  const slots: string[] = [];
  for (let s = firstSlotMinutes; s <= closingMinutes; s += 30)
    slots.push(`${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`);
  return slots;
}

function pickupDatetimeValue(timeSlot: string, timezone: string): string {
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return `${todayStr}T${timeSlot}`;
}

function Checkout({ storeSlug, form, updateForm, submitting, onConfirm, onBack, phoneLoading, onPhoneChange, cartItems, subtotal, deliveryEnabled, fulfillmentConfig, paymentConfig, businessHours, storeTimezone }: {
  storeSlug: string;
  form: CheckoutForm; updateForm: <K extends keyof CheckoutForm>(key: K, value: CheckoutForm[K]) => void;
  submitting: boolean; onConfirm: (quoteId: string | null) => Promise<void>; onBack: () => void;
  phoneLoading: boolean; onPhoneChange: (value: string) => void;
  cartItems: CartItem[]; subtotal: number; deliveryEnabled: boolean;
  fulfillmentConfig?: FulfillmentConfig | undefined; paymentConfig?: PaymentConfig | undefined;
  businessHours?: Record<string, BusinessHoursDay> | null; storeTimezone?: string;
}) {
  const encodedStoreSlug = encodeURIComponent(storeSlug);
  const [step, setStep] = useState<'form'|'review'>('form');
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteId, setQuoteId] = useState<string|null>(null);
  const [deliveryFee, setDeliveryFee] = useState<number|null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [rawPhone, setRawPhone] = useState(() => form.phone.replace(/^\+55/, ''));
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [postalCodeLoading, setPostalCodeLoading] = useState(false);
  const [verifiedPostalCode, setVerifiedPostalCode] = useState('');
  const lastPostalCodeLookup = useRef('');
  const summaryCount = cartItems.reduce((total, item) => total + item.quantity, 0);

  const lookupPostalCode = useCallback(async (rawPostalCode:string) => {
    const postalCode = rawPostalCode.replace(/\D/g, '');
    if (!/^\d{8}$/.test(postalCode)) {
      setVerifiedPostalCode('');
      setQuoteError('Informe um CEP com 8 dígitos.');
      return;
    }
    lastPostalCodeLookup.current = postalCode;
    setPostalCodeLoading(true);
    setQuoteError('');
    try {
      const address = await jsonRequest<{postal_code:string;street:string;district:string;city:string;state:string}>(`/api/postal-code/${postalCode}`);
      updateForm('postalCode', address.postal_code);
      if(address.street) updateForm('street', address.street);
      if(address.district) updateForm('district', address.district);
      updateForm('city', address.city);
      updateForm('state', address.state);
      setVerifiedPostalCode(address.postal_code);
    } catch (cause) {
      setVerifiedPostalCode('');
      setQuoteError(cause instanceof Error ? cause.message : 'Não foi possível consultar o CEP.');
    } finally {
      setPostalCodeLoading(false);
    }
  }, [updateForm]);

  const isDelivery = form.fulfillment === 'DELIVERY' || form.fulfillment === 'DELIVERY_SCHEDULED';
  const needsAddress = isDelivery || form.fulfillment === 'PICKUP_BY_APP';

  useEffect(() => {
    const postalCode = form.postalCode.replace(/\D/g, '');
    if (needsAddress && postalCode.length === 8 && lastPostalCodeLookup.current !== postalCode) {
      void lookupPostalCode(postalCode);
    }
  }, [needsAddress, form.postalCode, lookupPostalCode]);

  async function handleContinue(event: FormEvent) {
    event.preventDefault();
    if (isDelivery) {
      const postalCode = form.postalCode.replace(/\D/g, '');
      const missingAddress = !form.street.trim() || !form.number.trim() || !form.complement.trim() || !form.district.trim() || !form.city.trim() || !/^[A-Z]{2}$/.test(form.state.trim().toUpperCase());
      if (postalCode !== verifiedPostalCode) {
        setQuoteError('Busque e valide o CEP antes de continuar.');
        return;
      }
      if (missingAddress) {
        setQuoteError('Preencha rua, número, complemento, bairro, cidade e UF para continuar.');
        return;
      }
      setQuoteLoading(true);
      setQuoteError('');
      try {
        const address = { street: form.street.trim(), number: form.number.trim(), complement: form.complement.trim(), district: form.district.trim(), city: form.city.trim(), state: form.state.trim().toUpperCase(), postal_code: postalCode };
        const quote = await jsonRequest<{ id: string; status: string; fee: { amount_cents: number } }>(`/api/store/${encodedStoreSlug}/delivery-quotes`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address }),
        });
        if (quote.status !== 'AVAILABLE') throw new Error('O endereço informado está fora da área de entrega.');
        setQuoteId(quote.id);
        setDeliveryFee(quote.fee.amount_cents);
        setStep('review');
      } catch (cause) {
        setQuoteError(cause instanceof Error ? cause.message : 'Não foi possível calcular o frete.');
      } finally {
        setQuoteLoading(false);
      }
    } else {
      setQuoteId(null);
      setDeliveryFee(null);
      setStep('review');
    }
  }

  const paymentLabel: Record<PaymentMethod, string> = {
    CASH: 'Dinheiro',
    CARD: 'Cartão (maquininha)',
    PIX: 'Pix',
    MERCADO_PAGO: 'Mercado Pago',
  };

  if (step === 'review') {
    const total = subtotal + (deliveryFee ?? 0);
    return <div className={styles.checkoutReview}>
      <button type="button" className={styles.backButton} onClick={() => setStep('form')}>← Editar dados</button>
      <h3>Confirme seu pedido</h3>
      <div className={styles.reviewItems}>
        {cartItems.map(item => <div key={item.variant.id} className={styles.reviewItem}>
          <span>{item.productName}{item.variant.name !== item.productName ? ` — ${item.variant.name}` : ''}</span>
          <span>{item.quantity}×</span>
          <strong>{money(item.variant.price.amount_cents * item.quantity)}</strong>
        </div>)}
      </div>
      <div className={styles.reviewTotals}>
        <div><span>Subtotal</span><span>{money(subtotal)}</span></div>
        {isDelivery && <div><span>Entrega</span><span>{deliveryFee === 0 ? 'Grátis' : deliveryFee !== null ? money(deliveryFee) : '—'}</span></div>}
        <div className={styles.reviewTotal}><strong>Total</strong><strong>{money(total)}</strong></div>
      </div>
      <div className={styles.reviewInfo}>
        <div><span>Nome</span><strong>{form.name}</strong></div>
        <div><span>WhatsApp</span><strong>{form.phone}</strong></div>
        {form.email && <div><span>E-mail</span><strong>{form.email}</strong></div>}
        {needsAddress && <div><span>Endereço</span><strong>{form.street}, {form.number}, {form.complement} — {form.district}, {form.city}-{form.state}</strong></div>}
        <div><span>Modalidade</span><strong>{fulfillmentLabel[form.fulfillment]}</strong></div>
        {form.scheduledFor && <div><span>Agendado para</span><strong>{new Date(form.scheduledFor).toLocaleString('pt-BR')}</strong></div>}
        <div><span>Pagamento</span><strong>{paymentLabel[form.paymentMethod]}</strong></div>
      </div>
      <button className={styles.primaryButton} disabled={submitting} onClick={() => void onConfirm(quoteId)}>
        {submitting ? 'Confirmando…' : `Confirmar · ${money(total)}`}
      </button>
    </div>;
  }

  return <form className={styles.checkout} onSubmit={e => void handleContinue(e)}>
    <div className={styles.checkoutCartSummary}>
      <button type="button" onClick={() => setSummaryOpen(current => !current)} aria-expanded={summaryOpen}>
        <span><b>{summaryCount} {summaryCount === 1 ? 'item' : 'itens'} no pedido</b><small>{money(subtotal)}</small></span>
        <strong>{summaryOpen ? 'Ocultar' : 'Ver pedido'} <i aria-hidden="true">{summaryOpen ? '↑' : '↓'}</i></strong>
      </button>
      {summaryOpen && <div className={styles.checkoutCartItems}>
        {cartItems.map(item => <div key={item.variant.id}><span>{item.quantity}× {item.productName}</span><strong>{money(item.variant.price.amount_cents * item.quantity)}</strong></div>)}
        <button type="button" onClick={onBack}>Editar itens</button>
      </div>}
    </div>
    <button type="button" className={styles.backButton} onClick={onBack}>← Voltar para o carrinho</button><h3>Seus dados</h3>
    <div className={styles.segmented}>
      {(fulfillmentConfig?.pickup_in_person_enabled ?? true) && <button type="button" className={form.fulfillment === 'PICKUP' ? styles.segmentActive : ''} onClick={() => updateForm('fulfillment', 'PICKUP')}>Retirada no local</button>}
      {(fulfillmentConfig?.pickup_by_app_enabled) && <button type="button" className={form.fulfillment === 'PICKUP_BY_APP' ? styles.segmentActive : ''} onClick={() => updateForm('fulfillment', 'PICKUP_BY_APP')}>Motoboy via app</button>}
      {(fulfillmentConfig?.delivery_enabled ?? deliveryEnabled) && <button type="button" className={form.fulfillment === 'DELIVERY' ? styles.segmentActive : ''} onClick={() => updateForm('fulfillment', 'DELIVERY')}>Entrega</button>}
      {(fulfillmentConfig?.scheduled_delivery_enabled) && <button type="button" className={form.fulfillment === 'DELIVERY_SCHEDULED' ? styles.segmentActive : ''} onClick={() => updateForm('fulfillment', 'DELIVERY_SCHEDULED')}>Entrega agendada</button>}
    </div>
    {!deliveryEnabled&&!fulfillmentConfig&&<p className={styles.checkoutHint}>Entrega em configuração. No momento, escolha retirada no local.</p>}
    <label>WhatsApp {phoneLoading&&<span className={styles.phoneSpinner}>…</span>}<div className={styles.phoneInput}><span className={styles.phonePrefix}>+55</span><input required placeholder="(11) 98765-4321" value={rawPhone} onChange={e=>{setRawPhone(e.target.value);onPhoneChange(normalizeBRPhone(e.target.value));}}/></div></label>
    <label>Seu nome<input required value={form.name} onChange={event => updateForm('name', event.target.value)} placeholder="Como prefere ser chamado?" /></label>
    {form.paymentMethod === 'MERCADO_PAGO' && (
      <label>E-mail <small style={{fontWeight:400,opacity:.65}}>(necessário para o Mercado Pago)</small><input type="email" required value={form.email} onChange={event => updateForm('email', event.target.value)} placeholder="seu@email.com" autoComplete="email" /></label>
    )}
    {needsAddress && <div className={styles.addressFields}>
      <label className={styles.wide}>CEP<div className={styles.postalCodeField}><input required inputMode="numeric" autoComplete="postal-code" maxLength={9} value={form.postalCode} onChange={event => {const value=event.target.value;updateForm('postalCode',value);if(value.replace(/\D/g,'')!==verifiedPostalCode)setVerifiedPostalCode('');}} placeholder="00000-000"/><button type="button" disabled={postalCodeLoading||form.postalCode.replace(/\D/g,'').length!==8} onClick={()=>void lookupPostalCode(form.postalCode)}>{postalCodeLoading?'Buscando…':'Buscar CEP'}</button></div>{verifiedPostalCode&&<small className={styles.postalCodeSuccess}>✓ CEP localizado</small>}</label>
      <label className={styles.wide}>Rua<input required autoComplete="address-line1" value={form.street} onChange={event => updateForm('street', event.target.value)} /></label><label>Número<input required autoComplete="address-line2" value={form.number} onChange={event => updateForm('number', event.target.value)} /></label>
      <label>Complemento<input required value={form.complement} onChange={event => updateForm('complement', event.target.value)} placeholder="Apto., bloco ou casa" /></label>
      <label>Bairro<input required value={form.district} onChange={event => updateForm('district', event.target.value)} /></label><label>Cidade<input required value={form.city} onChange={event => updateForm('city', event.target.value)} /></label>
      <label>UF<input required maxLength={2} autoComplete="address-level1" value={form.state} onChange={event => updateForm('state', event.target.value)} /></label>
    </div>}
    {form.fulfillment === 'DELIVERY_SCHEDULED' && (
      <label>Quando? (agendamento)<input type="datetime-local" required value={form.scheduledFor} onChange={e => updateForm('scheduledFor', e.target.value)} min={new Date(Date.now() + 30*60*1000).toISOString().slice(0,16)} /></label>
    )}
    {form.fulfillment === 'PICKUP' && fulfillmentConfig?.pickup_scheduling_enabled && (() => {
      const tz = storeTimezone ?? 'America/Sao_Paulo';
      const slots = getPickupTimeSlots(businessHours, tz);
      if (slots.length === 0) return <p className={styles.checkoutHint}>Sem horários de retirada disponíveis no momento.</p>;
      const sel = form.scheduledFor.length >= 16 ? form.scheduledFor.slice(11, 16) : '';
      return <label>Horário de retirada<select required value={sel} onChange={e => updateForm('scheduledFor', pickupDatetimeValue(e.target.value, tz))}>
        <option value="">Selecione um horário</option>
        {slots.map(s => <option key={s} value={s}>{s}</option>)}
      </select></label>;
    })()}
    <label>Pagamento<select value={form.paymentMethod} onChange={event => updateForm('paymentMethod', event.target.value as PaymentMethod)}>
      {(paymentConfig?.cash_enabled ?? true) && <option value="CASH">Dinheiro na entrega/retirada</option>}
      {(paymentConfig?.card_on_site_enabled) && <option value="CARD">Cartão na entrega/retirada</option>}
      {(paymentConfig?.pix_enabled ?? true) && <option value="PIX">Pix</option>}
      {(paymentConfig?.mercado_pago_enabled) && <option value="MERCADO_PAGO">Mercado Pago</option>}
    </select></label>
    {quoteError && <p className={styles.quoteError}>{quoteError}</p>}
    <button className={styles.primaryButton} disabled={quoteLoading||postalCodeLoading}>{quoteLoading ? 'Calculando frete…' : postalCodeLoading ? 'Localizando CEP…' : 'Revisar pedido →'}</button>
  </form>;
}

function HeroCarousel({ images, storeName, imageStyle }: { images: string[]; storeName: string; imageStyle: CSSProperties }) {
  const [index, setIndex] = useState(0);
  const touchStart = useRef<number|null>(null);
  useEffect(() => {
    if (images.length < 2) return;
    const id = setInterval(() => setIndex(current => (current + 1) % images.length), 4000);
    return () => clearInterval(id);
  }, [images.length]);
  return <div className={styles.heroCarousel}
    onTouchStart={event => { touchStart.current = event.changedTouches[0]?.clientX ?? null; }}
    onTouchEnd={event => {
      const start = touchStart.current;
      const end = event.changedTouches[0]?.clientX;
      touchStart.current = null;
      if (start === null || end === undefined || Math.abs(end - start) < 40 || images.length < 2) return;
      setIndex(current => end < start ? (current + 1) % images.length : (current - 1 + images.length) % images.length);
    }}>
    {images.map((src, i) => <img key={i} style={imageStyle} className={`${styles.carouselSlide} ${i === index ? styles.carouselSlideActive : ''}`} src={src} alt={i === 0 ? `Imagem principal de ${storeName}` : ''} aria-hidden={i !== index}/>)}
    {images.length > 1 && <div className={styles.carouselDots}>{images.map((_, i) => <button key={i} className={i === index ? styles.carouselDotActive : styles.carouselDot} onClick={() => setIndex(i)} aria-label={`Slide ${i + 1}`}/>)}</div>}
  </div>;
}

function SuggestionCard({ suggestion, onAdd }: { suggestion: Suggestion; onAdd: () => void }) {
  return <article className={styles.suggestionCard} onClick={onAdd}>
    {suggestion.image_url ? <img className={styles.suggestionImage} src={suggestion.image_url} alt={suggestion.product_name}/> : <div className={styles.suggestionImagePlaceholder}>{suggestion.product_name.slice(0,1)}</div>}
    <div className={styles.suggestionBody}><strong>{suggestion.product_name}</strong><span>{money(suggestion.price_cents)}</span></div>
    <button className={styles.suggestionAdd} aria-label={`Adicionar ${suggestion.product_name}`}>+</button>
  </article>;
}

function StoreIntro({ storeName, logoUrl, onDone, ready }: { storeName: string | null; logoUrl: string | null; onDone: () => void; ready: boolean }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1050);
    const t2 = setTimeout(() => setPhase(2), 1950);
    const t3 = setTimeout(() => onDone(), 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);
  const letters = 'SamJoE'.split('');
  return (
    <div className={`${styles.introOverlay} ${phase >= 2 && ready ? styles.introExit : ''}`}>
      <div className={`${styles.introSamjoe} ${phase >= 1 ? styles.introFadeOut : ''}`}>
        <div className={styles.introLetters}>
          {letters.map((char, i) => (
            <span key={i} className={styles.introLetter} style={{ animationDelay: `${i * 85}ms` }}>{char}</span>
          ))}
        </div>
      </div>
      <div className={`${styles.introStore} ${phase >= 1 ? styles.introFadeIn : ''}`}>
        {logoUrl ? <img className={styles.introStoreLogo} src={logoUrl} alt={storeName ?? 'Loja'}/> : <div className={styles.introMark}>{storeName ? initials(storeName) : 'SJ'}</div>}
        {storeName && <strong>{storeName}</strong>}
      </div>
    </div>
  );
}

function heroSizeClass(size:StorefrontConfig['hero_image_size']){return size==='SMALL'?styles.heroSmall:size==='LARGE'?styles.heroLarge:styles.heroMedium}
function heroSectionClass(size:StorefrontConfig['hero_section_size']){return size==='COMPACT'?styles.heroSectionCompact:size==='TALL'?styles.heroSectionTall:styles.heroSectionNormal}
function initials(value:string){return value.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'SJ'}
function storeFont(value:StorefrontConfig['font_family']){return value==='MODERN'?'Inter, Arial, sans-serif':value==='ROUNDED'?'"Trebuchet MS", Arial, sans-serif':'Georgia, serif'}
