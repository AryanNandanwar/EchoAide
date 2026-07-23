import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { withPostgresSsl } from '../../src/config/database-ssl';

const baselineSqlPath = path.join(
  __dirname,
  'fixtures/pre-migration-baseline.sql',
);

function getSmokeDbUrl(): string {
  return (
    process.env.SMOKE_DB_URL ||
    process.env.SUPABASE_DB_URL ||
    'postgres://smoke:smoke@127.0.0.1:5433/echoaide_smoke'
  );
}

async function canConnect(dbUrl: string): Promise<boolean> {
  const client = new Client({
    connectionString: dbUrl,
    connectionTimeoutMillis: 3_000,
  });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

async function resetDatabase(dbUrl: string): Promise<void> {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
    const baselineSql = fs.readFileSync(baselineSqlPath, 'utf8');
    await client.query(baselineSql);
  } finally {
    await client.end();
  }
}

async function columnExists(
  dbUrl: string,
  table: string,
  column: string,
): Promise<boolean> {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const result = await client.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
      `,
      [table, column],
    );
    return result.rowCount === 1;
  } finally {
    await client.end();
  }
}

async function tableExists(dbUrl: string, table: string): Promise<boolean> {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const result = await client.query(
      `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      `,
      [table],
    );
    return result.rowCount === 1;
  } finally {
    await client.end();
  }
}

describe('Infrastructure smoke: TypeORM migrations on empty baseline DB', () => {
  const dbUrl = getSmokeDbUrl();
  let postgresReady = false;

  beforeAll(async () => {
    if (process.env.SKIP_MIGRATION_SMOKE === '1') {
      return;
    }
    postgresReady = await canConnect(dbUrl);
  }, 10_000);

  it('applies migrations and creates expected schema objects', async () => {
    if (process.env.SKIP_MIGRATION_SMOKE === '1') {
      return;
    }
    if (!postgresReady) {
      if (process.env.REQUIRE_MIGRATION_SMOKE === '1') {
        throw new Error(
          `Postgres not reachable at ${dbUrl}. Start docker-compose.smoke postgres or set SMOKE_DB_URL.`,
        );
      }
      console.warn(
        `Skipping migration smoke: Postgres not reachable at ${dbUrl}. ` +
          'Start docker-compose.smoke postgres or set SMOKE_DB_URL.',
      );
      return;
    }

    await resetDatabase(dbUrl);

    execSync('npm run migration:run', {
      cwd: path.join(__dirname, '../..'),
      env: {
        ...process.env,
        SUPABASE_DB_URL: dbUrl,
        DATABASE_SSL: 'false',
      },
      stdio: 'pipe',
    });

    expect(await columnExists(dbUrl, 'patients', 'weight')).toBe(true);
    expect(await tableExists(dbUrl, 'refresh_tokens')).toBe(true);

    const dataSource = new DataSource(
      withPostgresSsl({
        type: 'postgres',
        url: dbUrl,
        entities: [],
        synchronize: false,
      }),
    );
    await dataSource.initialize();
    try {
      const refreshTokenColumns = await dataSource.query(`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'refresh_tokens'
          ORDER BY column_name
        `);
      const columnNames = refreshTokenColumns.map(
        (row: { column_name: string }) => row.column_name,
      );
      expect(columnNames).toEqual(
        expect.arrayContaining([
          'created_at',
          'expires_at',
          'id',
          'revoked_at',
          'role',
          'token_hash',
          'user_id',
        ]),
      );
    } finally {
      await dataSource.destroy();
    }
  }, 120_000);
});
