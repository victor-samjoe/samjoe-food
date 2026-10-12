'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import styles from './storefront.module.css';

type Money = { amount_cents: number; currency: string };
type Variant = { id: string; sku: string; name: string; price: Money; available: boolean };
type Product = { id: string; name: string; description: string | null; image_url: string | null; variants: Variant[] };
type Category = { id: string | null; name: string | null; slug: string | null; products: Product[] };
type StorefrontConfig = { brand_subtitle:string; hero_eyebrow:string; hero_title:string; hero_description:string; primary_color:string; accent_color:string; background_color:string; hero_image_enabled:boolean; hero_image_url:string|null; hero_image_size:'SMALL'|'MEDIUM'|'LARGE'; hero_display_mode:'CORNER'|'FULLSCREEN'|'FLAME'|'CAROUSEL'; hero_images:string[]; hero_section_size:'COMPACT'|'NORMAL'|'TALL'; hero_image_fit:'FILL'|'FIT'; logo_url:string|null; font_family:'CLASSIC'|'MODERN'|'ROUNDED'; text_case:'AS_TYPED'|'UPPERCASE'; hero_bg_type?:'GRADIENT'|'COLOR'|'IMAGE'; hero_bg_color?:string|null; hero_bg_image_url?:string|null };
type Catalog = { store: { name: string; slug: string; timezone: string; storefront:Partial<StorefrontConfig> }; categories: Category[]; version: string };
type CartItem = { productId: string; productName: string; imageUrl: string | null; variant: Variant; quantity: number };
type Fulfillment = 'PICKUP' | 'DELIVERY';
type PaymentMethod = 'CASH' | 'PIX' | 'MERCADO_PAGO';
type CheckoutForm = {
  name: string; phone: string; fulfillment: Fulfillment; paymentMethod: PaymentMethod;
  street: string; number: string; district: string; city: string; state: string; postalCode: string;
};
type Suggestion = { product_id:string; product_name:string; description:string|null; image_url:string|null; variant_id:string; price_cents:number; currency:string; order_count:number };

const initialForm: CheckoutForm = {
  name: '', phone: '', fulfillment: 'PICKUP', paymentMethod: 'CASH',
  street: '', number: '', district: '', city: '', state: 'SP', postalCode: '',
};
const defaultStorefront:StorefrontConfig={brand_subtitle:'Confeitaria artesanal',hero_eyebrow:'feito com calma, servido com carinho',hero_title:'Um pedaço de doçura para deixar o dia mais leve.',hero_description:'Escolha seus favoritos, monte o carrinho e envie seu pedido em poucos passos.',primary_color:'#9f3f35',accent_color:'#e7b55f',background_color:'#fffaf4',hero_image_enabled:true,hero_image_url:null,hero_image_size:'MEDIUM',hero_display_mode:'CORNER',hero_images:[],hero_section_size:'NORMAL',hero_image_fit:'FILL',logo_url:null,font_family:'CLASSIC',text_case:'AS_TYPED'};

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

async function jsonRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
  if (!response.ok) throw new Error(body?.error?.message ?? `Erro HTTP ${response.status}`);
  return body as T;
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
  const [order, setOrder] = useState<{ public_number: string; status: string; total: Money } | null>(null);
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
            if(addr)setForm(current=>({...current,street:addr.street??current.street,number:addr.number??current.number,district:addr.district??current.district,city:addr.city??current.city,state:addr.state??current.state,postalCode:addr.postal_code??current.postalCode}));
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
      const data = await jsonRequest<Catalog>(`/api/store/${encodedStoreSlug}/catalog`);
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
            if(addr) setForm(current=>({...current,street:addr.street??current.street,number:addr.number??current.number,district:addr.district??current.district,city:addr.city??current.city,state:addr.state??current.state,postalCode:addr.postal_code??current.postalCode}));
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
  const heroBgStyle=useMemo(():CSSProperties|undefined=>{if(storefront.hero_bg_type==='IMAGE'&&storefront.hero_bg_image_url)return{backgroundImage:`url(${storefront.hero_bg_image_url})`,backgroundSize:'cover',backgroundPosition:'center'};if(storefront.hero_bg_type==='COLOR'&&storefront.hero_bg_color)return{background:storefront.hero_bg_color};return undefined;},[storefront.hero_bg_type,storefront.hero_bg_image_url,storefront.hero_bg_color]);
  const storefrontStyle={'--store-primary':storefront.primary_color,'--store-accent':storefront.accent_color,'--store-background':storefront.background_color,'--store-font':storeFont(storefront.font_family),'--hero-fit':storefront.hero_image_fit==='FIT'?'contain':'cover'} as CSSProperties;
  const heroImages = storefront.hero_images?.length ? storefront.hero_images : (storefront.hero_image_url ? [storefront.hero_image_url] : []);

  function add(product: Product, variant: Variant) {
    if (!variant.available) return;
    setCart(current => ({
      ...current,
      [variant.id]: {
        productId: product.id,
        productName: product.name,
        imageUrl: product.image_url,
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
      street: form.street, number: form.number, district: form.district, city: form.city,
      state: form.state.toUpperCase(), postal_code: form.postalCode.replace(/\D/g, ''),
    };
    try {
      const created = await jsonRequest<{ public_number: string; status: string; total: Money }>(`/api/store/${encodedStoreSlug}/orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          customer: { name: form.name, phone_e164: form.phone },
          fulfillment: form.fulfillment,
          address: form.fulfillment === 'DELIVERY' ? address : null,
          delivery_quote_id: quoteId,
          items: cartItems.map(item => ({ variant_id: item.variant.id, quantity: item.quantity })),
          payment_method: form.paymentMethod,
          notes: '',
        }),
      });
      setOrder(created);
      setCart({});
      setCheckoutOpen(false);
      setCartOpen(false);
      await loadCatalog();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar o pedido.');
    } finally {
      setSubmitting(false);
    }
  }

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
        <button className={styles.cartButton} onClick={() => setCartOpen(true)} aria-label={`Abrir carrinho com ${itemCount} itens`}>
          <span>Carrinho</span><b>{itemCount}</b>
        </button>
      </header>

      <section className={`${styles.hero} ${!storefront.hero_image_enabled?styles.heroWithoutImage:''} ${heroSectionClass(storefront.hero_section_size)} ${storefront.hero_image_enabled&&storefront.hero_display_mode==='FULLSCREEN'?styles.heroFullscreen:''}`} id="inicio" style={heroBgStyle}>
        {storefront.hero_image_enabled&&storefront.hero_display_mode==='FULLSCREEN'&&heroImages[0]&&<img className={styles.heroFullscreenBg} src={heroImages[0]} alt="" aria-hidden="true"/>}
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>{storefront.hero_eyebrow}</span>
          <h1>{storefront.hero_title}</h1>
          <p>{storefront.hero_description}</p>
          <a href="#cardapio" className={styles.heroAction}>Ver cardápio <span>↓</span></a>
        </div>
        {storefront.hero_image_enabled&&storefront.hero_display_mode==='CAROUSEL'&&heroImages.length>0&&<HeroCarousel images={heroImages} storeName={storeName}/>}
        {storefront.hero_image_enabled&&storefront.hero_display_mode==='CORNER'&&<div className={`${styles.heroArt} ${heroSizeClass(storefront.hero_image_size)}`} aria-hidden={!storefront.hero_image_url}>{storefront.hero_image_url?<img className={styles.heroImage} src={storefront.hero_image_url} alt={`Imagem principal de ${storeName}`}/>:<><div className={styles.sun}/><div className={styles.cake}><span/><i/></div><div className={styles.leafOne}>✦</div><div className={styles.leafTwo}>✦</div></>}</div>}
        {storefront.hero_image_enabled&&storefront.hero_display_mode==='FLAME'&&heroImages[0]&&<div className={`${styles.heroArt} ${styles.heroFlame} ${heroSizeClass(storefront.hero_image_size)}`}><img className={styles.heroImage} src={heroImages[0]} alt={`Imagem principal de ${storeName}`}/></div>}
        {storefront.hero_image_enabled&&storefront.hero_display_mode==='FLAME'&&!heroImages[0]&&<div className={`${styles.heroArt} ${styles.heroFlame} ${heroSizeClass(storefront.hero_image_size)}`}><><div className={styles.sun}/><div className={styles.cake}><span/><i/></div><div className={styles.leafOne}>✦</div><div className={styles.leafTwo}>✦</div></></div>}
      </section>

      {suggestions.length>0&&<section className={styles.suggestions} id="sugestoes">
        <div className={styles.suggestionsHeader}><div><span className={styles.kicker}>{suggestionsPersonalized?'SEUS FAVORITOS':'MAIS PEDIDOS'}</span><h2>{suggestionsPersonalized?'O que você costuma pedir':'O que os clientes mais adoram'}</h2></div></div>
        <div className={styles.suggestionsGrid}>{suggestions.map(s=><SuggestionCard key={s.product_id} suggestion={s} onAdd={()=>{const variant:Variant={id:s.variant_id,sku:'',name:s.product_name,price:{amount_cents:s.price_cents,currency:s.currency},available:true};const product:Product={id:s.product_id,name:s.product_name,description:s.description,image_url:s.image_url,variants:[variant]};add(product,variant);}}/>)}</div>
      </section>}

      <section className={styles.catalog} id="cardapio">
        <div className={styles.catalogHeading}>
          <div><span className={styles.kicker}>CARDÁPIO DIGITAL</span><h2>Escolha o seu momento doce</h2></div>
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

      <section className={styles.promise}><span>✦</span><div><strong>Ambiente 100% demonstrativo</strong><p>Produtos, clientes, endereços e pedidos desta tela são inteiramente fictícios.</p></div></section>
      <footer className={styles.footer}><span>{storeName} · tecnologia SamJoE Food</span><span>SamJoE Tech &amp; Consulting</span></footer>
      {itemCount > 0 && <button className={styles.mobileCart} onClick={() => setCartOpen(true)}><b>{itemCount}</b><span>Ver carrinho</span><strong>{money(subtotal)}</strong></button>}

      {cartOpen && <>
        <button className={styles.backdrop} aria-label="Fechar carrinho" onClick={() => { setCartOpen(false); setCheckoutOpen(false); }} />
        <aside className={styles.drawer} aria-label="Carrinho de compras">
          <div className={styles.drawerHeader}><div><span className={styles.kicker}>SEU PEDIDO</span><h2>Carrinho</h2></div><button onClick={() => { setCartOpen(false); setCheckoutOpen(false); }} aria-label="Fechar">×</button></div>
          {cartItems.length === 0 ? <div className={styles.emptyCart}><span>◇</span><p>Seu carrinho está vazio.</p></div> : <>
            <div className={styles.cartList}>{cartItems.map(item => <div className={styles.cartItem} key={item.variant.id}>
              <div className={styles.cartThumb}>{item.imageUrl?<img src={item.imageUrl} alt="" className={styles.cartThumbImg} aria-hidden="true"/>:item.productName.slice(0,1)}</div>
              <div className={styles.cartDetails}><strong>{item.productName}</strong><small>{item.variant.name}</small><span>{money(item.variant.price.amount_cents)}</span></div>
              <div className={styles.quantity}><button onClick={() => changeQuantity(item.variant.id, -1)}>−</button><b>{item.quantity}</b><button onClick={() => changeQuantity(item.variant.id, 1)}>+</button></div>
            </div>)}</div>
            {!checkoutOpen ? <div className={styles.cartFooter}><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><small>Taxa de entrega calculada na próxima etapa.</small><button className={styles.primaryButton} onClick={() => setCheckoutOpen(true)}>Continuar pedido</button></div>
              : <Checkout storeSlug={storeSlug} form={form} updateForm={updateForm} submitting={submitting} onConfirm={submitOrder} onBack={() => setCheckoutOpen(false)} phoneLoading={phoneLoading} onPhoneChange={handlePhoneChange} cartItems={cartItems} subtotal={subtotal}/>} 
          </>}
        </aside>
      </>}

      {order && <div className={styles.orderOverlay} role="dialog" aria-modal="true" aria-label="Pedido confirmado"><div className={styles.orderSuccess}>
        <span className={styles.successIcon}>✓</span><span className={styles.kicker}>PEDIDO CRIADO</span><h2>Deu tudo certo!</h2><p>Seu pedido fictício entrou no painel operacional.</p>
        <strong className={styles.orderNumber}>{order.public_number}</strong><div className={styles.orderTotal}><span>Total</span><b>{money(order.total.amount_cents)}</b></div><button className={styles.primaryButton} onClick={() => setOrder(null)}>Voltar ao cardápio</button>
      </div></div>}
    </main>
    </>
  );
}

function ProductCard({ product, index, onAdd }: { product: Product; index: number; onAdd: (product: Product, variant: Variant) => void }) {
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? '');
  const variant = product.variants.find(item => item.id === variantId) ?? product.variants[0];
  const tones = [styles.toneRose, styles.toneGold, styles.toneMint];
  const tone = tones[index % tones.length];
  return <article className={styles.productCard}>
    <div className={`${styles.productVisual} ${tone}`}>{product.image_url?<img className={styles.productPhoto} src={product.image_url} alt={product.name}/>:<><span className={styles.productMonogram}>{product.name.split(' ').slice(-1)[0]?.slice(0, 1)}</span><small>imagem em breve</small></>}</div>
    <div className={styles.productBody}><div className={styles.productTop}><h4>{product.name}</h4>{variant && <strong>{money(variant.price.amount_cents)}</strong>}</div><p>{product.description ?? 'Uma receita especial da casa.'}</p>
      {product.variants.length > 1 && <select value={variantId} onChange={event => setVariantId(event.target.value)} aria-label={`Variação de ${product.name}`}>{product.variants.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select>}
      <button className={variant?.available ? styles.addButton : styles.unavailableButton} disabled={!variant?.available} onClick={() => variant && onAdd(product, variant)}>{variant?.available ? <>Adicionar <span>+</span></> : 'Indisponível'}</button>
    </div>
  </article>;
}

function Checkout({ storeSlug, form, updateForm, submitting, onConfirm, onBack, phoneLoading, onPhoneChange, cartItems, subtotal }: {
  storeSlug: string;
  form: CheckoutForm; updateForm: <K extends keyof CheckoutForm>(key: K, value: CheckoutForm[K]) => void;
  submitting: boolean; onConfirm: (quoteId: string | null) => Promise<void>; onBack: () => void;
  phoneLoading: boolean; onPhoneChange: (value: string) => void;
  cartItems: CartItem[]; subtotal: number;
}) {
  const encodedStoreSlug = encodeURIComponent(storeSlug);
  const [step, setStep] = useState<'form'|'review'>('form');
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteId, setQuoteId] = useState<string|null>(null);
  const [deliveryFee, setDeliveryFee] = useState<number|null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [rawPhone, setRawPhone] = useState(() => form.phone.replace(/^\+55/, ''));

  async function handleContinue(event: FormEvent) {
    event.preventDefault();
    if (form.fulfillment === 'DELIVERY') {
      setQuoteLoading(true);
      setQuoteError('');
      try {
        const address = { street: form.street, number: form.number, district: form.district, city: form.city, state: form.state.toUpperCase(), postal_code: form.postalCode.replace(/\D/g, '') };
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

  if (step === 'review') {
    const total = subtotal + (deliveryFee ?? 0);
    const payLabel = form.paymentMethod === 'CASH' ? 'Dinheiro' : form.paymentMethod === 'PIX' ? 'Pix' : 'Mercado Pago';
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
        {form.fulfillment === 'DELIVERY' && <div><span>Entrega</span><span>{deliveryFee !== null ? money(deliveryFee) : '—'}</span></div>}
        <div className={styles.reviewTotal}><strong>Total</strong><strong>{money(total)}</strong></div>
      </div>
      <div className={styles.reviewInfo}>
        <div><span>Nome</span><strong>{form.name}</strong></div>
        <div><span>WhatsApp</span><strong>{form.phone}</strong></div>
        {form.fulfillment === 'DELIVERY' && <div><span>Endereço</span><strong>{form.street}, {form.number} — {form.district}, {form.city}-{form.state}</strong></div>}
        <div><span>Modalidade</span><strong>{form.fulfillment === 'PICKUP' ? 'Retirada no local' : 'Entrega'}</strong></div>
        <div><span>Pagamento</span><strong>{payLabel}</strong></div>
      </div>
      <button className={styles.primaryButton} disabled={submitting} onClick={() => void onConfirm(quoteId)}>
        {submitting ? 'Confirmando…' : `Confirmar · ${money(total)}`}
      </button>
    </div>;
  }

  return <form className={styles.checkout} onSubmit={e => void handleContinue(e)}>
    <button type="button" className={styles.backButton} onClick={onBack}>← Voltar para o carrinho</button><h3>Seus dados</h3>
    <div className={styles.segmented}><button type="button" className={form.fulfillment === 'PICKUP' ? styles.segmentActive : ''} onClick={() => updateForm('fulfillment', 'PICKUP')}>Retirada</button><button type="button" className={form.fulfillment === 'DELIVERY' ? styles.segmentActive : ''} onClick={() => updateForm('fulfillment', 'DELIVERY')}>Entrega</button></div>
    <label>WhatsApp {phoneLoading&&<span className={styles.phoneSpinner}>…</span>}<div className={styles.phoneInput}><span className={styles.phonePrefix}>+55</span><input required placeholder="(11) 98765-4321" value={rawPhone} onChange={e=>{setRawPhone(e.target.value);onPhoneChange(normalizeBRPhone(e.target.value));}}/></div></label>
    <label>Seu nome<input required value={form.name} onChange={event => updateForm('name', event.target.value)} placeholder="Como prefere ser chamado?" /></label>
    {form.fulfillment === 'DELIVERY' && <div className={styles.addressFields}>
      <label className={styles.wide}>Rua<input required value={form.street} onChange={event => updateForm('street', event.target.value)} /></label><label>Número<input required value={form.number} onChange={event => updateForm('number', event.target.value)} /></label>
      <label>Bairro<input required value={form.district} onChange={event => updateForm('district', event.target.value)} /></label><label>Cidade<input required value={form.city} onChange={event => updateForm('city', event.target.value)} /></label>
      <label>UF<input required maxLength={2} value={form.state} onChange={event => updateForm('state', event.target.value)} /></label><label>CEP<input required inputMode="numeric" value={form.postalCode} onChange={event => updateForm('postalCode', event.target.value)} /></label>
    </div>}
    <label>Pagamento<select value={form.paymentMethod} onChange={event => updateForm('paymentMethod', event.target.value as PaymentMethod)}><option value="CASH">Dinheiro na retirada/entrega</option><option value="PIX">Pix simulado</option><option value="MERCADO_PAGO">Mercado Pago simulado</option></select></label>
    {quoteError && <p className={styles.quoteError}>{quoteError}</p>}
    <button className={styles.primaryButton} disabled={quoteLoading}>{quoteLoading ? 'Calculando frete…' : 'Revisar pedido →'}</button>
  </form>;
}

function HeroCarousel({ images, storeName }: { images: string[]; storeName: string }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (images.length < 2) return;
    const id = setInterval(() => setIndex(current => (current + 1) % images.length), 4000);
    return () => clearInterval(id);
  }, [images.length]);
  return <div className={styles.heroCarousel}>
    {images.map((src, i) => <img key={i} className={`${styles.carouselSlide} ${i === index ? styles.carouselSlideActive : ''}`} src={src} alt={i === 0 ? `Imagem principal de ${storeName}` : ''} aria-hidden={i !== index}/>)}
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
