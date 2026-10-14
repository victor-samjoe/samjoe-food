"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import styles from "./admin.module.css";

type Tab = "overview" | "orders" | "deliveries" | "products" | "store";
type OrderStatus =
  | "PAYMENT_PENDING"
  | "PAYMENT_FAILED"
  | "NEW"
  | "CONFIRMED"
  | "IN_PREPARATION"
  | "READY"
  | "READY_FOR_PICKUP"
  | "OUT_FOR_DELIVERY"
  | "COMPLETED"
  | "CANCELLED";
type Order = {
  order_id: string;
  public_number: string;
  status: OrderStatus;
  customer_name: string;
  total_cents: number;
  delivery_fee_cents: number;
  currency: string;
  fulfillment: string;
  placed_at: string;
  district: string | null;
  items_label: string | null;
};
type Driver = {
  id: string;
  name: string;
  phone_e164: string | null;
  status: string;
  is_active: boolean;
};
type ReadyOrder = {
  order_id: string;
  public_number: string;
  customer_name: string;
  address_snapshot: Record<string, string>;
};
type Stop = {
  stop_id: string;
  public_number: string;
  customer_name: string;
  sequence: number;
  status: string;
  address_snapshot: Record<string, string>;
};
type DeliveryRoute = {
  route_id: string;
  driver_id: string;
  driver_name: string;
  status: string;
  stop_count: number;
  completed_count: number;
  stops: Stop[];
};
type Board = {
  drivers: Driver[];
  ready_orders: ReadyOrder[];
  routes: DeliveryRoute[];
};
type Variant = {
  id: string;
  sku: string;
  name: string;
  price_cents: number;
  currency: string;
  is_active: boolean;
};
type Product = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_archived: boolean;
  cover_image_url: string | null;
  category: { id: string; name: string } | null;
  variants: Variant[];
  has_orders: boolean;
};
type Category = {
  category_id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  product_count: number;
};
type Address = {
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  postal_code: string;
  reference: string;
};
type StorefrontConfig = {
  brand_subtitle: string;
  hero_eyebrow: string;
  hero_title: string;
  hero_description: string;
  primary_color: string;
  accent_color: string;
  background_color: string;
  header_background_color: string;
  brand_name_color: string;
  brand_subtitle_color: string;
  hero_eyebrow_color: string;
  hero_title_color: string;
  hero_description_color: string;
  hero_image_enabled: boolean;
  hero_image_url: string | null;
  hero_image_size: "SMALL" | "MEDIUM" | "LARGE";
  hero_display_mode: "CORNER" | "FULLSCREEN" | "FLAME" | "CAROUSEL";
  hero_images: string[];
  hero_section_size: "COMPACT" | "NORMAL" | "TALL";
  hero_image_fit: "FILL" | "FIT";
  hero_image_scale: number;
  hero_image_position_x: number;
  hero_image_position_y: number;
  logo_url: string | null;
  font_family: "CLASSIC" | "MODERN" | "ROUNDED";
  text_case: "AS_TYPED" | "UPPERCASE";
  hero_bg_type?: "GRADIENT" | "COLOR" | "IMAGE";
  hero_bg_color?: string | null;
  hero_bg_image_url?: string | null;
  hero_bg_image_scale: number;
  hero_bg_position_x: number;
  hero_bg_position_y: number;
};
type BusinessHoursDay = { open: boolean; from: string | null; to: string | null };
type Store = {
  store_id: string;
  store_slug: string;
  store_name: string;
  currency: string;
  timezone: string;
  status: "ACTIVE" | "INACTIVE";
  origin_address: Partial<Address> | null;
  storefront_config: Partial<StorefrontConfig>;
  delivery_status?: "PENDING" | "ACTIVE";
  is_open?: boolean;
  is_open_reason?: string | null;
  business_hours?: Record<string, BusinessHoursDay> | null;
  scheduled_delivery_enabled?: boolean;
  pickup_in_person_enabled?: boolean;
  pickup_by_app_enabled?: boolean;
  pickup_scheduling_enabled?: boolean;
  cash_enabled?: boolean;
  card_on_site_enabled?: boolean;
  pix_enabled?: boolean;
  mercado_pago_enabled?: boolean;
};
type DeliveryPricing = {
  id: string;
  version: string;
  base_fee_cents: number;
  included_meters: number;
  price_per_extra_km_cents: number;
  standard_radius_meters: number;
  maximum_radius_meters: number;
  exception_fee_cents: number;
  free_delivery_radius_meters: number;
  is_active: boolean;
};
type DeliveryDiagnostics = {
  delivery_status: "PENDING" | "ACTIVE";
  origin_complete: boolean;
  active_rule: boolean;
  google_routes_configured: boolean;
  expected_source: string;
  warnings: string[];
};
type MpIntegration = {
  has_access_token: boolean;
  public_key: string | null;
  is_active: boolean;
};
type Notice = {
  id: string;
  message: string;
  kind: "success" | "error";
  created_at: string;
};
type OrderDetail = {
  order: Order & {
    customer_id: string;
    phone_e164: string | null;
    email: string | null;
    notes: string | null;
    subtotal_cents: number;
    delivery_fee_cents: number;
    address_snapshot: Record<string, string> | null;
    next_states: OrderStatus[];
  };
  items: Array<{
    item_id: string;
    sku_snapshot: string;
    name_snapshot: string;
    quantity: number;
    unit_price_cents: number;
    line_total_cents: number;
    notes: string | null;
  }>;
  status_history: Array<{
    event_id: string;
    to_status: string;
    actor_type: string;
    actor_id: string | null;
    notes: string | null;
    occurred_at: string;
  }>;
};

const activeStatuses: OrderStatus[] = [
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
  "NEW",
  "CONFIRMED",
  "IN_PREPARATION",
  "READY",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
];
const statusLabel: Record<string, string> = {
  PAYMENT_PENDING: "Aguardando pagamento",
  PAYMENT_FAILED: "Pagamento falhou",
  NEW: "Novo",
  CONFIRMED: "Confirmado",
  IN_PREPARATION: "Em preparo",
  READY: "Pronto",
  READY_FOR_PICKUP: "Pronto para retirada",
  OUT_FOR_DELIVERY: "Em entrega",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  AVAILABLE: "Disponível",
  RESERVED: "Reservado",
  DELIVERING: "Em rota",
  UNAVAILABLE: "Indisponível",
  RETURNING: "Retornando",
  AWAITING_ACCEPTANCE: "Aguardando aceite",
  ACCEPTED: "Aceita",
  IN_PROGRESS: "Em andamento",
  PENDING: "Pendente",
  DELIVERED: "Entregue",
  FAILED: "Falhou",
  ACTIVE: "Aberta",
  INACTIVE: "Fechada",
};
const nextAction: Partial<
  Record<OrderStatus, { to: OrderStatus; label: string }>
> = {
  NEW: { to: "CONFIRMED", label: "Confirmar" },
  CONFIRMED: { to: "IN_PREPARATION", label: "Iniciar preparo" },
  IN_PREPARATION: { to: "READY", label: "Marcar pronto" },
  READY_FOR_PICKUP: { to: "COMPLETED", label: "Confirmar retirada" },
};
const emptyAddress: Address = {
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "SP",
  postal_code: "",
  reference: "",
};
const defaultStorefront: StorefrontConfig = {
  brand_subtitle: "Confeitaria artesanal",
  hero_eyebrow: "feito com calma, servido com carinho",
  hero_title: "Um pedaço de doçura para deixar o dia mais leve.",
  hero_description:
    "Escolha seus favoritos, monte o carrinho e envie seu pedido em poucos passos.",
  primary_color: "#9f3f35",
  accent_color: "#e7b55f",
  background_color: "#fffaf4",
  header_background_color: "#ffffff",
  brand_name_color: "#3f2d27",
  brand_subtitle_color: "#846f64",
  hero_eyebrow_color: "#9f3f35",
  hero_title_color: "#452d27",
  hero_description_color: "#795f53",
  hero_image_enabled: true,
  hero_image_url: null,
  hero_image_size: "MEDIUM",
  hero_display_mode: "CORNER",
  hero_images: [],
  hero_section_size: "NORMAL",
  hero_image_fit: "FILL",
  hero_image_scale: 1,
  hero_image_position_x: 50,
  hero_image_position_y: 50,
  logo_url: null,
  font_family: "CLASSIC",
  text_case: "AS_TYPED",
  hero_bg_image_scale: 1,
  hero_bg_position_x: 50,
  hero_bg_position_y: 50,
};
const defaultDeliveryPricing: DeliveryPricing = {
  id: "",
  version: "primeira configuração",
  base_fee_cents: 0,
  included_meters: 0,
  price_per_extra_km_cents: 0,
  standard_radius_meters: 0,
  maximum_radius_meters: 0,
  exception_fee_cents: 0,
  free_delivery_radius_meters: 0,
  is_active: false,
};

function saoPauloDate(value: string | Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(typeof value === "string" ? new Date(value) : value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function api<T>(
  path: string,
  token: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/backend/${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(body?.error?.message ?? `Erro HTTP ${response.status}`);
  return body as T;
}

const DAYS = [
  { key: "monday", label: "Segunda" },
  { key: "tuesday", label: "Terça" },
  { key: "wednesday", label: "Quarta" },
  { key: "thursday", label: "Quinta" },
  { key: "friday", label: "Sexta" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
] as const;

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [token, setToken] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [board, setBoard] = useState<Board>({
    drivers: [],
    ready_orders: [],
    routes: [],
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [store, setStore] = useState<Store | null>(null);
  const [storeNameDraft, setStoreNameDraft] = useState("");
  const [address, setAddress] = useState<Address>(emptyAddress);
  const [fulfillmentConfig, setFulfillmentConfig] = useState({
    scheduled_delivery_enabled: false,
    pickup_in_person_enabled: true,
    pickup_by_app_enabled: false,
    pickup_scheduling_enabled: false,
  });
  const [paymentConfig, setPaymentConfig] = useState({
    cash_enabled: true,
    card_on_site_enabled: false,
    pix_enabled: true,
    mercado_pago_enabled: false,
  });
  const [error, setError] = useState("");
  const [noticeHistory, setNoticeHistory] = useState<Notice[]>([]);
  const [toast, setToast] = useState<Notice | null>(null);
  const [toastLeaving, setToastLeaving] = useState(false);
  const [showNoticeHistory, setShowNoticeHistory] = useState(false);
  const [unreadNotices, setUnreadNotices] = useState(0);
  const [busy, setBusy] = useState("");
  const [selectedDriver, setSelectedDriver] = useState("");
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [driverName, setDriverName] = useState("Novo entregador");
  const [driverPhone, setDriverPhone] = useState("+5511999990003");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingProductImage, setEditingProductImage] = useState<
    string | null | undefined
  >(undefined);
  const [orderView, setOrderView] = useState<"kanban" | "list">("kanban");
  const [pricing, setPricing] = useState<DeliveryPricing | null>(null);
  const [deliveryDiagnostics, setDeliveryDiagnostics] =
    useState<DeliveryDiagnostics | null>(null);
  const [showPricing, setShowPricing] = useState(false);
  const [showFreteTest, setShowFreteTest] = useState(false);
  const [storefront, setStorefront] =
    useState<StorefrontConfig>(defaultStorefront);
  const [storeStep, setStoreStep] = useState(0);
  const [freteTest, setFreteTest] = useState({
    street: "",
    number: "",
    district: "",
    city: "",
    state: "SP",
    postal_code: "",
  });
  const [freteResult, setFreteResult] = useState<{
    fee_cents: number | null;
    status: string;
    error: string | null;
    distance_meters?: number | undefined;
    route_source?: string | undefined;
    free_delivery_applied?: boolean | undefined;
  } | null>(null);
  const [freteBusy, setFreteBusy] = useState(false);
  const [cepBusy, setCepBusy] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [productFilter, setProductFilter] = useState("");
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [newProductForm, setNewProductForm] = useState({
    name: "",
    description: "",
    price: "",
    sku: "",
    category_id: "",
    cover_image_url: null as string | null,
  });
  const [newProductImageBusy, setNewProductImageBusy] = useState(false);
  const [dateFilter, setDateFilter] = useState(() => saoPauloDate());
  const toastTimers = useRef<{
    fade?: ReturnType<typeof setTimeout>;
    clear?: ReturnType<typeof setTimeout>;
  }>({});
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [variantPriceDrafts, setVariantPriceDrafts] = useState<
    Record<string, string>
  >({});
  const [editingProductCategory, setEditingProductCategory] = useState<
    string | null | undefined
  >(undefined);
  const [isOpenReason, setIsOpenReason] = useState("");
  const [showHoursConfig, setShowHoursConfig] = useState(false);
  const [hoursForm, setHoursForm] = useState<Record<string, BusinessHoursDay>>({});
  const [mpConfig, setMpConfig] = useState<MpIntegration>({ has_access_token: false, public_key: null, is_active: false });
  const [mpAccessToken, setMpAccessToken] = useState("");
  const [mpPublicKey, setMpPublicKey] = useState("");

  useEffect(() => {
    if (store?.store_name) document.title = `${store.store_name} — Admin`;
  }, [store?.store_name]);

  const pushNotice = useCallback(
    (noticeMessage: string, kind: Notice["kind"] = "success") => {
      const item: Notice = {
        id: crypto.randomUUID(),
        message: noticeMessage,
        kind,
        created_at: new Date().toISOString(),
      };
      setNoticeHistory((current) => {
        const next = [item, ...current].slice(0, 50);
        window.localStorage.setItem(
          "samjoe-admin-notices",
          JSON.stringify(next),
        );
        return next;
      });
      setUnreadNotices((current) => current + 1);
      if (toastTimers.current.fade) clearTimeout(toastTimers.current.fade);
      if (toastTimers.current.clear) clearTimeout(toastTimers.current.clear);
      setToastLeaving(false);
      setToast(item);
      toastTimers.current.fade = setTimeout(() => setToastLeaving(true), 2500);
      toastTimers.current.clear = setTimeout(() => setToast(null), 3000);
    },
    [],
  );

  const loadOpsData = useCallback(
    async (accessToken: string) => {
      if (!store?.store_slug) return;
      try {
        const [orderData, deliveryData, productData] = await Promise.all([
          api<{ orders: Order[] }>(
            `admin/stores/${store.store_slug}/orders?limit=200`,
            accessToken,
          ),
          api<Board>(
            `admin/stores/${store.store_slug}/delivery-board`,
            accessToken,
          ),
          api<{ products: Product[] }>(
            `admin/stores/${store.store_slug}/products?include_archived=true`,
            accessToken,
          ),
        ]);
        setOrders(orderData.orders ?? []);
        setBoard(deliveryData);
        setProducts(productData.products ?? []);
        setSelectedDriver((current) =>
          deliveryData.drivers.some(
            (d) => d.id === current && d.status === "AVAILABLE",
          )
            ? current
            : "",
        );
        setSelectedOrders((current) =>
          current.filter((id) =>
            deliveryData.ready_orders.some((o) => o.order_id === id),
          ),
        );
      } catch {
        /* silent poll failure */
      }
    },
    [store?.store_slug],
  );

  const loadAll = useCallback(
    async (accessToken: string) => {
      setError("");
      try {
        const storeList = await api<{ stores: Store[] }>(
          "admin/stores",
          accessToken,
        );
        const activeStore = storeList.stores[0];
        if (!activeStore)
          throw new Error(
            "Nenhuma loja ativa foi encontrada para este tenant.",
          );
        const storeSlug = activeStore.store_slug;
        const [
          orderData,
          deliveryData,
          productData,
          storeData,
          pricingData,
          categoryData,
          diagnosticsData,
          mpData,
        ] = await Promise.all([
          api<{ orders: Order[] }>(
            `admin/stores/${storeSlug}/orders?limit=200`,
            accessToken,
          ),
          api<Board>(`admin/stores/${storeSlug}/delivery-board`, accessToken),
          api<{ products: Product[] }>(
            `admin/stores/${storeSlug}/products?include_archived=true`,
            accessToken,
          ),
          api<{ store: Store }>(`admin/stores/${storeSlug}`, accessToken),
          api<{ pricing: DeliveryPricing }>(
            `admin/stores/${storeSlug}/delivery-pricing`,
            accessToken,
          ).catch((cause: unknown) => {
            if (
              cause instanceof Error &&
              cause.message === "Regra de frete não encontrada."
            )
              return { pricing: null as DeliveryPricing | null };
            throw cause;
          }),
          api<{ categories: Category[] }>(
            `admin/stores/${storeSlug}/categories`,
            accessToken,
          ).catch(() => ({ categories: [] })),
          api<DeliveryDiagnostics>(
            `admin/stores/${storeSlug}/delivery-diagnostics`,
            accessToken,
          ).catch(() => null),
          api<{ integrations: { mercado_pago: MpIntegration } }>(
            `admin/stores/${storeSlug}/payment-config`,
            accessToken,
          ).catch(() => null),
        ]);
        setOrders(orderData.orders ?? []);
        setBoard(deliveryData);
        setProducts(productData.products ?? []);
        setAllCategories(categoryData.categories ?? []);
        setStore(storeData.store);
        setStoreNameDraft(storeData.store.store_name);
        setPricing(pricingData.pricing ?? defaultDeliveryPricing);
        setDeliveryDiagnostics(diagnosticsData);
        const loadedAddress = storeData.store.origin_address ?? {};
        setAddress({
          ...emptyAddress,
          ...Object.fromEntries(
            Object.entries(loadedAddress).map(([key, value]) => [
              key,
              value ?? "",
            ]),
          ),
        });
        setStorefront({
          ...defaultStorefront,
          ...(storeData.store.storefront_config ?? {}),
        });
        setFulfillmentConfig({
          scheduled_delivery_enabled: storeData.store.scheduled_delivery_enabled ?? false,
          pickup_in_person_enabled: storeData.store.pickup_in_person_enabled ?? true,
          pickup_by_app_enabled: storeData.store.pickup_by_app_enabled ?? false,
          pickup_scheduling_enabled: storeData.store.pickup_scheduling_enabled ?? false,
        });
        setPaymentConfig({
          cash_enabled: storeData.store.cash_enabled ?? true,
          card_on_site_enabled: storeData.store.card_on_site_enabled ?? false,
          pix_enabled: storeData.store.pix_enabled ?? true,
          mercado_pago_enabled: storeData.store.mercado_pago_enabled ?? false,
        });
        if (mpData?.integrations?.mercado_pago) {
          const mp = mpData.integrations.mercado_pago;
          setMpConfig(mp);
          setMpPublicKey(mp.public_key ?? "");
        }
        setSelectedDriver((current) =>
          deliveryData.drivers.some(
            (driver) => driver.id === current && driver.status === "AVAILABLE",
          )
            ? current
            : "",
        );
        setSelectedOrders((current) =>
          current.filter((id) =>
            deliveryData.ready_orders.some((order) => order.order_id === id),
          ),
        );
      } catch (cause) {
        pushNotice(message(cause), "error");
      }
    },
    [pushNotice],
  );

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get(
      "tab",
    ) as Tab | null;
    if (
      requested &&
      ["overview", "orders", "deliveries", "products", "store"].includes(
        requested,
      )
    )
      setTab(requested);
    const savedNotices = window.localStorage.getItem("samjoe-admin-notices");
    if (savedNotices) {
      try {
        const parsed = JSON.parse(savedNotices);
        if (Array.isArray(parsed)) setNoticeHistory(parsed.slice(0, 50));
      } catch {
        window.localStorage.removeItem("samjoe-admin-notices");
      }
    }
    const saved = window.sessionStorage.getItem("samjoe-admin-token");
    if (saved) {
      setToken(saved);
      void loadAll(saved);
    }
  }, [loadAll]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => void loadOpsData(token), 30000);
    return () => clearInterval(id);
  }, [token, loadOpsData]);
  useEffect(
    () => () => {
      if (toastTimers.current.fade) clearTimeout(toastTimers.current.fade);
      if (toastTimers.current.clear) clearTimeout(toastTimers.current.clear);
    },
    [],
  );
  const today = useMemo(() => saoPauloDate(), []);
  const dateFilteredOrders = useMemo(
    () =>
      dateFilter
        ? orders.filter((o) => saoPauloDate(o.placed_at) === dateFilter)
        : orders,
    [orders, dateFilter],
  );
  const activeOrders = useMemo(
    () => orders.filter((order) => activeStatuses.includes(order.status)),
    [orders],
  );
  const filteredActiveOrders = useMemo(
    () => dateFilteredOrders.filter((o) => activeStatuses.includes(o.status)),
    [dateFilteredOrders],
  );
  const revenue = useMemo(
    () =>
      orders
        .filter((order) => order.status !== "CANCELLED")
        .reduce((sum, order) => sum + order.total_cents, 0),
    [orders],
  );
  const activeCategories = useMemo(
    () => allCategories.filter((category) => category.is_active),
    [allCategories],
  );
  const filteredProducts = useMemo(() => {
    const q = productFilter.trim().toLowerCase();
    return products.filter((p) => {
      if (!showArchived && p.is_archived) return false;
      if (
        q &&
        !p.name.toLowerCase().includes(q) &&
        !p.description?.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [products, productFilter, showArchived]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy("login");
    setError("");
    try {
      const result = await api<{ access_token: string }>("auth/login", "", {
        method: "POST",
        body: JSON.stringify({ tenant_slug: tenantSlug, email, password }),
      });
      window.sessionStorage.setItem("samjoe-admin-token", result.access_token);
      setToken(result.access_token);
      await loadAll(result.access_token);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy("");
    }
  }
  function logout() {
    window.sessionStorage.removeItem("samjoe-admin-token");
    setToken("");
  }
  function chooseTab(next: Tab) {
    setTab(next);
    window.history.replaceState(null, "", `/admin?tab=${next}`);
  }
  function toggleNoticeHistory() {
    setShowNoticeHistory((current) => {
      const next = !current;
      if (next) setUnreadNotices(0);
      return next;
    });
  }
  function clearNoticeHistory() {
    setNoticeHistory([]);
    setUnreadNotices(0);
    window.localStorage.removeItem("samjoe-admin-notices");
  }
  async function run(
    key: string,
    operation: () => Promise<void>,
    success?: string,
    fullRefresh = false,
  ) {
    setBusy(key);
    try {
      await operation();
      if (success) pushNotice(success);
      if (fullRefresh) await loadAll(token);
      else await loadOpsData(token);
    } catch (cause) {
      pushNotice(message(cause), "error");
    } finally {
      setBusy("");
    }
  }
  async function transitionOrder(id: string, to: OrderStatus) {
    await run(
      id,
      () =>
        api(`admin/orders/${id}/transitions`, token, {
          method: "POST",
          body: JSON.stringify({ to }),
        }),
      `Pedido atualizado para “${statusLabel[to]}”.`,
    );
  }
  async function cancelOrder(id: string) {
    if (!window.confirm("Cancelar este pedido?")) return;
    await transitionOrder(id, "CANCELLED");
  }
  async function toggleProduct(product: Product) {
    await run(
      product.id,
      () =>
        api(`admin/products/${product.id}`, token, {
          method: "PATCH",
          body: JSON.stringify({ is_active: !product.is_active }),
        }),
      "Catálogo atualizado.",
    );
  }
  async function archiveProduct(product: Product) {
    await run(
      product.id,
      () =>
        api(`admin/products/${product.id}`, token, {
          method: "PATCH",
          body: JSON.stringify({ is_archived: !product.is_archived }),
        }),
      product.is_archived ? "Produto restaurado." : "Produto arquivado.",
    );
  }
  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!store) return;
    const priceCents = Math.round(Number(newProductForm.price) * 100);
    if (!priceCents || priceCents <= 0) {
      pushNotice("Informe um preço válido.", "error");
      return;
    }
    await run(
      "new-product",
      () =>
        api(`admin/stores/${store.store_slug}/products`, token, {
          method: "POST",
          body: JSON.stringify({
            name: newProductForm.name,
            description: newProductForm.description || null,
            category_id: newProductForm.category_id || null,
            price_cents: priceCents,
            sku: newProductForm.sku || `SKU-${Date.now()}`,
            cover_image_url: newProductForm.cover_image_url,
          }),
        }),
      "Produto criado.",
    );
    setNewProductOpen(false);
    setNewProductForm({
      name: "",
      description: "",
      price: "",
      sku: "",
      category_id: "",
      cover_image_url: null,
    });
  }
  async function attachNewProductImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      pushNotice("Escolha um arquivo de imagem válido.", "error");
      return;
    }
    setNewProductImageBusy(true);
    try {
      const image = await resizeImage(file, 800, 800);
      setNewProductForm((current) => ({ ...current, cover_image_url: image }));
    } catch (cause) {
      pushNotice(message(cause), "error");
    } finally {
      setNewProductImageBusy(false);
    }
  }
  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingProduct) return;
    const data = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {
      name: data.get("name"),
      description: data.get("description") || null,
    };
    if (editingProductImage !== undefined)
      body.cover_image_url = editingProductImage;
    if (editingProductCategory !== undefined)
      body.category_id = editingProductCategory;
    const changedVariants = editingProduct.variants.filter(
      (v) =>
        variantPriceDrafts[v.id] !== undefined &&
        Math.round(Number(variantPriceDrafts[v.id]) * 100) !== v.price_cents,
    );
    await run(
      editingProduct.id,
      async () => {
        await api(`admin/products/${editingProduct.id}`, token, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        for (const v of changedVariants) {
          const priceCents = Math.round(Number(variantPriceDrafts[v.id]) * 100);
          if (priceCents >= 0)
            await api(`admin/variants/${v.id}`, token, {
              method: "PATCH",
              body: JSON.stringify({ price_cents: priceCents }),
            });
        }
      },
      "Produto salvo.",
    );
    setEditingProduct(null);
    setEditingProductImage(undefined);
    setVariantPriceDrafts({});
    setEditingProductCategory(undefined);
  }
  async function createCategory(event: FormEvent) {
    event.preventDefault();
    if (!store || !newCategoryName.trim()) return;
    await run(
      "category",
      () =>
        api(`admin/stores/${store.store_slug}/categories`, token, {
          method: "POST",
          body: JSON.stringify({ name: newCategoryName.trim() }),
        }) as Promise<void>,
      "Categoria criada.",
      true,
    );
    setNewCategoryName("");
  }
  async function renameCategory(category: Category) {
    const name = window
      .prompt("Novo nome da categoria:", category.name)
      ?.trim();
    if (!name || name === category.name) return;
    await run(
      `category-${category.category_id}`,
      () =>
        api(`admin/categories/${category.category_id}`, token, {
          method: "PATCH",
          body: JSON.stringify({ name }),
        }) as Promise<void>,
      "Categoria renomeada.",
      true,
    );
  }
  async function toggleCategory(category: Category) {
    if (category.is_active && category.product_count > 0) {
      pushNotice(
        "Mova os produtos para outra categoria antes de arquivá-la.",
        "error",
      );
      return;
    }
    await run(
      `category-${category.category_id}`,
      () =>
        api(`admin/categories/${category.category_id}`, token, {
          method: "PATCH",
          body: JSON.stringify({ is_active: !category.is_active }),
        }) as Promise<void>,
      category.is_active ? "Categoria arquivada." : "Categoria restaurada.",
      true,
    );
  }
  async function moveCategory(category: Category, direction: -1 | 1) {
    const index = activeCategories.findIndex(
      (item) => item.category_id === category.category_id,
    );
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= activeCategories.length)
      return;
    const ordered = [...activeCategories];
    const [moved] = ordered.splice(index, 1);
    if (!moved) return;
    ordered.splice(targetIndex, 0, moved);
    await run(
      `category-${category.category_id}`,
      async () => {
        for (const [sort_order, item] of ordered.entries())
          await api(`admin/categories/${item.category_id}`, token, {
            method: "PATCH",
            body: JSON.stringify({ sort_order }),
          });
      },
      "Ordem das categorias atualizada.",
      true,
    );
  }
  async function deleteProduct(product: Product) {
    if (
      !window.confirm(
        `Excluir "${product.name}" permanentemente? Esta ação não pode ser desfeita.`,
      )
    )
      return;
    await run(
      product.id,
      () =>
        api(`admin/products/${product.id}`, token, {
          method: "DELETE",
        }) as Promise<void>,
      "Produto excluído.",
    );
  }
  async function toggleStoreOpen() {
    if (!store) return;
    const newIsOpen = !(store.is_open ?? true);
    await run(
      "store-open",
      () =>
        api(`admin/stores/${store.store_slug}`, token, {
          method: "PATCH",
          body: JSON.stringify({
            is_open: newIsOpen,
            ...(newIsOpen ? { is_open_reason: null } : {}),
          }),
        }),
      newIsOpen ? "Loja aberta." : "Loja fechada.",
      true,
    );
    if (newIsOpen) setIsOpenReason("");
  }
  async function saveBusinessHours() {
    if (!store) return;
    await run(
      "store-hours",
      () =>
        api(`admin/stores/${store.store_slug}`, token, {
          method: "PATCH",
          body: JSON.stringify({
            business_hours: hoursForm,
            is_open_reason: isOpenReason.trim() || null,
          }),
        }),
      "Horário salvo.",
      true,
    );
    setShowHoursConfig(false);
  }
  async function loadMpConfig() {
    if (!store) return;
    try {
      const data = await api<{ integrations: { mercado_pago: MpIntegration } }>(
        `admin/stores/${store.store_slug}/payment-config`,
        token,
      );
      const mp = data.integrations.mercado_pago;
      setMpConfig(mp);
      setMpPublicKey(mp.public_key ?? "");
    } catch {
      /* silently ignore if table doesn't exist yet */
    }
  }
  async function saveMpConfig() {
    if (!store) return;
    const body: Record<string, unknown> = { is_active: mpConfig.is_active };
    if (mpAccessToken.trim()) body["access_token"] = mpAccessToken.trim();
    if (mpPublicKey.trim()) body["public_key"] = mpPublicKey.trim();
    await run(
      "mp-config",
      () =>
        api(`admin/stores/${store.store_slug}/payment-config/mercado-pago`, token, {
          method: "PUT",
          body: JSON.stringify(body),
        }),
      "Credenciais salvas.",
    );
    setMpAccessToken("");
    await loadMpConfig();
  }
  async function attachProductImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      pushNotice("Escolha um arquivo de imagem válido.", "error");
      return;
    }
    try {
      const image = await resizeImage(file, 800, 800);
      setEditingProductImage(image);
    } catch (cause) {
      pushNotice(message(cause), "error");
    }
  }
  async function addDriver(event: FormEvent) {
    event.preventDefault();
    await run(
      "driver",
      () =>
        api("admin/drivers", token, {
          method: "POST",
          body: JSON.stringify({ name: driverName, phone_e164: driverPhone }),
        }),
      "Entregador adicionado.",
    );
  }
  async function createRoute() {
    if (!store) return;
    await run(
      "route",
      () =>
        api(`admin/stores/${store.store_slug}/delivery-routes`, token, {
          method: "POST",
          body: JSON.stringify({
            driver_id: selectedDriver,
            order_ids: selectedOrders,
          }),
        }),
      "Rota criada.",
    );
    setSelectedOrders([]);
  }
  async function transitionRoute(id: string, to: string) {
    await run(
      id,
      () =>
        api(`admin/delivery-routes/${id}/transitions`, token, {
          method: "POST",
          body: JSON.stringify({ to }),
        }),
      `Rota atualizada para “${statusLabel[to] ?? to}”.`,
    );
  }
  async function finishStop(id: string, outcome: "DELIVERED" | "FAILED") {
    await run(
      id,
      () =>
        api(`admin/route-stops/${id}/outcome`, token, {
          method: "POST",
          body: JSON.stringify({
            outcome,
            notes:
              outcome === "DELIVERED"
                ? "Entrega confirmada."
                : "Ocorrência registrada.",
          }),
        }),
      outcome === "DELIVERED"
        ? "Entrega confirmada."
        : "Falha na entrega registrada.",
    );
  }
  async function saveStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!store) return;
    const data = new FormData(event.currentTarget);
    await run(
      "store",
      () =>
        api(`admin/stores/${store.store_slug}`, token, {
          method: "PATCH",
          body: JSON.stringify({
            name: storeNameDraft,
            timezone: data.get("timezone"),
            currency: data.get("currency"),
            status: data.get("status"),
            origin_address: {
              ...address,
              state: address.state.toUpperCase(),
              postal_code: address.postal_code.replace(/\D/g, ""),
            },
            storefront_config: {
              ...storefront,
              hero_image_url: storefront.hero_image_url?.trim() || null,
            },
            ...fulfillmentConfig,
            ...paymentConfig,
          }),
        }),
      "Configurações da loja e da vitrine salvas.",
      true,
    );
  }
  async function savePricing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!store) return;
    const data = new FormData(event.currentTarget);
    await run(
      "pricing",
      () =>
        api(`admin/stores/${store.store_slug}/delivery-pricing`, token, {
          method: "PATCH",
          body: JSON.stringify({
            base_fee_cents: toCents(data.get("base_fee")),
            included_meters: toMeters(data.get("included_km")),
            price_per_extra_km_cents: toCents(data.get("extra_km")),
            standard_radius_meters: toMeters(data.get("standard_km")),
            maximum_radius_meters: toMeters(data.get("maximum_km")),
            exception_fee_cents: toCents(data.get("exception_fee")),
            free_delivery_radius_meters: toMeters(data.get("free_delivery_km")),
          }),
        }),
      "Regra de frete atualizada.",
      true,
    );
    setShowPricing(false);
  }
  function chooseDriver(id: string) {
    setSelectedDriver(id);
    setSelectedOrders(
      id ? board.ready_orders.map((order) => order.order_id) : [],
    );
  }
  function toggleAllReady() {
    setSelectedOrders((current) =>
      current.length === board.ready_orders.length
        ? []
        : board.ready_orders.map((order) => order.order_id),
    );
  }
  async function attachImage(
    event: ChangeEvent<HTMLInputElement>,
    field: "logo_url" | "hero_image_url" | "hero_bg_image_url",
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      pushNotice("Escolha um arquivo de imagem válido.", "error");
      return;
    }
    try {
      const logo = field === "logo_url";
      const image = await resizeImage(
        file,
        logo ? 512 : 1600,
        logo ? 512 : 1000,
      );
      setStorefront((current) => ({
        ...current,
        [field]: image,
        ...(field === "hero_image_url" ? { hero_image_enabled: true } : {}),
        ...(field === "hero_bg_image_url"
          ? { hero_bg_type: "IMAGE" as const }
          : {}),
      }));
      pushNotice(
        field === "logo_url"
          ? "Logo anexado. Salve para aplicar na loja."
          : field === "hero_bg_image_url"
            ? "Imagem de fundo anexada. Ajuste o enquadramento e salve."
            : "Imagem principal anexada. Salve para aplicar na loja.",
      );
    } catch (cause) {
      pushNotice(message(cause), "error");
    }
  }
  async function attachCarouselImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      pushNotice("Escolha um arquivo de imagem válido.", "error");
      return;
    }
    if (storefront.hero_images.length >= 5) {
      pushNotice("Máximo de 5 imagens no carrossel.", "error");
      return;
    }
    try {
      const image = await resizeImage(file, 1600, 1000);
      setStorefront((current) => ({
        ...current,
        hero_images: [...current.hero_images, image],
      }));
      pushNotice("Imagem adicionada ao carrossel.");
    } catch (cause) {
      pushNotice(message(cause), "error");
    }
  }
  async function openOrder(order: Order) {
    setSelectedOrder(order);
    setOrderDetail(null);
    setOrderDetailLoading(true);
    try {
      setOrderDetail(
        await api<OrderDetail>(`admin/orders/${order.order_id}`, token),
      );
    } catch (cause) {
      pushNotice(message(cause), "error");
    } finally {
      setOrderDetailLoading(false);
    }
  }
  function closeOrder() {
    setSelectedOrder(null);
    setOrderDetail(null);
  }
  async function lookupCep() {
    const cep = freteTest.postal_code.replace(/\D/g, "");
    if (cep.length !== 8) {
      setFreteResult({
        status: "INVALID",
        fee_cents: null,
        error: "Informe um CEP com 8 dígitos.",
      });
      return;
    }
    setCepBusy(true);
    setFreteResult(null);
    try {
      const r = await fetch(`/api/postal-code/${cep}`);
      const d = (await r.json()) as {
        street?: string;
        district?: string;
        city?: string;
        state?: string;
        error?: { message?: string };
      };
      if (!r.ok) throw new Error(d.error?.message ?? "CEP não encontrado.");
      setFreteTest((c) => ({
        ...c,
        postal_code: cep,
        street: d.street ?? c.street,
        district: d.district ?? c.district,
        city: d.city ?? c.city,
        state: d.state ?? c.state,
      }));
    } catch (cause) {
      setFreteResult({
        status: "ERROR",
        fee_cents: null,
        error: message(cause),
      });
    } finally {
      setCepBusy(false);
    }
  }
  async function validateFreight() {
    if (!store) return;
    const address = {
      ...freteTest,
      street: freteTest.street.trim(),
      number: freteTest.number.trim(),
      district: freteTest.district.trim(),
      city: freteTest.city.trim(),
      state: freteTest.state.trim().toUpperCase(),
      postal_code: freteTest.postal_code.replace(/\D/g, ""),
    };
    if (
      !address.street ||
      !address.number ||
      !address.district ||
      !address.city ||
      !/^[A-Z]{2}$/.test(address.state) ||
      !/^[0-9]{8}$/.test(address.postal_code)
    ) {
      setFreteResult({
        status: "INVALID",
        fee_cents: null,
        error:
          "Preencha CEP, rua, número, bairro, cidade e UF antes de calcular.",
      });
      return;
    }
    setFreteBusy(true);
    setFreteResult(null);
    try {
      const q = await fetch(`/api/store/${store.store_slug}/delivery-quotes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const body = (await q.json()) as {
        status?: string;
        fee?: { amount_cents: number };
        distance_meters?: number;
        route_source?: string;
        free_delivery_applied?: boolean;
        error?: { message?: string };
      };
      if (!q.ok)
        throw new Error(
          body.error?.message ??
            `Falha ao calcular o frete (HTTP ${q.status}).`,
        );
      if (body.status === "AVAILABLE" && body.fee) {
        setFreteResult({
          status: "AVAILABLE",
          fee_cents: body.fee.amount_cents,
          error: null,
          distance_meters: body.distance_meters,
          route_source: body.route_source,
          free_delivery_applied: body.free_delivery_applied,
        });
        return;
      }
      setFreteResult({
        status: body.status ?? "OUTSIDE_AREA",
        fee_cents: null,
        error: "Endereço fora da área de entrega configurada.",
        distance_meters: body.distance_meters,
        route_source: body.route_source,
        free_delivery_applied: false,
      });
    } catch (cause) {
      setFreteResult({
        status: "ERROR",
        fee_cents: null,
        error: message(cause),
      });
    } finally {
      setFreteBusy(false);
    }
  }

  if (!token)
    return (
      <main className={styles.login}>
        <form onSubmit={login} className={styles.loginCard}>
          <div className={styles.brandMark}>SJ</div>
          <span className={styles.kicker}>SAMJOE FOOD</span>
          <h1>Sua operação em um só lugar.</h1>
          <p>Pedidos, entregas, catálogo e dados da loja no mesmo painel.</p>
          {error && <div className={styles.alert}>{error}</div>}
          <label>
            Identificador da empresa
            <input
              value={tenantSlug}
              onChange={(e) =>
                setTenantSlug(e.target.value.toLowerCase().trim())
              }
              placeholder="samjoe-confeitaria"
              required
            />
          </label>
          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button disabled={busy === "login"}>
            {busy === "login" ? "Entrando…" : "Entrar no painel"}
          </button>
        </form>
      </main>
    );

  const availableDrivers = board.drivers.filter(
    (driver) => driver.status === "AVAILABLE",
  );
  return (
    <main className={styles.app}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <span>SJ</span>
          <div>
            <strong>SamJoE</strong>
            <small>Food</small>
          </div>
        </div>
        <nav>
          <Nav tab="overview" current={tab} onClick={chooseTab} icon="⌂">
            Visão geral
          </Nav>
          <Nav tab="orders" current={tab} onClick={chooseTab} icon="▤">
            Pedidos
          </Nav>
          <Nav tab="deliveries" current={tab} onClick={chooseTab} icon="↗">
            Entregas
          </Nav>
          <Nav tab="products" current={tab} onClick={chooseTab} icon="◇">
            Produtos
          </Nav>
          <Nav tab="store" current={tab} onClick={chooseTab} icon="⚙">
            Minha loja
          </Nav>
        </nav>
        <div className={styles.storeSwitch}>
          <span className={styles.online} />
          <div>
            <strong>{store?.store_name ?? "Centro"}</strong>
            <small>{statusLabel[store?.status ?? "ACTIVE"]}</small>
          </div>
        </div>
      </aside>
      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <span className={styles.kicker}>
              OPERAÇÃO ·{" "}
              {new Date().toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "long",
              })}
            </span>
            <h1>{tabTitle(tab)}</h1>
          </div>
          <div className={styles.topActions}>
            <button onClick={() => void loadAll(token)}>↻ Atualizar</button>
            {store && (
              <div className={styles.storeStatusControl}>
                <button
                  className={`${styles.storeTogglePill} ${(store.is_open ?? true) ? styles.pillOpen : styles.pillClosed}`}
                  disabled={busy === "store-open"}
                  onClick={() => void toggleStoreOpen()}
                  title={(store.is_open ?? true) ? "Clique para fechar a loja" : "Clique para abrir a loja"}
                >
                  <span className={styles.statusDot} />
                  {busy === "store-open" ? "Salvando…" : (store.is_open ?? true) ? "Aberta" : "Fechada"}
                </button>
                <div className={styles.hoursAnchor}>
                  <button
                    className={styles.hoursGearButton}
                    onClick={() => {
                      setHoursForm((store.business_hours as Record<string, BusinessHoursDay>) ?? {});
                      setShowHoursConfig((v) => !v);
                    }}
                    aria-label="Configurar horário de funcionamento"
                    title="Horário de funcionamento"
                  >
                    ⚙
                  </button>
                  {showHoursConfig && (
                    <div
                      className={styles.hoursConfigPopover}
                      role="dialog"
                      aria-label="Horário de funcionamento"
                    >
                      <header>
                        <div>
                          <strong>Horário de funcionamento</strong>
                          <small>
                            Define quando a loja abre/fecha automaticamente
                          </small>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowHoursConfig(false)}
                        >
                          ×
                        </button>
                      </header>
                      {!(store.is_open ?? true) && (
                        <label className={styles.reasonLabel}>
                          Motivo do fechamento (opcional)
                          <input
                            placeholder="Ex: Feriado, manutenção…"
                            value={isOpenReason}
                            onChange={(e) => setIsOpenReason(e.target.value)}
                            className={styles.reasonInput}
                          />
                        </label>
                      )}
                      <div className={styles.hoursGrid}>
                        {DAYS.map(({ key, label }) => {
                          const day: BusinessHoursDay = hoursForm[key] ?? {
                            open: false,
                            from: null,
                            to: null,
                          };
                          return (
                            <div key={key} className={styles.hoursDayRow}>
                              <label className={styles.dayCheck}>
                                <input
                                  type="checkbox"
                                  checked={day.open}
                                  onChange={(e) =>
                                    setHoursForm((f) => ({
                                      ...f,
                                      [key]: {
                                        ...day,
                                        open: e.target.checked,
                                      },
                                    }))
                                  }
                                />
                                <span>{label}</span>
                              </label>
                              {day.open && (
                                <>
                                  <input
                                    type="time"
                                    value={day.from ?? ""}
                                    className={styles.timeInput}
                                    onChange={(e) =>
                                      setHoursForm((f) => ({
                                        ...f,
                                        [key]: {
                                          ...day,
                                          from: e.target.value || null,
                                        },
                                      }))
                                    }
                                  />
                                  <span className={styles.timeSep}>–</span>
                                  <input
                                    type="time"
                                    value={day.to ?? ""}
                                    className={styles.timeInput}
                                    onChange={(e) =>
                                      setHoursForm((f) => ({
                                        ...f,
                                        [key]: {
                                          ...day,
                                          to: e.target.value || null,
                                        },
                                      }))
                                    }
                                  />
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <button
                        className={styles.saveHoursButton}
                        onClick={() => void saveBusinessHours()}
                        disabled={busy === "store-hours"}
                      >
                        {busy === "store-hours" ? "Salvando…" : "Salvar horários"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className={styles.noticeAnchor}>
              <button
                className={styles.noticeButton}
                onClick={toggleNoticeHistory}
                aria-expanded={showNoticeHistory}
              >
                ♢ Avisos
                {unreadNotices > 0 && (
                  <span>{unreadNotices > 9 ? "9+" : unreadNotices}</span>
                )}
              </button>
              {showNoticeHistory && (
                <aside
                  className={styles.noticeHistory}
                  aria-label="Histórico de alterações"
                >
                  <header>
                    <div>
                      <strong>Avisos</strong>
                      <small>Histórico das últimas alterações</small>
                    </div>
                    <button
                      onClick={() => setShowNoticeHistory(false)}
                      aria-label="Fechar avisos"
                    >
                      ×
                    </button>
                  </header>
                  <div className={styles.noticeHistoryList}>
                    {noticeHistory.length === 0 && (
                      <div className={styles.noticeEmpty}>
                        Nenhuma alteração registrada ainda.
                      </div>
                    )}
                    {noticeHistory.map((item) => (
                      <article key={item.id} data-kind={item.kind}>
                        <i>{item.kind === "success" ? "✓" : "!"}</i>
                        <div>
                          <strong>{item.message}</strong>
                          <time>{formatNoticeTime(item.created_at)}</time>
                        </div>
                      </article>
                    ))}
                  </div>
                  {noticeHistory.length > 0 && (
                    <footer>
                      <button onClick={clearNoticeHistory}>
                        Limpar histórico
                      </button>
                    </footer>
                  )}
                </aside>
              )}
            </div>
            <button onClick={logout}>Sair</button>
          </div>
        </header>
        {toast && (
          <div
            className={`${styles.toast} ${toastLeaving ? styles.toastLeaving : ""}`}
            data-kind={toast.kind}
            role="status"
            aria-live="polite"
          >
            <i>{toast.kind === "success" ? "✓" : "!"}</i>
            <div>
              <strong>
                {toast.kind === "success"
                  ? "Alteração salva"
                  : "Não foi possível concluir"}
              </strong>
              <span>{toast.message}</span>
            </div>
          </div>
        )}
        <div className={styles.content}>
          {tab === "overview" && (
            <>
              <section className={styles.hero}>
                <div>
                  <span className={styles.kicker}>RESUMO DE HOJE</span>
                  <h2>Bom trabalho por aqui.</h2>
                  <p>
                    Você tem {activeOrders.length} pedido(s) ativo(s) e{" "}
                    {board.ready_orders.length} pronto(s) para despacho.
                  </p>
                </div>
                <button onClick={() => chooseTab("orders")}>Ver pedidos</button>
              </section>
              <section className={styles.metrics}>
                <Metric label="Pedidos ativos" value={activeOrders.length} />
                <Metric
                  label="Aguardando entrega"
                  value={board.ready_orders.length}
                />
                <Metric
                  label="Rotas em andamento"
                  value={board.routes.length}
                />
                <Metric label="Total nos pedidos" value={money(revenue)} />
              </section>
              <section className={styles.twoColumns}>
                <Panel
                  title="Fila de produção"
                  action="Abrir pedidos"
                  onAction={() => chooseTab("orders")}
                >
                  <OrderList
                    orders={activeOrders.slice(0, 4)}
                    busy={busy}
                    onTransition={transitionOrder}
                  />
                </Panel>
                <Panel
                  title="Expedição"
                  action="Abrir entregas"
                  onAction={() => chooseTab("deliveries")}
                >
                  <div className={styles.dispatchSummary}>
                    <b>{availableDrivers.length}</b>
                    <span>entregadores disponíveis</span>
                    <b>{board.routes.length}</b>
                    <span>rotas ativas</span>
                    <b>{board.ready_orders.length}</b>
                    <span>pedidos aguardando</span>
                  </div>
                </Panel>
              </section>
            </>
          )}
          {tab === "orders" && (
            <section className={styles.ordersWorkspace}>
              <div className={styles.ordersToolbar}>
                <div>
                  <span className={styles.kicker}>OPERAÇÃO EM TEMPO REAL</span>
                  <h2>Fluxo dos pedidos</h2>
                  <p>
                    {filteredActiveOrders.length} pedido(s) em operação · clique
                    em um card para ver detalhes
                  </p>
                </div>
                <div className={styles.ordersToolbarRight}>
                  <div className={styles.dateFilterBar}>
                    <label>
                      <span>Data</span>
                      <input
                        type="date"
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                      />
                    </label>
                    {dateFilter !== today && (
                      <button onClick={() => setDateFilter(today)}>Hoje</button>
                    )}
                  </div>
                  <div className={styles.viewToggle}>
                    <button
                      className={
                        orderView === "kanban" ? styles.selectedView : undefined
                      }
                      onClick={() => setOrderView("kanban")}
                    >
                      ▦ Kanban
                    </button>
                    <button
                      className={
                        orderView === "list" ? styles.selectedView : undefined
                      }
                      onClick={() => setOrderView("list")}
                    >
                      ☷ Lista
                    </button>
                  </div>
                </div>
              </div>
              {board.ready_orders.length > 0 && (
                <div className={styles.dispatchBar}>
                  <div className={styles.dispatchBarInfo}>
                    <strong>{board.ready_orders.length}</strong>
                    <span>
                      {board.ready_orders.length === 1 ? "pronto" : "prontos"}{" "}
                      para entrega
                    </span>
                  </div>
                  <select
                    value={selectedDriver}
                    onChange={(e) => chooseDriver(e.target.value)}
                    className={styles.dispatchSelect}
                  >
                    <option value="">Escolher entregador</option>
                    {availableDrivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className={styles.primary}
                    disabled={
                      !selectedDriver ||
                      selectedOrders.length === 0 ||
                      busy === "route"
                    }
                    onClick={() => void createRoute()}
                  >
                    {busy === "route"
                      ? "Criando…"
                      : `Despachar (${selectedOrders.length})`}
                  </button>
                  <button
                    className={styles.configButton}
                    onClick={() => chooseTab("deliveries")}
                  >
                    Ver rotas ↗
                  </button>
                </div>
              )}
              {orderView === "kanban" ? (
                <KanbanBoard
                  orders={dateFilteredOrders}
                  busy={busy}
                  onTransition={transitionOrder}
                  onCancel={cancelOrder}
                  onDeliveries={() => chooseTab("deliveries")}
                  onOpen={openOrder}
                />
              ) : (
                <Panel
                  title="Pedidos do dia"
                  subtitle={`${filteredActiveOrders.length} ativos`}
                >
                  <OrderList
                    orders={filteredActiveOrders}
                    busy={busy}
                    onTransition={transitionOrder}
                  />
                </Panel>
              )}
            </section>
          )}
          {tab === "deliveries" && (
            <section className={styles.deliveryWorkspace}>
              <div className={styles.deliveryToolbar}>
                <div>
                  <span className={styles.kicker}>EXPEDIÇÃO</span>
                  <h2>Entregas e rotas</h2>
                  {deliveryDiagnostics && (
                    <small>
                      Entrega {deliveryDiagnostics.delivery_status === "ACTIVE" ? "ativa" : "pendente"}
                      {" · "}
                      {routeSourceLabel(deliveryDiagnostics.expected_source)}
                    </small>
                  )}
                </div>
                <div className={styles.pricingAnchor}>
                  <button
                    className={styles.configButton}
                    onClick={() => {
                      setShowPricing((c) => !c);
                      setShowFreteTest(false);
                    }}
                  >
                    ⚙ Configurar frete
                  </button>
                  {showPricing && pricing && (
                    <form
                      className={styles.pricingPopover}
                      onSubmit={savePricing}
                      role="dialog"
                      aria-label="Configuração do frete"
                    >
                      <header>
                        <div>
                          <strong>Cálculo do frete</strong>
                          <small>Regra ativa · {pricing.version}</small>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowPricing(false)}
                        >
                          ×
                        </button>
                      </header>
                      <p>
                        Dentro da faixa gratuita o cliente não paga frete. Fora
                        dela, aplica taxa base, km excedente e adicional de
                        exceção.
                      </p>
                      <div className={styles.pricingGrid}>
                        <label>
                          Taxa base (R$)
                          <input
                            name="base_fee"
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={(
                              pricing.base_fee_cents / 100
                            ).toFixed(2)}
                            required
                          />
                        </label>
                        <label>
                          Incluídos na taxa base (km)
                          <input
                            name="included_km"
                            type="number"
                            min="0"
                            step="0.1"
                            defaultValue={(
                              pricing.included_meters / 1000
                            ).toFixed(1)}
                            required
                          />
                        </label>
                        <label>
                          Frete grátis até (km)
                          <input
                            name="free_delivery_km"
                            type="number"
                            min="0"
                            step="0.1"
                            defaultValue={(
                              pricing.free_delivery_radius_meters / 1000
                            ).toFixed(1)}
                            required
                          />
                          <small>Use 0 para desativar.</small>
                        </label>
                        <label>
                          Km adicional (R$)
                          <input
                            name="extra_km"
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={(
                              pricing.price_per_extra_km_cents / 100
                            ).toFixed(2)}
                            required
                          />
                        </label>
                        <label>
                          Raio padrão (km)
                          <input
                            name="standard_km"
                            type="number"
                            min="0"
                            step="0.1"
                            defaultValue={(
                              pricing.standard_radius_meters / 1000
                            ).toFixed(1)}
                            required
                          />
                        </label>
                        <label>
                          Raio máximo (km)
                          <input
                            name="maximum_km"
                            type="number"
                            min="0"
                            step="0.1"
                            defaultValue={(
                              pricing.maximum_radius_meters / 1000
                            ).toFixed(1)}
                            required
                          />
                        </label>
                        <label>
                          Adicional exceção (R$)
                          <input
                            name="exception_fee"
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={(
                              pricing.exception_fee_cents / 100
                            ).toFixed(2)}
                            required
                          />
                        </label>
                      </div>
                      <div className={styles.formula}>
                        Se distância ≤ faixa grátis: R$ 0. Fora da faixa: base +
                        km excedente × valor/km + adicional de exceção.
                      </div>
                      <button
                        className={styles.primary}
                        disabled={busy === "pricing"}
                      >
                        {busy === "pricing" ? "Salvando…" : "Salvar nova regra"}
                      </button>
                    </form>
                  )}
                </div>
                <div className={styles.pricingAnchor}>
                  <button
                    className={styles.configButton}
                    onClick={() => {
                      setShowFreteTest((c) => !c);
                      setShowPricing(false);
                    }}
                  >
                    ✓ Validar frete
                  </button>
                  {showFreteTest && store && (
                    <div
                      className={styles.pricingPopover}
                      role="dialog"
                      aria-label="Simulador de frete"
                    >
                      <header>
                        <div>
                          <strong>Simulador de frete</strong>
                          <small>
                            Teste o custo de entrega para qualquer endereço
                          </small>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowFreteTest(false)}
                        >
                          ×
                        </button>
                      </header>
                      {deliveryDiagnostics?.warnings.map((warning) => (
                        <div
                          key={warning}
                          className={styles.freightResult}
                          data-kind="error"
                        >
                          <strong>⚠ {warning}</strong>
                        </div>
                      ))}
                      <div className={styles.pricingGrid}>
                        <label className={styles.wideField}>
                          CEP
                          <div
                            style={{
                              display: "flex",
                              gap: "7px",
                              alignItems: "center",
                            }}
                          >
                            <input
                              value={freteTest.postal_code}
                              onChange={(e) =>
                                setFreteTest((c) => ({
                                  ...c,
                                  postal_code: e.target.value.replace(
                                    /\D/g,
                                    "",
                                  ),
                                }))
                              }
                              placeholder="01310100"
                              maxLength={8}
                              style={{ flex: 1 }}
                            />
                            <button
                              type="button"
                              className={styles.primary}
                              disabled={
                                cepBusy ||
                                freteTest.postal_code.replace(/\D/g, "")
                                  .length !== 8
                              }
                              onClick={lookupCep}
                              style={{
                                whiteSpace: "nowrap",
                                padding: "9px 13px",
                                borderRadius: "8px",
                              }}
                            >
                              {cepBusy ? "…" : "Buscar"}
                            </button>
                          </div>
                        </label>
                        <label className={styles.wideField}>
                          Rua
                          <input
                            value={freteTest.street}
                            onChange={(e) =>
                              setFreteTest((c) => ({
                                ...c,
                                street: e.target.value,
                              }))
                            }
                            placeholder="Ex: Av. Paulista"
                          />
                        </label>
                        <label>
                          Número
                          <input
                            value={freteTest.number}
                            onChange={(e) =>
                              setFreteTest((c) => ({
                                ...c,
                                number: e.target.value,
                              }))
                            }
                            placeholder="123"
                          />
                        </label>
                        <label>
                          Bairro
                          <input
                            value={freteTest.district}
                            onChange={(e) =>
                              setFreteTest((c) => ({
                                ...c,
                                district: e.target.value,
                              }))
                            }
                            placeholder="Centro"
                          />
                        </label>
                        <label>
                          Cidade
                          <input
                            value={freteTest.city}
                            onChange={(e) =>
                              setFreteTest((c) => ({
                                ...c,
                                city: e.target.value,
                              }))
                            }
                            placeholder="São Paulo"
                          />
                        </label>
                        <label>
                          UF
                          <input
                            value={freteTest.state}
                            maxLength={2}
                            onChange={(e) =>
                              setFreteTest((c) => ({
                                ...c,
                                state: e.target.value,
                              }))
                            }
                            placeholder="SP"
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        className={styles.primary}
                        style={{
                          width: "100%",
                          marginTop: "4px",
                          borderRadius: "10px",
                        }}
                        disabled={freteBusy || cepBusy}
                        onClick={() => void validateFreight()}
                      >
                        {freteBusy ? "Calculando…" : "Validar frete"}
                      </button>
                      {freteResult &&
                        (freteResult.error ? (
                          <div
                            className={styles.freightResult}
                            data-kind="error"
                          >
                            <strong>✕ {freteResult.error}</strong>
                            {freteResult.distance_meters !== undefined && (
                              <small>
                                {formatDistance(freteResult.distance_meters)}
                              </small>
                            )}
                          </div>
                        ) : (
                          <div
                            className={styles.freightResult}
                            data-kind="success"
                          >
                            <strong>
                              {freteResult.free_delivery_applied
                                ? "✓ Frete grátis"
                                : `✓ Frete ${money(freteResult.fee_cents ?? 0)}`}
                            </strong>
                            <small>
                              {freteResult.distance_meters !== undefined
                                ? formatDistance(freteResult.distance_meters)
                                : "Distância indisponível"}{" "}
                              · {routeSourceLabel(freteResult.route_source)}
                            </small>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
              <section className={styles.metrics}>
                <Metric label="Prontos" value={board.ready_orders.length} />
                <Metric label="Rotas ativas" value={board.routes.length} />
                <Metric
                  label="Entregadores livres"
                  value={availableDrivers.length}
                />
              </section>
              <section className={styles.twoColumns}>
                <Panel title="Equipe de entrega">
                  <div className={styles.people}>
                    {board.drivers.map((driver) => (
                      <div key={driver.id}>
                        <span>{driver.name[0]}</span>
                        <div>
                          <strong>{driver.name}</strong>
                          <small>{driver.phone_e164 ?? "Sem telefone"}</small>
                        </div>
                        <em>{statusLabel[driver.status] ?? driver.status}</em>
                      </div>
                    ))}
                  </div>
                  <form className={styles.inlineForm} onSubmit={addDriver}>
                    <input
                      value={driverName}
                      onChange={(e) => setDriverName(e.target.value)}
                      placeholder="Nome"
                    />
                    <input
                      value={driverPhone}
                      onChange={(e) => setDriverPhone(e.target.value)}
                      placeholder="Telefone"
                    />
                    <button disabled={busy === "driver"}>Adicionar</button>
                  </form>
                </Panel>
                <Panel title="Montar uma rota">
                  <label className={styles.field}>
                    1. Escolha o entregador
                    <select
                      value={selectedDriver}
                      onChange={(e) => chooseDriver(e.target.value)}
                    >
                      <option value="">Selecione</option>
                      {availableDrivers.map((driver) => (
                        <option key={driver.id} value={driver.id}>
                          {driver.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className={styles.routeSelectionHeader}>
                    <div>
                      <strong>2. Pedidos prontos</strong>
                      <small>
                        {selectedDriver
                          ? `${selectedOrders.length} de ${board.ready_orders.length} selecionados`
                          : "Escolha o entregador para listar a rota"}
                      </small>
                    </div>
                    {selectedDriver && board.ready_orders.length > 0 && (
                      <button onClick={toggleAllReady}>
                        {selectedOrders.length === board.ready_orders.length
                          ? "Limpar"
                          : "Selecionar todos"}
                      </button>
                    )}
                  </div>
                  <div
                    className={`${styles.readyList} ${!selectedDriver ? styles.readyDisabled : ""}`}
                  >
                    {!selectedDriver && (
                      <Empty text="Selecione um entregador para ver todos os pedidos prontos." />
                    )}
                    {selectedDriver && board.ready_orders.length === 0 && (
                      <Empty text="Nenhum pedido pronto para entrega." />
                    )}
                    {selectedDriver &&
                      board.ready_orders.map((order) => (
                        <label key={order.order_id}>
                          <input
                            type="checkbox"
                            checked={selectedOrders.includes(order.order_id)}
                            onChange={(e) =>
                              setSelectedOrders((current) =>
                                e.target.checked
                                  ? [...current, order.order_id]
                                  : current.filter(
                                      (id) => id !== order.order_id,
                                    ),
                              )
                            }
                          />
                          <div>
                            <strong>
                              {order.public_number} · {order.customer_name}
                            </strong>
                            <small>
                              {formatAddress(order.address_snapshot)}
                            </small>
                          </div>
                        </label>
                      ))}
                  </div>
                  <button
                    className={styles.primary}
                    disabled={
                      !selectedDriver ||
                      selectedOrders.length === 0 ||
                      busy === "route"
                    }
                    onClick={() => void createRoute()}
                  >
                    Criar rota para {selectedOrders.length} pedido(s)
                  </button>
                </Panel>
              </section>
              <Panel title="Rotas em operação">
                <div className={styles.routes}>
                  {board.routes.length === 0 && (
                    <Empty text="As rotas criadas aparecerão aqui." />
                  )}
                  {board.routes.map((route) => (
                    <article key={route.route_id}>
                      <header>
                        <div>
                          <strong>{route.driver_name}</strong>
                          <small>
                            {route.completed_count}/{route.stop_count} paradas
                          </small>
                        </div>
                        <em>{statusLabel[route.status] ?? route.status}</em>
                      </header>
                      {route.stops.map((stop) => (
                        <div className={styles.stop} key={stop.stop_id}>
                          <b>{stop.sequence}</b>
                          <div>
                            <strong>
                              {stop.public_number} · {stop.customer_name}
                            </strong>
                            <small>
                              {formatAddress(stop.address_snapshot)}
                            </small>
                          </div>
                          <em>{statusLabel[stop.status] ?? stop.status}</em>
                          {route.status === "IN_PROGRESS" &&
                            stop.status === "PENDING" && (
                              <span>
                                <button
                                  onClick={() =>
                                    void finishStop(stop.stop_id, "DELIVERED")
                                  }
                                >
                                  Entregue
                                </button>
                                <button
                                  onClick={() =>
                                    void finishStop(stop.stop_id, "FAILED")
                                  }
                                >
                                  Falhou
                                </button>
                              </span>
                            )}
                        </div>
                      ))}
                      <footer>
                        {route.status === "AWAITING_ACCEPTANCE" && (
                          <button
                            onClick={() =>
                              void transitionRoute(route.route_id, "ACCEPTED")
                            }
                          >
                            Aceitar
                          </button>
                        )}
                        {route.status === "ACCEPTED" && (
                          <button
                            onClick={() =>
                              void transitionRoute(
                                route.route_id,
                                "IN_PROGRESS",
                              )
                            }
                          >
                            Iniciar entregas
                          </button>
                        )}
                        <button
                          className={styles.danger}
                          onClick={() =>
                            void transitionRoute(route.route_id, "CANCELLED")
                          }
                        >
                          Cancelar
                        </button>
                      </footer>
                    </article>
                  ))}
                </div>
              </Panel>
            </section>
          )}
          {tab === "products" && (
            <Panel
              title="Cardápio"
              subtitle={`${filteredProducts.length} de ${products.length} produto(s)`}
            >
              <div className={styles.productListHeader}>
                <div className={styles.productListSearch}>
                  <input
                    placeholder="Filtrar produtos…"
                    value={productFilter}
                    onChange={(e) => setProductFilter(e.target.value)}
                  />
                  {productFilter && (
                    <button onClick={() => setProductFilter("")}>×</button>
                  )}
                </div>
                <label className={styles.productListArchiveToggle}>
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                  />
                  Arquivados
                </label>
                <button onClick={() => setShowCategoryManager((c) => !c)}>
                  {showCategoryManager ? "✕ Categorias" : "Categorias"}
                </button>
                <button
                  className={styles.primary}
                  onClick={() => setNewProductOpen(true)}
                >
                  + Novo produto
                </button>
              </div>
              {showCategoryManager && (
                <div className={styles.categoryManager}>
                  <h3>Categorias</h3>
                  <div className={styles.categoryList}>
                    {allCategories.length === 0 && (
                      <span className={styles.categoryEmpty}>
                        Nenhuma categoria ainda.
                      </span>
                    )}
                    {allCategories.map((category, index) => (
                      <div
                        key={category.category_id}
                        className={`${styles.categoryRow} ${!category.is_active ? styles.categoryInactive : ""}`}
                      >
                        <div>
                          <strong>{category.name}</strong>
                          <small>
                            {category.product_count} produto(s)
                            {!category.is_active ? " · Arquivada" : ""}
                          </small>
                        </div>
                        <div className={styles.categoryActions}>
                          <button
                            type="button"
                            disabled={!category.is_active || index === 0}
                            onClick={() => void moveCategory(category, -1)}
                            aria-label={`Subir ${category.name}`}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={
                              !category.is_active ||
                              index === activeCategories.length - 1
                            }
                            onClick={() => void moveCategory(category, 1)}
                            aria-label={`Descer ${category.name}`}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => void renameCategory(category)}
                          >
                            Renomear
                          </button>
                          <button
                            type="button"
                            disabled={
                              category.is_active && category.product_count > 0
                            }
                            title={
                              category.is_active && category.product_count > 0
                                ? "Mova os produtos antes de arquivar."
                                : undefined
                            }
                            onClick={() => void toggleCategory(category)}
                          >
                            {category.is_active ? "Arquivar" : "Restaurar"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <form
                    className={styles.categoryAddForm}
                    onSubmit={(e) => void createCategory(e)}
                  >
                    <input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Ex: Bolo de pote, Cone, Combo…"
                      required
                    />
                    <button
                      className={styles.primary}
                      type="submit"
                      disabled={busy === "category"}
                    >
                      {busy === "category" ? "Criando…" : "Criar"}
                    </button>
                  </form>
                </div>
              )}
              <div className={styles.productList}>
                {filteredProducts.length === 0 && (
                  <Empty text="Nenhum produto encontrado." />
                )}
                {filteredProducts.map((product) => (
                  <article
                    className={`${styles.productListRow} ${!product.is_active && !product.is_archived ? styles.muted : ""} ${product.is_archived ? styles.archivedRow : ""}`}
                    key={product.id}
                  >
                    <div className={styles.productListThumb}>
                      {product.cover_image_url ? (
                        <img src={product.cover_image_url} alt="" />
                      ) : (
                        <span>{product.name.slice(0, 1)}</span>
                      )}
                    </div>
                    <div className={styles.productListInfo}>
                      <strong>{product.name}</strong>
                      <small>
                        {product.category?.name ?? "Sem categoria"}
                        {product.is_archived ? " · Arquivado" : ""}
                      </small>
                      <div className={styles.productListVariants}>
                        {product.variants.map((v) => (
                          <span key={v.id}>
                            {v.name} · {money(v.price_cents)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <em className={styles.productListStatus}>
                      {product.is_archived
                        ? "Arquivado"
                        : product.is_active
                          ? "Ativo"
                          : "Pausado"}
                    </em>
                    <div className={styles.productListActions}>
                      {!product.is_archived && (
                        <>
                          <button
                            onClick={() => {
                              setEditingProduct(product);
                              setEditingProductImage(undefined);
                              setVariantPriceDrafts(
                                Object.fromEntries(
                                  product.variants.map((v) => [
                                    v.id,
                                    (v.price_cents / 100).toFixed(2),
                                  ]),
                                ),
                              );
                              setEditingProductCategory(
                                product.category?.id ?? null,
                              );
                            }}
                          >
                            Editar
                          </button>
                          <button onClick={() => void toggleProduct(product)}>
                            {product.is_active ? "Pausar" : "Ativar"}
                          </button>
                        </>
                      )}
                      <button onClick={() => void archiveProduct(product)}>
                        {product.is_archived ? "Restaurar" : "Arquivar"}
                      </button>
                      {!product.has_orders && (
                        <button
                          className={styles.dangerAction}
                          onClick={() => void deleteProduct(product)}
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              {editingProduct && (
                <form className={styles.modal} onSubmit={saveProduct}>
                  <div>
                    <h2>Editar produto</h2>
                    <label>
                      Nome
                      <input
                        name="name"
                        defaultValue={editingProduct.name}
                        required
                      />
                    </label>
                    <label>
                      Descrição
                      <textarea
                        name="description"
                        defaultValue={editingProduct.description ?? ""}
                      />
                    </label>
                    {activeCategories.length > 0 && (
                      <label>
                        Categoria
                        <select
                          value={editingProductCategory ?? ""}
                          onChange={(e) =>
                            setEditingProductCategory(e.target.value || null)
                          }
                        >
                          <option value="">Sem categoria</option>
                          {activeCategories.map((category) => (
                            <option
                              key={category.category_id}
                              value={category.category_id}
                            >
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {editingProduct.variants.length > 0 && (
                      <label>
                        Preços
                        <div className={styles.variantEditList}>
                          {editingProduct.variants.map((v) => (
                            <div key={v.id} className={styles.variantEditRow}>
                              <span>{v.name}</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={variantPriceDrafts[v.id] ?? ""}
                                onChange={(e) =>
                                  setVariantPriceDrafts((c) => ({
                                    ...c,
                                    [v.id]: e.target.value,
                                  }))
                                }
                                aria-label={`Preço de ${v.name}`}
                              />
                            </div>
                          ))}
                        </div>
                      </label>
                    )}
                    <label>
                      Foto do produto
                      {(editingProductImage !== undefined
                        ? editingProductImage
                        : editingProduct.cover_image_url) && (
                        <img
                          src={
                            (editingProductImage !== undefined
                              ? editingProductImage
                              : editingProduct.cover_image_url)!
                          }
                          alt=""
                          className={styles.productCoverPreview}
                        />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={attachProductImage}
                      />
                      {(editingProductImage !== undefined
                        ? editingProductImage
                        : editingProduct.cover_image_url) && (
                        <button
                          type="button"
                          onClick={() => setEditingProductImage(null)}
                        >
                          Remover foto
                        </button>
                      )}
                    </label>
                    <footer>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingProduct(null);
                          setEditingProductImage(undefined);
                          setVariantPriceDrafts({});
                          setEditingProductCategory(undefined);
                        }}
                      >
                        Cancelar
                      </button>
                      <button className={styles.primary}>Salvar produto</button>
                    </footer>
                  </div>
                </form>
              )}
              {newProductOpen && (
                <form className={styles.modal} onSubmit={createProduct}>
                  <div>
                    <h2>Novo produto</h2>
                    <label>
                      Nome
                      <input
                        value={newProductForm.name}
                        onChange={(e) =>
                          setNewProductForm((c) => ({
                            ...c,
                            name: e.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                    <label>
                      Descrição
                      <textarea
                        value={newProductForm.description}
                        onChange={(e) =>
                          setNewProductForm((c) => ({
                            ...c,
                            description: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Preço (R$)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={newProductForm.price}
                        onChange={(e) =>
                          setNewProductForm((c) => ({
                            ...c,
                            price: e.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                    <label>
                      SKU
                      <input
                        value={newProductForm.sku}
                        onChange={(e) =>
                          setNewProductForm((c) => ({
                            ...c,
                            sku: e.target.value,
                          }))
                        }
                        placeholder="Código interno (opcional)"
                      />
                    </label>
                    {activeCategories.length > 0 && (
                      <label>
                        Categoria
                        <select
                          value={newProductForm.category_id}
                          onChange={(e) =>
                            setNewProductForm((c) => ({
                              ...c,
                              category_id: e.target.value,
                            }))
                          }
                        >
                          <option value="">Sem categoria</option>
                          {activeCategories.map((category) => (
                            <option
                              key={category.category_id}
                              value={category.category_id}
                            >
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label>
                      Foto do produto
                      {newProductForm.cover_image_url && (
                        <img
                          src={newProductForm.cover_image_url}
                          alt=""
                          className={styles.productCoverPreview}
                        />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={attachNewProductImage}
                        disabled={newProductImageBusy}
                      />
                      {newProductForm.cover_image_url && (
                        <button
                          type="button"
                          onClick={() =>
                            setNewProductForm((c) => ({
                              ...c,
                              cover_image_url: null,
                            }))
                          }
                        >
                          Remover
                        </button>
                      )}
                    </label>
                    <footer>
                      <button
                        type="button"
                        onClick={() => {
                          setNewProductOpen(false);
                          setNewProductForm({
                            name: "",
                            description: "",
                            price: "",
                            sku: "",
                            category_id: "",
                            cover_image_url: null,
                          });
                        }}
                      >
                        Cancelar
                      </button>
                      <button
                        className={styles.primary}
                        disabled={busy === "new-product"}
                      >
                        {busy === "new-product" ? "Criando…" : "Criar produto"}
                      </button>
                    </footer>
                  </div>
                </form>
              )}
            </Panel>
          )}
          {tab === "store" && store && (
            <form onSubmit={saveStore} className={styles.settings}>
              <div className={styles.storeIntro}>
                <div>
                  <span className={styles.kicker}>CONFIGURAÇÃO COMPLETA</span>
                  <h2>Personalize sua loja</h2>
                  <p>
                    Os dados e a aparência abaixo são aplicados diretamente à
                    vitrine do cliente.
                  </p>
                </div>
                <a href={`/loja/${store.store_slug}`} target="_blank">
                  Visualizar loja ↗
                </a>
              </div>
              <div
                className={
                  storeStep === 0
                    ? styles.storeStepPanel
                    : styles.storeStepHidden
                }
              >
                <Panel
                  title="Identidade da loja"
                  subtitle="Informações exibidas no cabeçalho e usadas pela operação"
                >
                  <div className={styles.formGrid}>
                    <label>
                      Nome da loja
                      <input
                        name="name"
                        value={storeNameDraft}
                        onChange={(e) => setStoreNameDraft(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Subtítulo da marca
                      <input
                        value={storefront.brand_subtitle}
                        onChange={(e) =>
                          setStorefront((current) => ({
                            ...current,
                            brand_subtitle: e.target.value,
                          }))
                        }
                        maxLength={120}
                      />
                    </label>
                    <label>
                      Situação
                      <select name="status" defaultValue={store.status}>
                        <option value="ACTIVE">Aberta</option>
                        <option value="INACTIVE">Fechada</option>
                      </select>
                    </label>
                    <label>
                      Moeda
                      <input
                        name="currency"
                        defaultValue={store.currency}
                        maxLength={3}
                        required
                      />
                    </label>
                    <label>
                      Fuso horário
                      <input
                        name="timezone"
                        defaultValue={store.timezone}
                        required
                      />
                    </label>
                  </div>
                </Panel>
              </div>
              <div
                className={
                  storeStep === 1
                    ? styles.storeStepPanel
                    : styles.storeStepHidden
                }
              >
                <Panel
                  title="Aparência da vitrine"
                  subtitle="Cores, tipografia, logo e imagem principal visíveis para o cliente"
                >
                  <div className={styles.appearanceGrid}>
                    <div className={styles.formGrid}>
                      <label>
                        Frase superior
                        <input
                          value={storefront.hero_eyebrow}
                          onChange={(e) =>
                            setStorefront((current) => ({
                              ...current,
                              hero_eyebrow: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        Fonte da loja
                        <select
                          value={storefront.font_family}
                          onChange={(e) =>
                            setStorefront((current) => ({
                              ...current,
                              font_family: e.target
                                .value as StorefrontConfig["font_family"],
                            }))
                          }
                        >
                          <option value="CLASSIC">Clássica</option>
                          <option value="MODERN">Moderna</option>
                          <option value="ROUNDED">Arredondada</option>
                        </select>
                      </label>
                      <label>
                        Capitalização
                        <select
                          value={storefront.text_case}
                          onChange={(e) =>
                            setStorefront((current) => ({
                              ...current,
                              text_case: e.target
                                .value as StorefrontConfig["text_case"],
                            }))
                          }
                        >
                          <option value="AS_TYPED">Manter como digitado</option>
                          <option value="UPPERCASE">
                            Exibir em caixa alta
                          </option>
                        </select>
                      </label>
                      <label className={styles.wideField}>
                        Título principal
                        <textarea
                          value={storefront.hero_title}
                          onChange={(e) =>
                            setStorefront((current) => ({
                              ...current,
                              hero_title: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className={styles.wideField}>
                        Descrição principal
                        <textarea
                          value={storefront.hero_description}
                          onChange={(e) =>
                            setStorefront((current) => ({
                              ...current,
                              hero_description: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        Cor principal
                        <div className={styles.colorField}>
                          <input
                            type="color"
                            value={storefront.primary_color}
                            onChange={(e) =>
                              setStorefront((current) => ({
                                ...current,
                                primary_color: e.target.value,
                              }))
                            }
                          />
                          <input
                            value={storefront.primary_color}
                            onChange={(e) =>
                              setStorefront((current) => ({
                                ...current,
                                primary_color: e.target.value,
                              }))
                            }
                            pattern="#[0-9a-fA-F]{6}"
                          />
                        </div>
                      </label>
                      <label>
                        Cor de destaque
                        <div className={styles.colorField}>
                          <input
                            type="color"
                            value={storefront.accent_color}
                            onChange={(e) =>
                              setStorefront((current) => ({
                                ...current,
                                accent_color: e.target.value,
                              }))
                            }
                          />
                          <input
                            value={storefront.accent_color}
                            onChange={(e) =>
                              setStorefront((current) => ({
                                ...current,
                                accent_color: e.target.value,
                              }))
                            }
                            pattern="#[0-9a-fA-F]{6}"
                          />
                        </div>
                      </label>
                      <label>
                        Cor de fundo
                        <div className={styles.colorField}>
                          <input
                            type="color"
                            value={storefront.background_color}
                            onChange={(e) =>
                              setStorefront((current) => ({
                                ...current,
                                background_color: e.target.value,
                              }))
                            }
                          />
                          <input
                            value={storefront.background_color}
                            onChange={(e) =>
                              setStorefront((current) => ({
                                ...current,
                                background_color: e.target.value,
                              }))
                            }
                            pattern="#[0-9a-fA-F]{6}"
                          />
                        </div>
                      </label>
                      <label>
                        Cor do cabeçalho e logo
                        <div className={styles.colorField}>
                          <input
                            type="color"
                            value={storefront.header_background_color}
                            onChange={(e) =>
                              setStorefront((current) => ({
                                ...current,
                                header_background_color: e.target.value,
                              }))
                            }
                          />
                          <input
                            value={storefront.header_background_color}
                            onChange={(e) =>
                              setStorefront((current) => ({
                                ...current,
                                header_background_color: e.target.value,
                              }))
                            }
                            pattern="#[0-9a-fA-F]{6}"
                          />
                        </div>
                      </label>
                      <ColorField
                        label="Cor do nome da loja"
                        value={storefront.brand_name_color}
                        onChange={(brand_name_color) =>
                          setStorefront((current) => ({
                            ...current,
                            brand_name_color,
                          }))
                        }
                      />
                      <ColorField
                        label="Cor do subtítulo da marca"
                        value={storefront.brand_subtitle_color}
                        onChange={(brand_subtitle_color) =>
                          setStorefront((current) => ({
                            ...current,
                            brand_subtitle_color,
                          }))
                        }
                      />
                      <ColorField
                        label="Cor da frase superior"
                        value={storefront.hero_eyebrow_color}
                        onChange={(hero_eyebrow_color) =>
                          setStorefront((current) => ({
                            ...current,
                            hero_eyebrow_color,
                          }))
                        }
                      />
                      <ColorField
                        label="Cor do título principal"
                        value={storefront.hero_title_color}
                        onChange={(hero_title_color) =>
                          setStorefront((current) => ({
                            ...current,
                            hero_title_color,
                          }))
                        }
                      />
                      <ColorField
                        label="Cor da descrição principal"
                        value={storefront.hero_description_color}
                        onChange={(hero_description_color) =>
                          setStorefront((current) => ({
                            ...current,
                            hero_description_color,
                          }))
                        }
                      />
                      <label>
                        Fundo do bloco de destaque
                        <select
                          value={storefront.hero_bg_type ?? "GRADIENT"}
                          onChange={(e) =>
                            setStorefront((current) => ({
                              ...current,
                              hero_bg_type: e.target.value as
                                | "GRADIENT"
                                | "COLOR"
                                | "IMAGE",
                            }))
                          }
                        >
                          <option value="GRADIENT">Gradiente automático</option>
                          <option value="COLOR">Cor sólida</option>
                          <option value="IMAGE">Imagem de fundo</option>
                        </select>
                      </label>
                      {storefront.hero_bg_type === "COLOR" && (
                        <label>
                          Cor do fundo do bloco
                          <div className={styles.colorField}>
                            <input
                              type="color"
                              value={storefront.hero_bg_color ?? "#fffaf4"}
                              onChange={(e) =>
                                setStorefront((current) => ({
                                  ...current,
                                  hero_bg_color: e.target.value,
                                }))
                              }
                            />
                            <input
                              value={storefront.hero_bg_color ?? ""}
                              onChange={(e) =>
                                setStorefront((current) => ({
                                  ...current,
                                  hero_bg_color: e.target.value || null,
                                }))
                              }
                              pattern="#[0-9a-fA-F]{6}"
                            />
                          </div>
                        </label>
                      )}
                      {storefront.hero_bg_type === "IMAGE" && (
                        <>
                          <label className={styles.wideField}>
                            Anexar imagem de fundo
                            <div className={styles.uploadField}>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={(e) =>
                                  void attachImage(e, "hero_bg_image_url")
                                }
                              />
                              <span>
                                {storefront.hero_bg_image_url
                                  ? "Imagem de fundo anexada ou informada"
                                  : "PNG, JPG ou WebP"}
                              </span>
                              {storefront.hero_bg_image_url && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setStorefront((current) => ({
                                      ...current,
                                      hero_bg_image_url: null,
                                    }))
                                  }
                                >
                                  Remover
                                </button>
                              )}
                            </div>
                          </label>
                          <label className={styles.wideField}>
                            Ou usar URL da imagem de fundo
                            <input
                              type="url"
                              placeholder="https://… URL de uma imagem"
                              value={
                                storefront.hero_bg_image_url?.startsWith(
                                  "data:",
                                )
                                  ? ""
                                  : (storefront.hero_bg_image_url ?? "")
                              }
                              onChange={(e) =>
                                setStorefront((current) => ({
                                  ...current,
                                  hero_bg_image_url: e.target.value || null,
                                }))
                              }
                            />
                          </label>
                          {storefront.hero_bg_image_url && (
                            <>
                              <RangeField
                                label="Zoom do fundo"
                                value={storefront.hero_bg_image_scale}
                                min={1}
                                max={2}
                                step={0.05}
                                display={`${Math.round(storefront.hero_bg_image_scale * 100)}%`}
                                onChange={(value) =>
                                  setStorefront((current) => ({
                                    ...current,
                                    hero_bg_image_scale: value,
                                  }))
                                }
                              />
                              <RangeField
                                label="Posição horizontal do fundo"
                                value={storefront.hero_bg_position_x}
                                min={0}
                                max={100}
                                display={`${storefront.hero_bg_position_x}%`}
                                onChange={(value) =>
                                  setStorefront((current) => ({
                                    ...current,
                                    hero_bg_position_x: value,
                                  }))
                                }
                              />
                              <RangeField
                                label="Posição vertical do fundo"
                                value={storefront.hero_bg_position_y}
                                min={0}
                                max={100}
                                display={`${storefront.hero_bg_position_y}%`}
                                onChange={(value) =>
                                  setStorefront((current) => ({
                                    ...current,
                                    hero_bg_position_y: value,
                                  }))
                                }
                              />
                            </>
                          )}
                        </>
                      )}
                      <label className={styles.wideField}>
                        Logo da loja
                        <div className={styles.uploadField}>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/svg+xml"
                            onChange={(e) => void attachImage(e, "logo_url")}
                          />
                          <span>
                            {storefront.logo_url
                              ? "Logo anexado"
                              : "PNG, JPG, WebP ou SVG"}
                          </span>
                          {storefront.logo_url && (
                            <button
                              type="button"
                              onClick={() =>
                                setStorefront((current) => ({
                                  ...current,
                                  logo_url: null,
                                }))
                              }
                            >
                              Remover
                            </button>
                          )}
                        </div>
                      </label>
                      <label>
                        Bloco de apresentação
                        <select
                          value={
                            storefront.hero_image_enabled ? "VISIBLE" : "HIDDEN"
                          }
                          onChange={(e) =>
                            setStorefront((current) => ({
                              ...current,
                              hero_image_enabled: e.target.value === "VISIBLE",
                            }))
                          }
                        >
                          <option value="VISIBLE">Exibir</option>
                          <option value="HIDDEN">Ocultar</option>
                        </select>
                      </label>
                      <label>
                        Tamanho do bloco
                        <select
                          value={storefront.hero_section_size}
                          onChange={(e) =>
                            setStorefront((current) => ({
                              ...current,
                              hero_section_size: e.target
                                .value as StorefrontConfig["hero_section_size"],
                            }))
                          }
                        >
                          <option value="COMPACT">Compacto</option>
                          <option value="NORMAL">Normal</option>
                          <option value="TALL">Alto</option>
                        </select>
                      </label>
                      <label>
                        Modo de exibição
                        <select
                          value={storefront.hero_display_mode}
                          onChange={(e) =>
                            setStorefront((current) => ({
                              ...current,
                              hero_display_mode: e.target
                                .value as StorefrontConfig["hero_display_mode"],
                            }))
                          }
                        >
                          <option value="CORNER">Canto decorado</option>
                          <option value="FULLSCREEN">Fundo inteiro</option>
                          <option value="FLAME">Forma chama</option>
                          <option value="CAROUSEL">Carrossel</option>
                        </select>
                      </label>
                      <label>
                        Preenchimento da imagem
                        <select
                          value={storefront.hero_image_fit ?? "FILL"}
                          onChange={(e) =>
                            setStorefront((current) => ({
                              ...current,
                              hero_image_fit: e.target
                                .value as StorefrontConfig["hero_image_fit"],
                            }))
                          }
                        >
                          <option value="FILL">
                            Cheio (preenche o quadro)
                          </option>
                          <option value="FIT">
                            Encaixado (mostra toda a imagem)
                          </option>
                        </select>
                      </label>
                      <label>
                        Tamanho da ilustração
                        <select
                          value={storefront.hero_image_size}
                          onChange={(e) =>
                            setStorefront((current) => ({
                              ...current,
                              hero_image_size: e.target
                                .value as StorefrontConfig["hero_image_size"],
                            }))
                          }
                          disabled={
                            storefront.hero_display_mode === "FULLSCREEN" ||
                            storefront.hero_display_mode === "CAROUSEL"
                          }
                        >
                          <option value="SMALL">Pequena</option>
                          <option value="MEDIUM">Média</option>
                          <option value="LARGE">Grande</option>
                        </select>
                      </label>
                      {storefront.hero_display_mode === "CAROUSEL" ? (
                        <label className={styles.wideField}>
                          Imagens do carrossel ({storefront.hero_images.length}
                          /5)
                          <div className={styles.carouselThumbs}>
                            {storefront.hero_images.map((img, i) => (
                              <div key={i} className={styles.carouselThumb}>
                                <img src={img} alt={`Slide ${i + 1}`} />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setStorefront((current) => ({
                                      ...current,
                                      hero_images: current.hero_images.filter(
                                        (_, j) => j !== i,
                                      ),
                                    }))
                                  }
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            {storefront.hero_images.length < 5 && (
                              <label className={styles.carouselAdd}>
                                <input
                                  type="file"
                                  accept="image/*"
                                  style={{ display: "none" }}
                                  onChange={(e) => void attachCarouselImage(e)}
                                />
                                <span>+</span>
                                <small>Adicionar</small>
                              </label>
                            )}
                          </div>
                        </label>
                      ) : (
                        <>
                          <label className={styles.wideField}>
                            Anexar imagem principal
                            <div className={styles.uploadField}>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={(e) =>
                                  void attachImage(e, "hero_image_url")
                                }
                              />
                              <span>
                                {storefront.hero_image_url
                                  ? "Imagem anexada ou URL informada"
                                  : "PNG, JPG ou WebP"}
                              </span>
                              {storefront.hero_image_url && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setStorefront((current) => ({
                                      ...current,
                                      hero_image_url: null,
                                    }))
                                  }
                                >
                                  Remover
                                </button>
                              )}
                            </div>
                          </label>
                          <label className={styles.wideField}>
                            Ou usar URL da imagem
                            <input
                              type="url"
                              placeholder="Deixe vazio para usar a ilustração padrão"
                              value={
                                storefront.hero_image_url?.startsWith("data:")
                                  ? ""
                                  : (storefront.hero_image_url ?? "")
                              }
                              onChange={(e) =>
                                setStorefront((current) => ({
                                  ...current,
                                  hero_image_url: e.target.value || null,
                                }))
                              }
                            />
                          </label>
                        </>
                      )}
                      {(storefront.hero_image_url ||
                        storefront.hero_images.length > 0) && (
                        <>
                          <RangeField
                            label="Zoom da imagem"
                            value={storefront.hero_image_scale}
                            min={1}
                            max={2}
                            step={0.05}
                            display={`${Math.round(storefront.hero_image_scale * 100)}%`}
                            onChange={(value) =>
                              setStorefront((current) => ({
                                ...current,
                                hero_image_scale: value,
                              }))
                            }
                          />
                          <RangeField
                            label="Posição horizontal"
                            value={storefront.hero_image_position_x}
                            min={0}
                            max={100}
                            display={`${storefront.hero_image_position_x}%`}
                            onChange={(value) =>
                              setStorefront((current) => ({
                                ...current,
                                hero_image_position_x: value,
                              }))
                            }
                          />
                          <RangeField
                            label="Posição vertical"
                            value={storefront.hero_image_position_y}
                            min={0}
                            max={100}
                            display={`${storefront.hero_image_position_y}%`}
                            onChange={(value) =>
                              setStorefront((current) => ({
                                ...current,
                                hero_image_position_y: value,
                              }))
                            }
                          />
                        </>
                      )}
                    </div>
                    <StorefrontPreview
                      storeName={storeNameDraft || store.store_name}
                      config={storefront}
                    />
                  </div>
                </Panel>
              </div>
              <div
                className={
                  storeStep === 2
                    ? styles.storeStepPanel
                    : styles.storeStepHidden
                }
              >
                <Panel
                  title="Endereço de saída"
                  subtitle="Ponto de partida para cálculo e organização das entregas"
                >
                  <div className={styles.formGrid}>
                    {(
                      [
                        "street",
                        "number",
                        "complement",
                        "district",
                        "city",
                        "state",
                        "postal_code",
                        "reference",
                      ] as const
                    ).map((key) => (
                      <label key={key}>
                        {addressLabel(key)}
                        <input
                          value={address[key]}
                          maxLength={key === "state" ? 2 : undefined}
                          onChange={(e) =>
                            setAddress((current) => ({
                              ...current,
                              [key]: e.target.value,
                            }))
                          }
                          required={!["complement", "reference"].includes(key)}
                        />
                      </label>
                    ))}
                  </div>
                </Panel>
              </div>
              <div
                className={
                  storeStep === 3
                    ? styles.storeStepPanel
                    : styles.storeStepHidden
                }
              >
                <Panel
                  title="Modalidades de atendimento"
                  subtitle="Defina como os clientes podem receber ou retirar seus pedidos"
                >
                  <div className={styles.formGrid}>
                    {(
                      [
                        { key: "scheduled_delivery_enabled" as const, label: "Entrega agendada", description: "Cliente escolhe data e hora para receber" },
                        { key: "pickup_in_person_enabled" as const, label: "Retirada no local", description: "Cliente retira pessoalmente na loja" },
                        { key: "pickup_by_app_enabled" as const, label: "Retirada via app (motoboy iFood/Rappi)", description: "Motoboy de aplicativo busca na loja" },
                        { key: "pickup_scheduling_enabled" as const, label: "Permitir agendamento de retirada", description: "Cliente escolhe horário aproximado de retirada" },
                      ] as const
                    ).map(({ key, label, description }) => (
                      <label key={key} style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={fulfillmentConfig[key]}
                          onChange={(e) =>
                            setFulfillmentConfig((current) => ({
                              ...current,
                              [key]: e.target.checked,
                            }))
                          }
                        />
                        <span>
                          <strong>{label}</strong>
                          <br />
                          <small style={{ opacity: 0.65 }}>{description}</small>
                        </span>
                      </label>
                    ))}
                    <p style={{ gridColumn: "1 / -1", margin: 0, opacity: 0.6, fontSize: "0.85rem" }}>
                      Entrega imediata é gerenciada automaticamente pelo endereço de saída e regra de frete.
                    </p>
                  </div>
                </Panel>
                <Panel
                  title="Meios de pagamento"
                  subtitle="Quais formas de pagamento aceitar no checkout"
                >
                  <div className={styles.formGrid}>
                    {(
                      [
                        { key: "cash_enabled" as const, label: "Dinheiro", description: "Pague em dinheiro na entrega ou retirada" },
                        { key: "card_on_site_enabled" as const, label: "Cartão (maquininha)", description: "Pagamento com cartão na entrega ou retirada" },
                        { key: "pix_enabled" as const, label: "PIX", description: "Transferência instantânea via chave PIX" },
                        { key: "mercado_pago_enabled" as const, label: "Mercado Pago", description: "Pagamento online via Mercado Pago" },
                      ] as const
                    ).map(({ key, label, description }) => (
                      <label key={key} style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={paymentConfig[key]}
                          onChange={(e) =>
                            setPaymentConfig((current) => ({
                              ...current,
                              [key]: e.target.checked,
                            }))
                          }
                        />
                        <span>
                          <strong>{label}</strong>
                          <br />
                          <small style={{ opacity: 0.65 }}>{description}</small>
                        </span>
                      </label>
                    ))}
                    <p style={{ gridColumn: "1 / -1", margin: 0, opacity: 0.6, fontSize: "0.85rem" }}>
                      &quot;Pague na entrega&quot; combina Dinheiro e Cartão — o operador resolve na hora.
                    </p>
                  </div>
                </Panel>
              </div>
              <div
                className={
                  storeStep === 4
                    ? styles.storeStepPanel
                    : styles.storeStepHidden
                }
              >
                <Panel
                  title="Mercado Pago"
                  subtitle="Configure as credenciais de integração para pagamento online"
                >
                  <div className={styles.formGrid}>
                    <label style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={mpConfig.is_active}
                        onChange={(e) => setMpConfig((c) => ({ ...c, is_active: e.target.checked }))}
                      />
                      <span>
                        <strong>Integração ativa</strong>
                        <br />
                        <small style={{ opacity: 0.65 }}>Permite processar pagamentos via Mercado Pago no checkout</small>
                      </span>
                    </label>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={{ display: "block", fontWeight: 700, fontSize: "0.85rem", marginBottom: 4 }}>
                        Access Token
                        {mpConfig.has_access_token && (
                          <span style={{ marginLeft: 8, fontWeight: 400, color: "#2d7a2d", fontSize: "0.8rem" }}>✓ configurado</span>
                        )}
                      </label>
                      <input
                        type="password"
                        className={styles.formInput}
                        value={mpAccessToken}
                        onChange={(e) => setMpAccessToken(e.target.value)}
                        placeholder={mpConfig.has_access_token ? "••••••••  (deixe em branco para manter)" : "APP_USR-..."}
                        autoComplete="off"
                        style={{ width: "100%", boxSizing: "border-box" }}
                      />
                      <small style={{ opacity: 0.6, fontSize: "0.78rem" }}>Token de produção ou sandbox do painel do Mercado Pago.</small>
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={{ display: "block", fontWeight: 700, fontSize: "0.85rem", marginBottom: 4 }}>
                        Public Key
                      </label>
                      <input
                        type="text"
                        className={styles.formInput}
                        value={mpPublicKey}
                        onChange={(e) => setMpPublicKey(e.target.value)}
                        placeholder="APP_USR-..."
                        autoComplete="off"
                        style={{ width: "100%", boxSizing: "border-box" }}
                      />
                      <small style={{ opacity: 0.6, fontSize: "0.78rem" }}>Chave pública para inicializar o checkout no navegador.</small>
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <button
                        type="button"
                        className={styles.primary}
                        disabled={busy === "mp-config"}
                        onClick={() => void saveMpConfig()}
                        style={{ width: "100%" }}
                      >
                        {busy === "mp-config" ? "Salvando…" : "Salvar credenciais"}
                      </button>
                    </div>
                    {mpConfig.has_access_token && (
                      <p style={{ gridColumn: "1 / -1", margin: 0, opacity: 0.5, fontSize: "0.8rem" }}>
                        Para remover a integração completamente, entre em contato com o suporte.
                      </p>
                    )}
                  </div>
                </Panel>
              </div>
              <div className={styles.storeSteps}>
                <button
                  type="button"
                  disabled={storeStep === 0}
                  onClick={() =>
                    setStoreStep((current) => Math.max(0, current - 1))
                  }
                >
                  ← Anterior
                </button>
                <nav aria-label="Etapas da configuração">
                  {["Identidade", "Aparência", "Endereço", "Atendimento", "Pagamentos"].map(
                    (label, index) => (
                      <button
                        type="button"
                        key={label}
                        className={
                          storeStep === index
                            ? styles.currentStoreStep
                            : undefined
                        }
                        onClick={() => setStoreStep(index)}
                      >
                        <span>{index + 1}</span>
                        {label}
                      </button>
                    ),
                  )}
                </nav>
                <div className={styles.storeStepActions}>
                  {storeStep < 4 && (
                    <button
                      type="button"
                      onClick={() =>
                        setStoreStep((current) => Math.min(4, current + 1))
                      }
                    >
                      Próxima →
                    </button>
                  )}
                  <button
                    className={styles.primary}
                    disabled={busy === "store"}
                  >
                    {busy === "store" ? "Salvando…" : "Salvar alterações"}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
        {selectedOrder && (
          <OrderDetailDialog
            summary={selectedOrder}
            detail={orderDetail}
            loading={orderDetailLoading}
            onClose={closeOrder}
            storeAddress={store?.origin_address ?? null}
          />
        )}
      </section>
    </main>
  );
}

function Nav({
  tab,
  current,
  onClick,
  icon,
  children,
}: {
  tab: Tab;
  current: Tab;
  onClick: (tab: Tab) => void;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className={current === tab ? styles.activeNav : undefined}
      onClick={() => onClick(tab)}
    >
      <span>{icon}</span>
      {children}
    </button>
  );
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function Panel({
  title,
  subtitle,
  action,
  onAction,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.panel}>
      <header>
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action && <button onClick={onAction}>{action}</button>}
      </header>
      {children}
    </section>
  );
}
function Empty({ text }: { text: string }) {
  return <div className={styles.empty}>{text}</div>;
}
function OrderList({
  orders,
  busy,
  onTransition,
}: {
  orders: Order[];
  busy: string;
  onTransition: (id: string, to: OrderStatus) => Promise<void>;
}) {
  return (
    <div className={styles.orderList}>
      {orders.length === 0 && <Empty text="Nenhum pedido ativo." />}
      {orders.map((order) => {
        const action = actionForOrder(order);
        return (
          <article key={order.order_id}>
            <span className={styles.orderNumber}>{order.public_number}</span>
            <div>
              <strong>{order.customer_name}</strong>
              <small>
                {order.fulfillment === "DELIVERY" ? "Entrega" : order.fulfillment === "DELIVERY_SCHEDULED" ? "Entrega agendada" : order.fulfillment === "PICKUP_BY_APP" ? "App" : "Retirada"} ·{" "}
                {money(order.total_cents)}
              </small>
            </div>
            <em data-status={order.status}>{statusLabel[order.status]}</em>
            {action && (
              <button
                disabled={busy === order.order_id}
                onClick={() => void onTransition(order.order_id, action.to)}
              >
                {action.label}
              </button>
            )}
          </article>
        );
      })}
    </div>
  );
}
function KanbanBoard({
  orders,
  busy,
  onTransition,
  onCancel,
  onDeliveries,
  onOpen,
}: {
  orders: Order[];
  busy: string;
  onTransition: (id: string, to: OrderStatus) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
  onDeliveries: () => void;
  onOpen: (order: Order) => void;
}) {
  const columns: Array<{
    key: string;
    title: string;
    statuses: OrderStatus[];
  }> = [
    {
      key: "approval",
      title: "Aguardando aprovação",
      statuses: ["PAYMENT_PENDING", "PAYMENT_FAILED", "NEW"],
    },
    { key: "not-started", title: "Não iniciado", statuses: ["CONFIRMED"] },
    { key: "production", title: "Produção", statuses: ["IN_PREPARATION"] },
    { key: "ready", title: "Prontos", statuses: ["READY", "READY_FOR_PICKUP"] },
    { key: "delivery", title: "Entregas", statuses: ["OUT_FOR_DELIVERY"] },
    { key: "done", title: "Concluídos", statuses: ["COMPLETED"] },
  ];
  return (
    <div className={styles.kanban}>
      {columns.map((column) => {
        const grouped = orders
          .filter((order) => column.statuses.includes(order.status))
          .slice(0, column.key === "done" ? 12 : 50);
        return (
          <section
            className={styles.kanbanColumn}
            data-column={column.key}
            key={column.key}
          >
            <header>
              <h3>{column.title}</h3>
              <span>{grouped.length}</span>
            </header>
            <div className={styles.kanbanBody}>
              {grouped.length === 0 && <Empty text="Fila vazia." />}
              {grouped.map((order) => (
                <KanbanCard
                  key={order.order_id}
                  order={order}
                  busy={busy === order.order_id}
                  onTransition={onTransition}
                  onCancel={onCancel}
                  onDeliveries={onDeliveries}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
function KanbanCard({
  order,
  busy,
  onTransition,
  onCancel,
  onDeliveries,
  onOpen,
}: {
  order: Order;
  busy: boolean;
  onTransition: (id: string, to: OrderStatus) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
  onDeliveries: () => void;
  onOpen: (order: Order) => void;
}) {
  const action = actionForOrder(order);
  const done = order.status === "COMPLETED";
  const awaiting = ["PAYMENT_PENDING", "PAYMENT_FAILED", "NEW"].includes(
    order.status,
  );
  const isDelivery = order.fulfillment === "DELIVERY";
  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Ver detalhes do pedido ${order.public_number}`}
      onClick={() => onOpen(order)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(order);
        }
      }}
      className={`${styles.kanbanCard} ${done ? styles.completedCard : ""} ${awaiting ? styles.awaitingApproval : ""}`}
    >
      <div className={styles.kanbanCardHead}>
        <strong>{order.public_number}</strong>
        <em data-status={order.status}>{statusLabel[order.status]}</em>
      </div>
      <h4>{order.customer_name}</h4>
      <div className={styles.cardMeta}>
        <span>{isDelivery ? "Entrega" : "Retirada"}</span>
        <span>{formatTime(order.placed_at)}</span>
      </div>
      <div className={styles.cardSummary}>
        {order.items_label && (
          <span className={styles.cardItems}>{order.items_label}</span>
        )}
        {isDelivery && order.district && (
          <span className={styles.cardDistrict}>{order.district}</span>
        )}
        {isDelivery && order.delivery_fee_cents > 0 && (
          <span className={styles.cardFrete}>
            Frete {money(order.delivery_fee_cents)}
          </span>
        )}
      </div>
      <div className={styles.cardTotal}>{money(order.total_cents)}</div>
      {!done && (
        <footer>
          {action && (
            <button
              className={styles.cardPrimary}
              disabled={busy}
              onClick={(event) => {
                event.stopPropagation();
                void onTransition(order.order_id, action.to);
              }}
            >
              {busy ? "Aguarde…" : action.label}
            </button>
          )}
          {order.status === "READY" && isDelivery && (
            <button
              className={styles.cardPrimary}
              onClick={(event) => {
                event.stopPropagation();
                onDeliveries();
              }}
            >
              Montar rota
            </button>
          )}
          <button
            className={styles.cardCancel}
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              void onCancel(order.order_id);
            }}
          >
            Cancelar
          </button>
        </footer>
      )}
    </article>
  );
}
function OrderDetailDialog({
  summary,
  detail,
  loading,
  onClose,
  storeAddress,
}: {
  summary: Order;
  detail: OrderDetail | null;
  loading: boolean;
  onClose: () => void;
  storeAddress: Partial<Address> | null;
}) {
  const order = detail?.order;
  return (
    <div
      className={styles.orderDetailOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={`Detalhes do pedido ${summary.public_number}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={styles.orderDetailDialog}>
        <header>
          <div>
            <span className={styles.kicker}>DETALHES DO PEDIDO</span>
            <h2>{summary.public_number}</h2>
          </div>
          <button onClick={onClose} aria-label="Fechar detalhes">
            ×
          </button>
        </header>
        {loading && (
          <div className={styles.detailLoading}>Carregando informações…</div>
        )}
        {!loading && order && (
          <div className={styles.orderDetailContent}>
            <div className={styles.detailStatus}>
              <em data-status={order.status}>{statusLabel[order.status]}</em>
              <span>{formatFullDate(order.placed_at)}</span>
            </div>
            <div className={styles.detailGrid}>
              <section>
                <small>Cliente</small>
                <strong>{order.customer_name}</strong>
                <span>{order.phone_e164 ?? "Telefone não informado"}</span>
                <span>{order.email ?? "E-mail não informado"}</span>
              </section>
              <section>
                <small>Atendimento</small>
                <strong>
                  {order.fulfillment === "DELIVERY" ? "Entrega" : "Retirada"}
                </strong>
                <span>
                  {order.address_snapshot
                    ? formatFullAddress(order.address_snapshot)
                    : "Retirada na loja"}
                </span>
                {order.fulfillment === "DELIVERY" &&
                  order.address_snapshot &&
                  storeAddress && (
                    <a
                      href={`https://www.google.com/maps/dir/${encodeURIComponent(formatFullAddress(storeAddress as Record<string, string>))}/${encodeURIComponent(formatFullAddress(order.address_snapshot))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.routeLink}
                    >
                      Rota de entrega ↗
                    </a>
                  )}
              </section>
              <section>
                <small>Valores</small>
                <div className={styles.detailValues}>
                  <span>
                    Produtos <b>{money(order.subtotal_cents)}</b>
                  </span>
                  <span>
                    Frete <b>{money(order.delivery_fee_cents)}</b>
                  </span>
                  <span>
                    Total <b>{money(order.total_cents)}</b>
                  </span>
                </div>
              </section>
              <section>
                <small>Observações</small>
                <span>{order.notes || "Nenhuma observação adicionada."}</span>
              </section>
            </div>
            <section className={styles.detailSection}>
              <h3>Itens do pedido</h3>
              {detail.items.map((item) => (
                <div className={styles.detailItem} key={item.item_id}>
                  <div>
                    <strong>
                      {item.quantity}× {item.name_snapshot}
                    </strong>
                    <small>
                      {item.sku_snapshot}
                      {item.notes ? ` · ${item.notes}` : ""}
                    </small>
                  </div>
                  <b>{money(item.line_total_cents)}</b>
                </div>
              ))}
            </section>
            <section className={styles.detailSection}>
              <h3>Histórico</h3>
              <div className={styles.detailTimeline}>
                {detail.status_history.map((event) => (
                  <div key={event.event_id}>
                    <i />
                    <span>
                      <strong>
                        {statusLabel[event.to_status] ?? event.to_status}
                      </strong>
                      <small>
                        {formatFullDate(event.occurred_at)} ·{" "}
                        {event.actor_type === "CUSTOMER" ? "Cliente" : "Equipe"}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className={styles.rangeField}>
      {label}
      <div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <output>{display}</output>
      </div>
    </label>
  );
}
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <div className={styles.colorField}>
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          pattern="#[0-9a-fA-F]{6}"
          aria-label={`${label} em hexadecimal`}
        />
      </div>
    </label>
  );
}

function StorefrontPreview({
  storeName,
  config,
}: {
  storeName: string;
  config: StorefrontConfig;
}) {
  const heroImages = config.hero_images.length
    ? config.hero_images
    : config.hero_image_url
      ? [config.hero_image_url]
      : [];
  const mainImage =
    config.hero_display_mode === "CAROUSEL"
      ? heroImages[0]
      : config.hero_image_url;
  const heroBackground: React.CSSProperties =
    config.hero_bg_type === "IMAGE" && config.hero_bg_image_url
      ? {
          backgroundImage: `url(${config.hero_bg_image_url})`,
          backgroundSize:
            config.hero_bg_image_scale > 1
              ? `${Math.round(config.hero_bg_image_scale * 100)}% auto`
              : "cover",
          backgroundPosition: `${config.hero_bg_position_x}% ${config.hero_bg_position_y}%`,
          backgroundRepeat: "no-repeat",
        }
      : config.hero_bg_type === "COLOR" && config.hero_bg_color
        ? { background: config.hero_bg_color }
        : {
            background:
              "radial-gradient(circle at 82% 16%,color-mix(in srgb,var(--preview-accent) 28%,white) 0 7%,transparent 7.2%),linear-gradient(115deg,color-mix(in srgb,var(--preview-bg) 88%,white),color-mix(in srgb,var(--preview-primary) 15%,var(--preview-bg)))",
          };
  const imageStyle: React.CSSProperties = {
    objectFit: config.hero_image_fit === "FIT" ? "contain" : "cover",
    objectPosition: `${config.hero_image_position_x}% ${config.hero_image_position_y}%`,
    transform: `scale(${config.hero_image_scale})`,
  };
  const heroHeight =
    config.hero_section_size === "COMPACT"
      ? 170
      : config.hero_section_size === "TALL"
        ? 250
        : 210;
  const variables = {
    "--preview-primary": config.primary_color,
    "--preview-accent": config.accent_color,
    "--preview-bg": config.background_color,
    "--preview-header": config.header_background_color,
    "--preview-brand-name": config.brand_name_color,
    "--preview-brand-subtitle": config.brand_subtitle_color,
    "--preview-hero-eyebrow": config.hero_eyebrow_color,
    "--preview-hero-title": config.hero_title_color,
    "--preview-hero-description": config.hero_description_color,
    "--preview-font": storeFont(config.font_family),
  } as React.CSSProperties;
  return (
    <aside
      className={styles.storePreview}
      data-case={config.text_case}
      style={variables}
    >
      <small>PRÉVIA DA VITRINE</small>
      <section className={styles.previewViewport}>
        <header className={styles.previewHeader}>
          {config.logo_url ? (
            <img
              className={styles.previewLogo}
              src={config.logo_url}
              alt="Prévia do logo"
            />
          ) : (
            <span className={styles.previewMark}>{initials(storeName)}</span>
          )}
          <div className={styles.previewBrandCopy}>
            <strong>{storeName}</strong>
            <small>{config.brand_subtitle}</small>
          </div>
          <i>0</i>
        </header>
        <div
          className={`${styles.previewHero} ${!config.hero_image_enabled ? styles.previewHeroWithoutImage : ""}`}
          data-mode={config.hero_display_mode}
          data-image-size={config.hero_image_size}
          style={{ ...heroBackground, minHeight: heroHeight }}
        >
          {config.hero_image_enabled &&
            config.hero_display_mode === "FULLSCREEN" &&
            mainImage && (
              <img
                className={styles.previewHeroFullscreenImage}
                src={mainImage}
                style={imageStyle}
                alt=""
              />
            )}
          <div className={styles.previewHeroCopy}>
            <em>{config.hero_eyebrow}</em>
            <h3>{config.hero_title}</h3>
            <p>{config.hero_description}</p>
            <b>Ver cardápio ↓</b>
          </div>
          {config.hero_image_enabled &&
            config.hero_display_mode !== "FULLSCREEN" && (
              <div
                className={styles.previewHeroMedia}
                data-mode={config.hero_display_mode}
              >
                {mainImage ? (
                  <img
                    src={mainImage}
                    style={imageStyle}
                    alt="Prévia da imagem principal"
                  />
                ) : (
                  <span>Ilustração padrão</span>
                )}
                {config.hero_display_mode === "CAROUSEL" &&
                  heroImages.length > 1 && (
                    <small>1 / {heroImages.length}</small>
                  )}
              </div>
            )}
        </div>
        <div className={styles.previewCatalog}>
          <em>CARDÁPIO DIGITAL</em>
          <div>
            <span />
            <span />
            <span />
          </div>
          <section>
            <article>
              <i />
              <b>Produto</b>
              <small>R$ 00,00</small>
            </article>
            <article>
              <i />
              <b>Produto</b>
              <small>R$ 00,00</small>
            </article>
          </section>
        </div>
      </section>
    </aside>
  );
}
function actionForOrder(order: Order) {
  const isPickup = order.fulfillment === "PICKUP" || order.fulfillment === "PICKUP_BY_APP";
  if (order.status === "READY" && isPickup)
    return { to: "READY_FOR_PICKUP" as OrderStatus, label: "Liberar retirada" };
  if (order.status === "READY" && !isPickup)
    return { to: "OUT_FOR_DELIVERY" as OrderStatus, label: "Saiu p/ entrega" };
  if (order.status === "OUT_FOR_DELIVERY")
    return { to: "COMPLETED" as OrderStatus, label: "Concluir" };
  return nextAction[order.status];
}
function tabTitle(tab: Tab) {
  return {
    overview: "Visão geral",
    orders: "Pedidos",
    deliveries: "Entregas",
    products: "Produtos",
    store: "Minha loja",
  }[tab];
}
function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}
function formatDistance(meters: number) {
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}
function routeSourceLabel(source?: string) {
  return source === "google-routes-v2"
    ? "rota real pelo Google"
    : source === "postal-prefix-fallback"
      ? "estimativa por CEP (Google indisponível)"
      : "estimativa por CEP";
}
function message(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : "Não foi possível concluir a operação.";
}
function formatAddress(address: Record<string, string>) {
  return (
    [address.street, address.number, address.district]
      .filter(Boolean)
      .join(", ") || "Endereço não informado"
  );
}
function formatFullAddress(address: Record<string, string>) {
  return (
    [
      address.street,
      address.number,
      address.complement,
      address.district,
      address.city,
      address.state,
      address.postal_code,
    ]
      .filter(Boolean)
      .join(", ") || "Endereço não informado"
  );
}
function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value.slice(0, 16)
    : date.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}
function formatFullDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}
function formatNoticeTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Agora"
    : date.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}
function toCents(value: FormDataEntryValue | null) {
  return Math.round(Number(value ?? 0) * 100);
}
function toMeters(value: FormDataEntryValue | null) {
  return Math.round(Number(value ?? 0) * 1000);
}
function addressLabel(key: keyof Address) {
  return {
    street: "Rua",
    number: "Número",
    complement: "Complemento",
    district: "Bairro",
    city: "Cidade",
    state: "UF",
    postal_code: "CEP",
    reference: "Referência",
  }[key];
}
function initials(value: string) {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "LJ"
  );
}
function storeFont(value: StorefrontConfig["font_family"]) {
  return value === "MODERN"
    ? "Inter, Arial, sans-serif"
    : value === "ROUNDED"
      ? '"Trebuchet MS", Arial, sans-serif'
      : "Georgia, serif";
}
async function resizeImage(file: File, maxWidth: number, maxHeight: number) {
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () =>
        reject(new Error("Não foi possível processar esta imagem."));
      element.src = source;
    });
    const scale = Math.min(
      1,
      maxWidth / image.naturalWidth,
      maxHeight / image.naturalHeight,
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a imagem.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/webp", 0.82);
    if (result.length > 700000)
      throw new Error(
        "A imagem ainda ficou muito grande. Escolha um arquivo menor.",
      );
    return result;
  } finally {
    URL.revokeObjectURL(source);
  }
}
