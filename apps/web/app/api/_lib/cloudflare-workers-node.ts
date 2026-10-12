// Next.js/Node fallback for the Cloudflare Workers virtual env module.
export const env = process.env;

// Stub classes — these are only used in the actual Worker runtime.
export class WorkerEntrypoint {}
export class DurableObject {}
export class WorkflowEntrypoint {}
