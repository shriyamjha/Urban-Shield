import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL?.trim();
const sqlHost = process.env.SQL_HOST || process.env.PGHOST;
const sqlUser = process.env.SQL_USER || process.env.SQL_ADMIN_USER || process.env.PGUSER;
const sqlPassword = process.env.SQL_PASSWORD || process.env.SQL_ADMIN_PASSWORD || process.env.PGPASSWORD;
const sqlDatabase = process.env.SQL_DATABASE || process.env.SQL_DB_NAME || process.env.PGDATABASE || 'postgres';
const sqlPort = parseInt(
  process.env.SQL_PORT ||
    process.env.PGPORT ||
    (sqlHost?.includes('pooler') ? '6543' : '5432'),
  10
);

const isSupabaseOrCloud = Boolean(
  databaseUrl?.includes('supabase') ||
    databaseUrl?.includes('pooler') ||
    sqlHost?.includes('supabase') ||
    sqlHost?.includes('pooler') ||
    process.env.NODE_ENV === 'production' ||
    process.env.SQL_SSL === 'true'
);

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials: databaseUrl
    ? {
        url: databaseUrl,
        ssl: isSupabaseOrCloud ? { rejectUnauthorized: false } : false,
      }
    : {
        host: sqlHost || 'localhost',
        port: sqlPort,
        user: sqlUser || 'postgres',
        password: sqlPassword || '',
        database: sqlDatabase,
        ssl: isSupabaseOrCloud ? { rejectUnauthorized: false } : false,
      },
  verbose: true,
});

