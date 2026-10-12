import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { buildProvisioningInput } from './tenant-provisioning.js';
import {
  parseArguments,
  provisionTenantInTransaction,
  publicResult,
} from './provision-tenant.js';

type Snapshot = {
  generated_at: string;
  tenant: Record<string, unknown>;
  tenant_tables: Record<string, Record<string, unknown>[]>;
  related_users: Record<string, unknown>[];
};

function safeIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error(`Identificador SQL inesperado: ${value}`);
  return `"${value}"`;
}

function deletionOrder(tables: string[], dependencies: Array<{ child: string; parent: string }>): string[] {
  const tableSet = new Set(tables);
  const edges = new Map<string, Set<string>>(tables.map((table) => [table, new Set()]));
  const incoming = new Map<string, number>(tables.map((table) => [table, 0]));
  for (const { child, parent } of dependencies) {
    if (child === parent || !tableSet.has(child) || !tableSet.has(parent)) continue;
    const parents = edges.get(child)!;
    if (parents.has(parent)) continue;
    parents.add(parent);
    incoming.set(parent, incoming.get(parent)! + 1);
  }
  const ready = tables.filter((table) => incoming.get(table) === 0).sort();
  const ordered: string[] = [];
  while (ready.length > 0) {
    const table = ready.shift()!;
    ordered.push(table);
    for (const parent of edges.get(table)!) {
      const next = incoming.get(parent)! - 1;
      incoming.set(parent, next);
      if (next === 0) ready.push(parent);
    }
    ready.sort();
  }
  if (ordered.length !== tables.length) {
    const cycle = tables.filter((table) => !ordered.includes(table));
    throw new Error(`Não foi possível ordenar as tabelas para exclusão: ${cycle.join(', ')}`);
  }
  return ordered;
}

async function smokeTest(url: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: 'follow' });
    const body = await response.text();
    const normalizedBody = body.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return {
      ok: response.ok && !normalizedBody.includes('loja nao encontrada'),
      status: response.status,
      final_url: response.url,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function main() {
  const { values, apply } = parseArguments(process.argv.slice(2));
  const input = buildProvisioningInput(values);
  const confirmedSlug = values['confirm-delete'];
  const explicitTenantSlug = values['tenant-slug'];
  const baseUrl = (values['base-url'] ?? 'https://samjoe-food-web.victor-conceicao.workers.dev').replace(/\/$/, '');

  if (!explicitTenantSlug) throw new Error('--tenant-slug deve ser informado explicitamente no reset.');
  if (confirmedSlug !== input.tenantSlug) {
    throw new Error(`Confirme o alvo com --confirm-delete ${input.tenantSlug}.`);
  }

  const summary = publicResult(input);
  if (!apply) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      operation: 'backup-delete-recreate-smoke-test',
      confirmed_target: confirmedSlug,
      ...summary,
    }, null, 2));
    console.log('\nNenhuma alteração foi aplicada. Revise e repita com --apply.');
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL é obrigatória para usar --apply.');
  const pool = new pg.Pool({ connectionString, max: 1, idleTimeoutMillis: 10_000 });
  const client = await pool.connect();
  let backupPath = '';
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('tenant:' || $1, 0))",
      [input.tenantSlug],
    );
    const tenantResult = await client.query<Record<string, unknown>>(
      'SELECT * FROM tenants WHERE slug = $1 FOR UPDATE',
      [input.tenantSlug],
    );
    const tenant = tenantResult.rows[0];
    if (!tenant || typeof tenant.id !== 'string') {
      throw new Error(`Tenant '${input.tenantSlug}' não encontrado; use tenant:create para a primeira criação.`);
    }

    const tableResult = await client.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'tenant_id'
      ORDER BY table_name
    `);
    const tables = tableResult.rows.map((row) => row.table_name);
    const dependenciesResult = await client.query<{ child: string; parent: string }>(`
      SELECT DISTINCT child.relname AS child, parent.relname AS parent
      FROM pg_constraint constraint_row
      JOIN pg_class child ON child.oid = constraint_row.conrelid
      JOIN pg_namespace child_schema ON child_schema.oid = child.relnamespace
      JOIN pg_class parent ON parent.oid = constraint_row.confrelid
      JOIN pg_namespace parent_schema ON parent_schema.oid = parent.relnamespace
      WHERE constraint_row.contype = 'f'
        AND child_schema.nspname = 'public'
        AND parent_schema.nspname = 'public'
    `);
    const order = deletionOrder(tables, dependenciesResult.rows);

    const tenantTables: Snapshot['tenant_tables'] = {};
    for (const table of tables) {
      const rows = await client.query<Record<string, unknown>>(
        `SELECT * FROM public.${safeIdentifier(table)} WHERE tenant_id = $1`,
        [tenant.id],
      );
      tenantTables[table] = rows.rows;
    }
    const relatedUserIds = new Set<string>();
    for (const row of tenantTables.tenant_memberships ?? []) {
      if (typeof row.user_id === 'string') relatedUserIds.add(row.user_id);
    }
    for (const row of tenantTables.tenant_onboarding_profiles ?? []) {
      if (typeof row.owner_user_id === 'string') relatedUserIds.add(row.owner_user_id);
    }
    const relatedUsers = relatedUserIds.size > 0
      ? (await client.query<Record<string, unknown>>(
        'SELECT * FROM users WHERE id = ANY($1::uuid[]) ORDER BY id',
        [[...relatedUserIds]],
      )).rows
      : [];
    const snapshot: Snapshot = {
      generated_at: new Date().toISOString(),
      tenant,
      tenant_tables: tenantTables,
      related_users: relatedUsers,
    };
    const backupDirectory = path.resolve(process.cwd(), '.runlogs', 'tenant-backups');
    await mkdir(backupDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    backupPath = path.join(backupDirectory, `${timestamp}-${input.tenantSlug}.json`);
    await writeFile(backupPath, `${JSON.stringify(snapshot, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });

    for (const table of order) {
      await client.query(`DELETE FROM public.${safeIdentifier(table)} WHERE tenant_id = $1`, [tenant.id]);
    }
    await client.query('DELETE FROM tenants WHERE id = $1', [tenant.id]);
    if (relatedUserIds.size > 0) {
      await client.query(`
        DELETE FROM users candidate
        WHERE candidate.id = ANY($1::uuid[])
          AND NOT EXISTS (SELECT 1 FROM tenant_memberships membership WHERE membership.user_id = candidate.id)
      `, [[...relatedUserIds]]);
    }

    const result = await provisionTenantInTransaction(client, input);
    await client.query('COMMIT');

    const storefrontUrl = `${baseUrl}/loja/${input.storeSlug}`;
    const smoke = await smokeTest(storefrontUrl);
    console.log(JSON.stringify({
      mode: 'applied',
      operation: 'backup-delete-recreate-smoke-test',
      backup: backupPath,
      ...summary,
      ids: { tenant: result.tenant.id, store: result.store.id, owner: result.user.id },
      credentials: result.temporaryPassword
        ? { temporary_password: result.temporaryPassword, must_change_password: true }
        : { temporary_password: null, note: 'Usuário existente: a senha não foi alterada.' },
      smoke_test: { url: storefrontUrl, ...smoke },
    }, null, 2));
    if (!smoke.ok) process.exitCode = 2;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (backupPath) process.stderr.write(`Backup preservado em: ${backupPath}\n`);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode ||= 1;
});
