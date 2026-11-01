import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export interface DatabaseConnectionInfo {
  isConfigured: boolean;
  connectionMode: 'connection_string' | 'discrete_parameters' | 'local_fallback';
  host?: string;
  database?: string;
  sslEnabled?: boolean;
}

export const getDatabaseConfig = (): {
  isConfigured: boolean;
  poolConfig: PoolConfig | null;
  info: DatabaseConnectionInfo;
} => {
  // Mode 1: Standard Supabase / PostgreSQL Connection String (DATABASE_URL)
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0) {
    const connStr = process.env.DATABASE_URL.trim();
    const isSupabaseOrCloud =
      connStr.includes('supabase') ||
      connStr.includes('sslmode=require') ||
      connStr.includes('pooler') ||
      process.env.NODE_ENV === 'production' ||
      process.env.SQL_SSL === 'true';

    return {
      isConfigured: true,
      poolConfig: {
        connectionString: connStr,
        ssl: isSupabaseOrCloud ? { rejectUnauthorized: false } : undefined,
        max: 10,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
      },
      info: {
        isConfigured: true,
        connectionMode: 'connection_string',
        host: connStr.split('@')[1]?.split(/[:/]/)[0] || 'remote-postgres',
        database: connStr.split('/').pop()?.split('?')[0] || 'postgres',
        sslEnabled: isSupabaseOrCloud,
      },
    };
  }

  // Mode 2: Discrete Environment Parameters
  const host = process.env.SQL_HOST || process.env.PGHOST;
  const user = process.env.SQL_USER || process.env.SQL_ADMIN_USER || process.env.PGUSER;
  const password = process.env.SQL_PASSWORD || process.env.SQL_ADMIN_PASSWORD || process.env.PGPASSWORD;
  const database =
    process.env.SQL_DATABASE ||
    process.env.SQL_DB_NAME ||
    process.env.PGDATABASE ||
    'postgres'; // Default Supabase database name is 'postgres'
  const port = parseInt(
    process.env.SQL_PORT ||
      process.env.PGPORT ||
      (host?.includes('pooler') ? '6543' : '5432'),
    10
  );

  if (host && user && password) {
    const isSupabaseOrCloud =
      host.includes('supabase') ||
      host.includes('pooler') ||
      process.env.NODE_ENV === 'production' ||
      process.env.SQL_SSL === 'true';

    return {
      isConfigured: true,
      poolConfig: {
        host,
        port,
        user,
        password,
        database,
        ssl: isSupabaseOrCloud ? { rejectUnauthorized: false } : undefined,
        max: 10,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
      },
      info: {
        isConfigured: true,
        connectionMode: 'discrete_parameters',
        host,
        database,
        sslEnabled: isSupabaseOrCloud,
      },
    };
  }

  return {
    isConfigured: false,
    poolConfig: null,
    info: {
      isConfigured: false,
      connectionMode: 'local_fallback',
    },
  };
};

const config = getDatabaseConfig();
export const isDatabaseConfigured = config.isConfigured;
export const databaseConnectionInfo = config.info;

export const createPool = (): Pool | null => {
  if (!config.isConfigured || !config.poolConfig) {
    console.log('[UrbanShield DB] Running with local persistent disk store fallback (.data/urbanshield-store.json)');
    return null;
  }

  if (!global._postgresPool) {
    try {
      console.log(
        `[UrbanShield DB] Connecting to PostgreSQL (${config.info.connectionMode}) host: ${config.info.host}, db: ${config.info.database}, ssl: ${Boolean(config.info.sslEnabled)}`
      );
      global._postgresPool = new Pool(config.poolConfig);

      global._postgresPool.on('error', (err) => {
        console.warn('[UrbanShield DB] Unexpected error on idle SQL pool client:', err?.message || err);
      });
    } catch (err: any) {
      console.warn('[UrbanShield DB] Postgres pool initialization skipped:', err?.message || err);
      return null;
    }
  }
  return global._postgresPool;
};

const pool = createPool();

export const db: NodePgDatabase<typeof schema> | null = pool
  ? drizzle(pool, { schema })
  : null;


