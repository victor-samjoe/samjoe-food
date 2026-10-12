import assert from 'node:assert/strict';
import test from 'node:test';
import type { QueryResultRow } from 'pg';
import { injectApiRequest, type ApiDatabaseClient } from '../src/worker-native.js';

test('adaptador serverless conecta, injeta a requisição e encerra a conexão', async () => {
  const lifecycle: string[] = [];
  const client: ApiDatabaseClient = {
    async connect() { lifecycle.push('connect'); },
    async end() { lifecycle.push('end'); },
    async query<T extends QueryResultRow>(_sql: string, values?: unknown[]) {
      lifecycle.push('query');
      const rows = values ? [] : [{ '?column?': 1 }];
      return { rows: rows as unknown as T[] };
    },
  };

  const response = await injectApiRequest({
    connectionString: 'postgresql://test.invalid/database',
    path: '/ready',
    request: new Request('https://food.test/ready'),
    clientFactory: () => client,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: 'ready',
    service: 'foodapp-api',
    database: 'ready',
    external_integrations: 'disabled',
  });
  assert.deepEqual(lifecycle, ['connect', 'query', 'end']);
});
