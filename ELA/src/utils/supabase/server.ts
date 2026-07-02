import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";

/**
 * Supabase client for use in:
 * - Server Components
 * - Route Handlers
 * - Server Actions
 *
 * Creates a new server client per-request using next/headers cookies.
 * Uses SECURITY NOTE: getUser() over getSession() to validate against auth server.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll called from a Server Component — cookies can only be set
            // in Server Actions or Route Handlers. This is safe to ignore here
            // because the middleware handles session refresh.
          }
        },
      },
    }
  );
}
