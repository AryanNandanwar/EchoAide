import { closeE2eApp, createE2eApp } from './create-e2e-app';
import { seedE2eUsers } from './seed';

async function main() {
  const port = Number(process.env.E2E_BACKEND_PORT ?? 3099);
  const context = await createE2eApp({ port });
  await seedE2eUsers(context.dataSource);

  console.log(`[e2e-server] listening on ${context.baseUrl}`);
  console.log(`[e2e-server] health: ${context.baseUrl}/api/e2e/health`);
  console.log('[e2e-server] seeded doctor and receptionist accounts');

  const shutdown = async (signal: string) => {
    console.log(`[e2e-server] received ${signal}, shutting down`);
    await closeE2eApp(context);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[e2e-server] failed to start', error);
  process.exit(1);
});
