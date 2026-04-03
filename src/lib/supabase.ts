import { createClient } from '@supabase/supabase-js';
import type { AppState } from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export function isSupabaseConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local');
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// The table name for storing the entire app state as a single JSON row
// This keeps things simple for single-user mode while being easy to migrate later
const STATE_TABLE = 'app_state';

export async function loadFromSupabase(): Promise<AppState | null> {
  try {
    const client = getClient();
    const { data, error } = await client
      .from(STATE_TABLE)
      .select('data, updated_at')
      .eq('id', 'default')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found — first time use
        return null;
      }
      console.error('Supabase load error:', error);
      return null;
    }

    return data?.data as AppState || null;
  } catch (err) {
    console.error('Supabase load error:', err);
    return null;
  }
}

export async function saveToSupabase(state: AppState): Promise<boolean> {
  try {
    const client = getClient();
    const { error } = await client
      .from(STATE_TABLE)
      .upsert({
        id: 'default',
        data: state,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (error) {
      console.error('Supabase save error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Supabase save error:', err);
    return false;
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    const client = getClient();
    const { error } = await client
      .from(STATE_TABLE)
      .select('id')
      .limit(1);

    if (error && error.code !== 'PGRST116') {
      console.error('Supabase connection test error:', error);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
