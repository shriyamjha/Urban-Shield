import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith('http') &&
  !supabaseUrl.includes('YOUR_')
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export interface IntegrationStatus {
  supabaseAuthConfigured: boolean;
  supabaseRealtimeConfigured: boolean;
  backendPersistenceActive: boolean;
  websocketRealtimeActive: boolean;
  overpassGisActive: boolean;
  osrmRoutingActive: boolean;
  openMeteoActive: boolean;
}

export function getClientIntegrationStatus(): IntegrationStatus {
  return {
    supabaseAuthConfigured: isSupabaseConfigured,
    supabaseRealtimeConfigured: isSupabaseConfigured,
    backendPersistenceActive: true,
    websocketRealtimeActive: true,
    overpassGisActive: true,
    osrmRoutingActive: true,
    openMeteoActive: true,
  };
}
