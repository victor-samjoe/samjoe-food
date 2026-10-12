const baseUrl = process.env.CHECKOUT_TEST_BASE_URL ?? 'http://127.0.0.1:3104';
const storeUrl = `${baseUrl}/v1/public/stores/doce-horizonte-centro`;
const address = {
  street: 'Rua Teste', number: '10', district: 'Centro', city: 'Cidade Exemplo', state: 'SP', postal_code: '01000000',
};

async function jsonRequest(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  return { status: response.status, body };
}

const quote = await jsonRequest(`${storeUrl}/delivery-quotes`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address }),
});
if (quote.status !== 200 || quote.body.status !== 'AVAILABLE' || quote.body.fee.amount_cents !== 500) {
  throw new Error(`unexpected_quote:${JSON.stringify(quote)}`);
}

const order = {
  customer: { name: 'Cliente Concorrência', phone_e164: '+5511000000099', email: 'concorrencia@example.test' },
  fulfillment: 'DELIVERY', address, delivery_quote_id: quote.body.id,
  items: [{ variant_id: '10000000-0000-4000-8000-000000000015', quantity: 1 }],
  payment_method: 'CASH',
};
const send = (key) => jsonRequest(`${storeUrl}/orders`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(order),
});
const keys = ['checkout-concorrente-0001', 'checkout-concorrente-0002'];
const results = await Promise.all(keys.map(send));
const statuses = results.map((result) => result.status).sort((a, b) => a - b);
if (statuses.join(',') !== '201,409') throw new Error(`unexpected_concurrency:${JSON.stringify(results)}`);
const winnerIndex = results.findIndex((result) => result.status === 201);
const replay = await send(keys[winnerIndex]);
if (replay.status !== 200 || replay.body.id !== results[winnerIndex].body.id) {
  throw new Error(`idempotency_replay_failed:${JSON.stringify(replay)}`);
}
process.stdout.write(JSON.stringify({
  quote_status: quote.body.status,
  fee_cents: quote.body.fee.amount_cents,
  concurrent_statuses: statuses,
  order_id: replay.body.id,
  replay_status: replay.status,
  same_order: true,
}) + '\n');

