'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import styles from '../master.module.css';

type Product = {
  name: string;
  status: string;
  url: string | null;
  configuration: Record<string, unknown>;
  plan_code: string | null;
  billing_status: string | null;
  monthly_amount_cents: number;
};
type Client = {
  id: string; slug: string; trade_name: string; status: string;
  owner_email: string | null; primary_domain: string | null;
  monthly_amount_cents: number; active_users_count: number; products: Record<string, Product>;
  integrations: Record<string, { name: string; status: string; last_checked_at: string | null }>;
};
type Overview = {
  user: { display_name: string };
  summary: { clients: number; active_clients: number; monthly_revenue_cents: number };
  clients: Client[];
};
type FoodUser = {
  id: string; email: string; display_name: string; status: string; role: string;
  membership_status: string; must_change_password: boolean;
};
type Section = 'clients' | 'products' | 'finance' | 'infra';

const sections: Array<{ key: Section | 'overview'; label: string; href: string }> = [
  { key: 'overview', label: 'Visão geral', href: '/master' },
  { key: 'clients', label: 'Clientes', href: '/master/clientes' },
  { key: 'products', label: 'Produtos', href: '/master/produtos' },
  { key: 'finance', label: 'Financeiro', href: '/master/financeiro' },
  { key: 'infra', label: 'Infraestrutura', href: '/master/infraestrutura' },
];

async function api<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/backend/control/${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...options?.headers },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? `Erro HTTP ${response.status}`);
  return body as T;
}

function label(status: string | null | undefined) {
  const labels: Record<string, string> = {
    ACTIVE: 'Ativo', AVAILABLE: 'Disponível', PROVISIONING: 'Configurando',
    CONNECTED: 'Conectado', NOT_CONFIGURED: 'Não configurado', DISCONNECTED: 'Desconectado',
    ERROR: 'Erro', DEGRADED: 'Instável', SUSPENDED: 'Suspenso', TRIAL: 'Teste',
    PAST_DUE: 'Em atraso', PAUSED: 'Pausado', CANCELLED: 'Cancelado',
  };
  return status ? (labels[status] ?? status) : 'Não contratado';
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
}

export default function MasterSectionPage({ section }: { section: Section }) {
  const [token, setToken] = useState('');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Client | null>(null);
  const [users, setUsers] = useState<FoodUser[]>([]);
  const [accessBusy, setAccessBusy] = useState(false);
  const [credential, setCredential] = useState<{ email: string; password: string } | null>(null);

  const load = useCallback(async (accessToken: string) => {
    try {
      setOverview(await api<Overview>('overview', accessToken));
    } catch (cause) {
      sessionStorage.removeItem('samjoe-control-token');
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar o painel.');
    }
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem('samjoe-control-token') ?? '';
    setToken(saved);
    if (saved) void load(saved);
  }, [load]);

  async function openAccess(client: Client, preserveCredential = false) {
    setSelected(client);
    if (!preserveCredential) setCredential(null);
    setError('');
    if (!client.products.food_app) {
      setUsers([]);
      return;
    }
    setAccessBusy(true);
    try {
      const result = await api<{ users: FoodUser[] }>(`clients/${client.id}/users`, token);
      setUsers(result.users);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao consultar acessos.');
    } finally {
      setAccessBusy(false);
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setAccessBusy(true);
    setError('');
    try {
      const result = await api<{ user: FoodUser; temporary_password: string }>(`clients/${selected.id}/users`, token, {
        method: 'POST',
        body: JSON.stringify({
          display_name: data.get('display_name'), email: data.get('email'), role: data.get('role'),
        }),
      });
      setCredential({ email: result.user.email, password: result.temporary_password });
      await openAccess(selected, true);
      await load(token);
      form.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao criar acesso.');
    } finally {
      setAccessBusy(false);
    }
  }

  async function resetPassword(user: FoodUser) {
    if (!selected || !window.confirm(`Gerar nova senha temporária para ${user.email}? As sessões atuais serão encerradas.`)) return;
    setAccessBusy(true);
    setError('');
    try {
      const result = await api<{ temporary_password: string }>(`clients/${selected.id}/users/${user.id}/reset-password`, token, { method: 'POST' });
      setCredential({ email: user.email, password: result.temporary_password });
      await openAccess(selected, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao redefinir senha.');
    } finally {
      setAccessBusy(false);
    }
  }

  async function updateUser(user: FoodUser, changes: { role?: string; status?: string }) {
    if (!selected) return;
    const action = changes.status === 'DISABLED' ? 'desativar' : changes.status === 'ACTIVE' ? 'reativar' : 'alterar o perfil de';
    if (!window.confirm(`Confirma ${action} ${user.email}?`)) return;
    setAccessBusy(true);
    setError('');
    try {
      await api(`clients/${selected.id}/users/${user.id}`, token, {
        method: 'PATCH', body: JSON.stringify(changes),
      });
      await openAccess(selected, true);
      await load(token);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao atualizar usuário.');
    } finally {
      setAccessBusy(false);
    }
  }

  const productRows = useMemo(() => overview?.clients.flatMap((client) =>
    Object.entries(client.products).map(([code, product]) => ({ client, code, product }))) ?? [], [overview]);

  if (!token) return <main className={styles.sectionLogin}><h1>Sessão master necessária</h1><p>Entre primeiro no Control Center para acessar esta área.</p><a href="/master">Ir para o login</a></main>;
  if (!overview) return <main className={styles.sectionLogin}><h1>Carregando…</h1>{error && <p className={styles.error}>{error}</p>}</main>;

  const title = sections.find((item) => item.key === section)?.label ?? 'Control Center';
  return <main className={styles.shell}>
    <aside className={styles.sidebar}>
      <div className={styles.logo}><span>SJ</span><div><strong>SamJoE</strong><small>Control Center</small></div></div>
      <nav className={styles.sectionNav}>{sections.map((item) => <a key={item.key} className={item.key === section ? styles.navActive : ''} href={item.href}>{item.label}</a>)}</nav>
      <div className={styles.owner}><span>{overview.user.display_name.slice(0, 1)}</span><div><strong>{overview.user.display_name}</strong><small>Proprietário</small></div></div>
    </aside>
    <section className={styles.content}>
      <header className={styles.topbar}><div><span className={styles.eyebrow}>Control Center</span><h1>{title}</h1><p>Gestão central dos clientes e produtos SamJoE.</p></div><a className={styles.backLink} href="/master">Visão geral</a></header>
      {error && <p className={styles.error}>{error}</p>}

      {section === 'clients' && <section className={styles.sectionPanel}>
        <div className={styles.sectionHead}><div><h2>Clientes cadastrados</h2><p>{overview.summary.clients} empresas no ecossistema.</p></div></div>
        <div className={styles.managementTable}><table><thead><tr><th>Cliente</th><th>Status</th><th>Produtos</th><th>Usuários ativos</th><th>Contato</th><th>Acesso</th></tr></thead><tbody>
          {overview.clients.map((client) => <tr key={client.id}><td><strong>{client.trade_name}</strong><small>{client.slug}</small></td><td>{label(client.status)}</td><td>{Object.values(client.products).map((product) => product.name).join(', ') || 'Nenhum'}</td><td>{client.products.food_app ? client.active_users_count : '—'}</td><td>{client.owner_email ?? 'Não informado'}</td><td><button onClick={() => void openAccess(client)}>Gerenciar acessos</button></td></tr>)}
        </tbody></table></div>
      </section>}

      {section === 'products' && <section className={styles.sectionPanel}>
        <div className={styles.sectionHead}><div><h2>Produtos por cliente</h2><p>Contratação e disponibilidade em uma única lista.</p></div></div>
        <div className={styles.managementTable}><table><thead><tr><th>Cliente</th><th>Produto</th><th>Status</th><th>Hospedagem</th><th>Endereço</th></tr></thead><tbody>
          {productRows.map(({ client, code, product }) => <tr key={`${client.id}-${code}`}><td><strong>{client.trade_name}</strong></td><td>{product.name}</td><td>{label(product.status)}</td><td>{String(product.configuration.hosting_provider ?? 'Cloudflare')}</td><td>{product.url ? <a href={product.url} target="_blank" rel="noreferrer">Abrir</a> : '—'}</td></tr>)}
        </tbody></table></div>
      </section>}

      {section === 'finance' && <section className={styles.sectionPanel}>
        <div className={styles.sectionHead}><div><h2>Planos e faturamento</h2><p>Receita mensal cadastrada: {money(overview.summary.monthly_revenue_cents)}.</p></div></div>
        <div className={styles.managementTable}><table><thead><tr><th>Cliente</th><th>Produto</th><th>Plano</th><th>Cobrança</th><th>Mensalidade</th></tr></thead><tbody>
          {productRows.map(({ client, code, product }) => <tr key={`${client.id}-${code}`}><td><strong>{client.trade_name}</strong></td><td>{product.name}</td><td>{product.plan_code ?? 'Não definido'}</td><td>{label(product.billing_status)}</td><td>{money(product.monthly_amount_cents)}</td></tr>)}
        </tbody></table></div>
      </section>}

      {section === 'infra' && <section className={styles.sectionPanel}>
        <div className={styles.sectionHead}><div><h2>Publicações e conexões</h2><p>Visão operacional por cliente.</p></div></div>
        <div className={styles.managementTable}><table><thead><tr><th>Cliente</th><th>Componente</th><th>Provedor</th><th>Status</th><th>Destino</th></tr></thead><tbody>
          {overview.clients.flatMap((client) => [
            ...Object.entries(client.products).map(([code, product]) => <tr key={`${client.id}-${code}`}><td><strong>{client.trade_name}</strong></td><td>{product.name}</td><td>{String(product.configuration.hosting_provider ?? (code === 'food_app' ? 'Cloudflare' : '—'))}</td><td>{label(product.status)}</td><td>{product.url ? <a href={product.url} target="_blank" rel="noreferrer">Abrir</a> : '—'}</td></tr>),
            ...Object.entries(client.integrations).map(([code, integration]) => <tr key={`${client.id}-integration-${code}`}><td><strong>{client.trade_name}</strong></td><td>{integration.name}</td><td>Sales Engine</td><td>{label(integration.status)}</td><td>{integration.last_checked_at ?? 'Sem verificação'}</td></tr>),
          ])}
        </tbody></table></div>
      </section>}
    </section>

    {selected && <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => setSelected(null)}><section className={styles.accessModal} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><span className={styles.eyebrow}>Gestão de acesso</span><h2>{selected.trade_name}</h2></div><button onClick={() => setSelected(null)} aria-label="Fechar">×</button></header>
      {!selected.products.food_app ? <div className={styles.adapterNotice}><strong>Adaptador pendente</strong><p>A gestão centralizada de senhas para este produto será habilitada por API segura. Nenhuma credencial externa foi copiada para o Control Center.</p></div> : <>
        {credential && <div className={styles.credentialBox}><strong>Senha temporária — exibida uma vez</strong><span>{credential.email}</span><code>{credential.password}</code><button onClick={() => void navigator.clipboard.writeText(credential.password)}>Copiar senha</button></div>}
        <div className={styles.userList}><h3>Usuários do SamJoE Food</h3>{accessBusy && <p>Atualizando…</p>}{!accessBusy && users.length === 0 && <p>Nenhum usuário criado.</p>}{users.map((user) => <div key={user.id}><span><strong>{user.display_name}</strong><small>{user.email} · {label(user.membership_status)}{user.must_change_password ? ' · troca pendente' : ''}</small></span><div className={styles.userActions}><select value={user.role} disabled={accessBusy} onChange={(event) => void updateUser(user, { role: event.target.value })}><option>OWNER</option><option>ADMIN</option><option>OPERATOR</option><option>VIEWER</option></select><button disabled={accessBusy} onClick={() => void resetPassword(user)}>Redefinir senha</button><button disabled={accessBusy} onClick={() => void updateUser(user, { status: user.membership_status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' })}>{user.membership_status === 'ACTIVE' ? 'Desativar' : 'Reativar'}</button></div></div>)}</div>
        <form className={styles.accessForm} onSubmit={createUser}><h3>Novo acesso</h3><label>Nome<input name="display_name" required minLength={2} /></label><label>E-mail<input name="email" type="email" required /></label><label>Perfil<select name="role" defaultValue="ADMIN"><option>OWNER</option><option>ADMIN</option><option>OPERATOR</option><option>VIEWER</option></select></label><button disabled={accessBusy}>Criar com senha temporária</button></form>
      </>}
    </section></div>}
  </main>;
}
