import { DataSourceOptions } from 'typeorm';

export function resolvePostgresSsl():
  | false
  | {
      rejectUnauthorized: boolean;
    } {
  if (process.env.DATABASE_SSL === 'false') {
    return false;
  }

  return { rejectUnauthorized: false };
}

export function withPostgresSsl<T extends DataSourceOptions>(options: T): T {
  return {
    ...options,
    ssl: resolvePostgresSsl(),
  };
}
