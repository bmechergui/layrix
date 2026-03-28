import { createBrowserClient, createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import type { Database } from './types';

// Variables d'environnement validées (voir env.ts)
const SUPABASE_URL = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? '';
const SUPABASE_ANON_KEY = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '';

// Client browser (composants client Next.js)
export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Client serveur (Server Components, Route Handlers, Server Actions)
export function createServerSupabaseClient(
  cookieStore: {
    get: (name: string) => { value: string } | undefined;
    set: (name: string, value: string, options: CookieOptions) => void;
    delete: (name: string, options: CookieOptions) => void;
  }
) {
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        cookieStore.set(name, value, options);
      },
      remove(name: string, options: CookieOptions) {
        cookieStore.delete(name, options);
      },
    },
  });
}

// Client admin (service role — uniquement côté serveur)
export function createAdminSupabaseClient() {
  const serviceKey = process.env['SUPABASE_SERVICE_KEY'] ?? '';
  return createBrowserClient<Database>(SUPABASE_URL, serviceKey);
}
