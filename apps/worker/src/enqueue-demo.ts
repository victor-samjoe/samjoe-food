import { Queue } from 'bullmq';
import { redisConnection } from './redis.js';

const queue = new Queue('foodapp-simulation', { connection: redisConnection() });
const job = await queue.add('simulation.ping', {
  tenant_id: '10000000-0000-4000-8000-000000000010',
}, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1_000 },
  removeOnComplete: 100,
  removeOnFail: 100,
});
process.stdout.write(JSON.stringify({ queued: true, job_id: job.id, job_name: job.name }) + '\n');
await queue.close();

