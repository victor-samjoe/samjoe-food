export function externalIntegrationsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.EXTERNAL_INTEGRATIONS_ENABLED === 'true';
}

