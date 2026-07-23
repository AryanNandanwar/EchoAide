import { DataSource } from 'typeorm';
import { DataSourceOptions } from 'typeorm';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { withPostgresSsl } from '../config/database-ssl';

dotenv.config(); // load .env manually if not already done

export const databaseProviders = [
  {
    provide: 'POSTGRES_DATA_SOURCE',
    useFactory: async () => {
      if (!process.env.SUPABASE_DB_URL) {
        throw new Error('SUPABASE_DB_URL is missing in .env');
      }

      const options: DataSourceOptions = withPostgresSsl({
        type: 'postgres',
        url: process.env.SUPABASE_DB_URL,
        entities: [path.join(__dirname, '/../**/*.entity{.ts,.js}')],
        migrations: [path.join(__dirname, '../migrations/*{.ts,.js}')],

        // Never auto-sync schema in production — use migrations!
        synchronize: process.env.NODE_ENV === 'development',
        logging: process.env.NODE_ENV !== 'production',
      });

      const dataSource = new DataSource(options);
      try {
        return await dataSource.initialize();
      } catch (e: unknown) {
        const err = e as { code?: string };
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
