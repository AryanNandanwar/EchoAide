import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { withPostgresSsl } from './src/config/database-ssl';

dotenv.config();

export const AppDataSource = new DataSource(
  withPostgresSsl({
    type: 'postgres',
    url: process.env.SUPABASE_DB_URL,
    entities: ['src/**/*.entity{.ts,.js}'],
    migrations: ['src/migrations/*{.ts,.js}'],
    synchronize: false,
    logging: true,
  }),
);
