import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

let adminClient = null;

export function supabaseConfigured() {
  return Boolean(config.supabase.url && config.supabase.secretKey);
}

export function getSupabaseAdmin() {
  if (!supabaseConfigured()) {
    throw new Error('SUPABASE_URL e SUPABASE_SECRET_KEY precisam estar preenchidas.');
  }
  if (!adminClient) {
    adminClient = createClient(config.supabase.url, config.supabase.secretKey, {
      db: { schema: config.supabase.schema },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return adminClient;
}

export async function verifySupabaseSchema() {
  const client = getSupabaseAdmin();
  const { error } = await client.from('campaigns').select('id').limit(1);
  if (error) throw new Error(`Supabase indisponível: ${error.message}`);
  return true;
}
