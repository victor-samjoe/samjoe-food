'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import styles from './master.module.css';

type Product = { name: string; status: string; url: string | null };
type Integration = {
  name: string;
  parent_system_code: string;
  status: string;
  last_checked_at: string | null;
};

type Client = {
  id: string;
  slug: string;
  trade_name: string;
  legal_name: string | null;
  status: string;
  food_tenant_id: string | null;
  food_url: string | null;
  food_status: string | null;
  sales_status: string | null;
  sales_url: string | null;
  stores_count: number;
  owner_email: string | null;
  primary_domain: string | null;
  domain_status: string | null;
  monthly_amount_cents: number;
  products: Record<string, Product>;
  integrations: Record<string, Integration>;
};

type Overview = {
  user: { id: string; email: string; display_name: string; role: 'OWNER' };
  summary: {
    clients: number;
    active_clients: number;
    active_food: number;
    active_sales: number;
    active_sites: number;
    active_legal: number;
    connected_whatsapp: number;
    monthly_revenue_cents: number;
  };
  clients: Client[];
};

async function controlApi<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/backend/control/${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? `Erro HTTP ${response.status}`);
  return body as T;
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
}

function StatusPill({ status }: { status: string | null }) {
  const normalized = status ?? 'NÃO CONTRATADO';
  const active = normalized === 'ACTIVE';
  const available = normalized === 'AVAILABLE';
  return <span className={`${styles.pill} ${active ? styles.active : available ? styles.available : styles.neutral}`}>{normalized}</span>;
}

function MatrixStatusPill({ status }: { status: string | null }) {
  const normalized = status ?? 'NOT_CONTRACTED';
  const labels: Record<string, string> = {
    ACTIVE: 'ATIVO', AVAILABLE: 'DISPONÍVEL', PROVISIONING: 'CONFIGURANDO',
    SUSPENDED: 'SUSPENSO', ERROR: 'ERRO', DEGRADED: 'INSTÁVEL',
    NOT_CONFIGURED: 'NÃO CONFIGURADO', CONNECTING: 'CONECTANDO',
    CONNECTED: 'CONECTADO', DISCONNECTED: 'DESCONECTADO',
    NOT_CONTRACTED: 'NÃO CONTRATADO', ONBOARDING: 'EM CADASTRO',
  };
  const positive = normalized === 'ACTIVE' || normalized === 'CONNECTED';
  const available = normalized === 'AVAILABLE';
  const danger = ['ERROR', 'DISCONNECTED', 'DEGRADED'].includes(normalized);
  return <span className={`${styles.pill} ${positive ? styles.active : available ? styles.available : danger ? styles.danger : styles.neutral}`}>
    {labels[normalized] ?? normalized}
  </span>;
}

function ProductCell({ product, shortName }: { product: Product | undefined; shortName: string }) {
  return <div className={styles.productCell}>
    <strong>{shortName}</strong>
    <MatrixStatusPill status={product?.status ?? null} />
    {product?.url && <a href={product.url} target="_blank" rel="noreferrer">Abrir</a>}
  </div>;
}

export default function MasterPage() {
  const [email, setEmail] = useState('victor.conceicao@samjoe.com.br');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (accessToken: string) => {
    try {
      const result = await controlApi<Overview>('overview', accessToken);
      setOverview(result);
    } catch (cause) {
      window.sessionStorage.removeItem('samjoe-control-token');
      setToken('');
      setOverview(null);
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o painel.');
    }
  }, []);

  useEffect(() => {
    const saved = window.sessionStorage.getItem('samjoe-control-token');
    if (saved) {
      setToken(saved);
      void load(saved);
    }
  }, [load]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await controlApi<{ access_token: string }>('auth/login', '', {
        method: 'POST', body: JSON.stringify({ email, password }),
      });
      window.sessionStorage.setItem('samjoe-control-token', result.access_token);
      setToken(result.access_token);
      setPassword('');
      await load(result.access_token);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha no acesso.');
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    window.sessionStorage.removeItem('samjoe-control-token');
    setToken('');
    setOverview(null);
  }

  if (!token || !overview) {
    return <main className={styles.loginShell}>
      <section className={styles.loginBrand}>
        <span className={styles.brandMark}>SJ</span>
        <p>SamJoE Tech &amp; Consulting</p>
        <h1>Control Center</h1>
        <p className={styles.loginLead}>Clientes, produtos e operação em uma visão reservada à administração da plataforma.</p>
      </section>
      <form className={styles.loginCard} onSubmit={login}>
        <div><span className={styles.eyebrow}>Acesso proprietário</span><h2>Entrar no painel master</h2></div>
        {error && <p className={styles.error}>{error}</p>}
        <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} required autoFocus /></label>
        <button disabled={busy}>{busy ? 'Verificando…' : 'Acessar Control Center'}</button>
        <small>Área independente do painel operacional das lojas.</small>
      </form>
    </main>;
  }

  return <main className={styles.shell}>
    <aside className={styles.sidebar}>
      <div className={styles.logo}><span>SJ</span><div><strong>SamJoE</strong><small>Control Center</small></div></div>
      <nav><a className={styles.navActive} href="#visao">Visão geral</a><a href="#clientes">Clientes</a><a href="#produtos">Produtos</a><a href="#financeiro">Financeiro</a><a href="#infra">Infraestrutura</a></nav>
      <div className={styles.owner}><span>{overview.user.display_name.slice(0, 1).toUpperCase()}</span><div><strong>{overview.user.display_name}</strong><small>Proprietário</small></div></div>
    </aside>

    <section className={styles.content}>
      <header className={styles.topbar}><div><span className={styles.eyebrow}>Operação da plataforma</span><h1>Bom trabalho, {overview.user.display_name.split(' ')[0]}.</h1><p>Acompanhe clientes e sistemas da SamJoE em um só lugar.</p></div><button className={styles.logout} onClick={logout}>Sair</button></header>

      <section id="visao" className={styles.metrics}>
        <article><span>Clientes</span><strong>{overview.summary.clients}</strong><small>{overview.summary.active_clients} ativos</small></article>
        <article><span>SamJoE Food</span><strong>{overview.summary.active_food}</strong><small>operações ativas</small></article>
        <article><span>Sales Engine</span><strong>{overview.summary.active_sales}</strong><small>ativações concluídas</small></article>
        <article><span>Receita mensal</span><strong>{money(overview.summary.monthly_revenue_cents)}</strong><small>cadastro financeiro inicial</small></article>
      </section>

      <section id="clientes" className={styles.section}>
        <div className={styles.sectionHead}><div><span className={styles.eyebrow}>Carteira</span><h2>Clientes e produtos</h2></div><button disabled title="Disponível na próxima etapa">+ Novo cliente</button></div>
        <div className={styles.clientGrid}>
          <div id="produtos" className={styles.tableWrap}>
            <table className={styles.productTable}>
              <thead><tr><th>Cliente</th><th>SamJoE Food</th><th>Sales Engine</th><th>Site</th><th>SamJoE Jurídico</th><th>WhatsApp <small>Sales Engine</small></th><th>Mensalidade</th><th>Ações</th></tr></thead>
              <tbody>{overview.clients.map((client) => <tr key={client.id}>
                <td><div className={styles.clientIdentity}><span>{client.trade_name.slice(0, 2).toUpperCase()}</span><div><strong>{client.trade_name}</strong><small>{client.owner_email ?? client.slug}</small><MatrixStatusPill status={client.status} /></div></div></td>
                <td><ProductCell shortName="Food" product={client.products.food_app} /></td>
                <td><ProductCell shortName="Sales" product={client.products.sales_engine} /></td>
                <td><ProductCell shortName="Site" product={client.products.site} /></td>
                <td><ProductCell shortName="Jurídico" product={client.products.legal} /></td>
                <td><div className={styles.productCell}><strong>WhatsApp</strong><MatrixStatusPill status={client.integrations.whatsapp?.status ?? null} /><small>{client.integrations.whatsapp?.last_checked_at ? 'Verificado recentemente' : 'Sem conexão verificada'}</small></div></td>
                <td className={styles.moneyCell}>{money(client.monthly_amount_cents)}</td>
                <td><div className={styles.rowActions}>{client.products.food_app?.url && <a href={client.products.food_app.url} target="_blank" rel="noreferrer">Loja</a>}<a href="/admin" target="_blank">Admin</a></div></td>
              </tr>)}</tbody>
            </table>
          </div>
          {overview.clients.map((client) => <article className={styles.clientCard} key={client.id}>
            <div className={styles.clientTitle}><div className={styles.clientAvatar}>{client.trade_name.slice(0, 2).toUpperCase()}</div><div><h3>{client.trade_name}</h3><p>{client.owner_email ?? 'Responsável ainda não ativado'}</p></div><StatusPill status={client.status} /></div>
            <div className={styles.clientFacts}><span><small>Identificador</small>{client.slug}</span><span><small>Lojas</small>{client.stores_count}</span><span><small>Mensalidade</small>{money(client.monthly_amount_cents)}</span></div>
            <div id="produtos" className={styles.products}>
              <div><span className={styles.productIcon}>F</span><div><strong>SamJoE Food</strong><small>{client.food_url ? 'Loja publicada' : 'Provisionamento pendente'}</small></div><StatusPill status={client.food_status} /></div>
              <div><span className={`${styles.productIcon} ${styles.salesIcon}`}>S</span><div><strong>Sales Engine</strong><small>{client.sales_status === 'ACTIVE' ? 'Integração ativa' : 'Pronto para contratação'}</small></div><StatusPill status={client.sales_status} /></div>
            </div>
            <div className={styles.domain}><span>Domínio</span><strong>{client.primary_domain ?? 'Link técnico SamJoE'}</strong><StatusPill status={client.domain_status ?? 'TÉCNICO'} /></div>
            <div className={styles.actions}>
              {client.food_url && <a href={client.food_url} target="_blank" rel="noreferrer">Abrir loja</a>}
              <a href="/admin" target="_blank">Admin da loja</a>
              <button disabled={client.sales_status !== 'ACTIVE'} title="Será liberado após a publicação do Sales Engine correto">{client.sales_status === 'ACTIVE' ? 'Abrir Sales Engine' : 'Ativar Sales Engine'}</button>
            </div>
          </article>)}
        </div>
      </section>

      <section id="financeiro" className={styles.bottomGrid}>
        <article><span className={styles.eyebrow}>Financeiro</span><h2>Faturamento centralizado</h2><p>Planos, mensalidades e situação de cobrança já fazem parte do modelo. Emissão e conciliação entram na próxima etapa.</p><div className={styles.progress}><span /></div><small>Estrutura de dados pronta para evolução</small></article>
        <article id="infra"><span className={styles.eyebrow}>Infraestrutura</span><h2>Serviços monitorados</h2><ul><li><span className={styles.dot} />Food Worker online</li><li><span className={styles.dot} />Supabase conectado</li><li><span className={`${styles.dot} ${styles.warn}`} />Sales Engine aguardando publicação correta</li></ul></article>
      </section>
    </section>
  </main>;
}
