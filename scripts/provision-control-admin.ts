import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

function argument(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const email = argument('email')?.trim().toLowerCase();
  const displayName = argument('display-name')?.trim();
  const rotate = process.argv.includes('--rotate');
  const connectionString = process.env.DATABASE_URL;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('--email inválido.');
  if (!displayName) throw new Error('--display-name é obrigatório.');
  if (!connectionString) throw new Error('DATABASE_URL é obrigatória.');

  const password = `Sj!${randomBytes(24).toString('base64url')}8z`;
  const pool = new pg.Pool({ connectionString, max: 1, idleTimeoutMillis: 10_000 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM control_plane.admin_users WHERE lower(email) = lower($1) FOR UPDATE', [email],
    );
    if (existing.rows[0] && !rotate) {
      throw new Error('Administrador já existe. Use --rotate somente para gerar uma nova senha.');
    }
    const result = existing.rows[0]
      ? await client.query<{ id: string }>(`
          UPDATE control_plane.admin_users
          SET display_name = $2, password_hash = crypt($3, gen_salt('bf', 12)),
            must_change_password = true, status = 'ACTIVE', updated_at = now()
          WHERE id = $1 RETURNING id
        `, [existing.rows[0].id, displayName, password])
      : await client.query<{ id: string }>(`
          INSERT INTO control_plane.admin_users (email, display_name, password_hash)
          VALUES ($1, $2, crypt($3, gen_salt('bf', 12))) RETURNING id
        `, [email, displayName, password]);
    if (existing.rows[0]) {
      await client.query('UPDATE control_plane.admin_sessions SET revoked_at = now() WHERE admin_user_id = $1 AND revoked_at IS NULL', [existing.rows[0].id]);
    }
    await client.query('COMMIT');

    const directory = path.resolve(process.cwd(), '.runlogs', 'control-center');
    await mkdir(directory, { recursive: true });
    const credentialPath = path.join(directory, 'owner-credentials.txt');
    await writeFile(credentialPath, [
      'SamJoE Control Center',
      `URL: https://samjoe-food-web.victor-conceicao.workers.dev/master`,
      `E-mail: ${email}`,
      `Senha temporária: ${password}`,
      'Troque esta senha quando o fluxo de alteração estiver disponível.',
      '',
    ].join('\n'), { encoding: 'utf8', mode: 0o600 });
    console.log(JSON.stringify({ admin_user_id: result.rows[0]!.id, email, credentials_file: credentialPath }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
