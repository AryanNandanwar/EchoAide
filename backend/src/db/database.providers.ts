import { DataSource } from 'typeorm';
import { DataSourceOptions } from 'typeorm';
import * as dns from 'dns';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config(); // load .env manually if not already done

export const databaseProviders = [
  {
    provide: 'POSTGRES_DATA_SOURCE',
    useFactory: async () => {
      if (!process.env.SUPABASE_DB_URL) {
        throw new Error('SUPABASE_DB_URL is missing in .env');
      }

      const options: DataSourceOptions = {
        type: 'postgres',
        url: process.env.SUPABASE_DB_URL,
        ssl: {
          rejectUnauthorized: false, // Supabase requires SSL
        },
        entities: [path.join(__dirname, '/../**/*.entity{.ts,.js}')],
        migrations: [path.join(__dirname, '../../migrations/*{.ts,.js}')],

        // Never auto-sync schema in production — use migrations!
        synchronize: process.env.NODE_ENV === 'development',
        logging: process.env.NODE_ENV !== 'production',
      };

      // #region agent log
      const _agentParsedHost = (() => {
        try {
          const normalized = (process.env.SUPABASE_DB_URL || '').replace(/^postgres(ql)?:/i, 'https:');
          return new URL(normalized).hostname;
        } catch {
          return 'invalid_url';
        }
      })();
      await fetch('http://127.0.0.1:7571/ingest/231ef9cf-d927-49db-82f0-f19e114f6243', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '6d6a72' },
        body: JSON.stringify({
          sessionId: '6d6a72',
          hypothesisId: 'H6',
          location: 'database.providers.ts:useFactory',
          message: 'before DataSource.initialize',
          data: {
            parsedHost: _agentParsedHost,
            node: process.version,
            env: process.env.NODE_ENV || 'undefined',
            dnsServers: dns.getServers(),
          },
          timestamp: Date.now(),
          runId: 'dns-env',
        }),
      }).catch(() => {});
      // #endregion

      const dataSource = new DataSource(options);
      try {
        return await dataSource.initialize();
      } catch (e: unknown) {
        // #region agent log
        const err = e as { code?: string; errno?: number; syscall?: string; message?: string };
        await fetch('http://127.0.0.1:7571/ingest/231ef9cf-d927-49db-82f0-f19e114f6243', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '6d6a72' },
          body: JSON.stringify({
            sessionId: '6d6a72',
            hypothesisId: 'H1',
            location: 'database.providers.ts:initialize.catch',
            message: 'DataSource.initialize failed',
            data: {
              parsedHost: _agentParsedHost,
              code: err.code,
              errno: err.errno,
              syscall: err.syscall,
              dnsServers: dns.getServers(),
            },
            timestamp: Date.now(),
            runId: 'dns-env',
          }),
        }).catch(() => {});
        // #endregion
        if (err.code === 'EAI_AGAIN') {
          throw new Error(
            'DNS could not resolve the database host (EAI_AGAIN). On WSL2, set a working nameserver in /etc/resolv.conf (e.g. 8.8.8.8), or set [network] generateResolvConf=false in /etc/wsl.conf and manage resolv.conf yourself, then run `wsl --shutdown` from Windows and reopen WSL.',
            { cause: e as Error },
          );
        }
        throw e;
      }
    },
  },
  
];
