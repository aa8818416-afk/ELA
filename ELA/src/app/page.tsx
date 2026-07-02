import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import type { Database } from "@/types/database.types";

type UserRole = Database["public"]["Enums"]["user_role"];

const ROLE_DASHBOARDS: Record<UserRole, string> = {
  admin: "/admin",
  distributor: "/distributor",
  farmer: "/farmer",
};

/**
 * Root page — Server Component.
 * Immediately redirects authenticated users to their role dashboard.
 * The middleware also handles this, but this acts as a server-side safety net.
 */
export default async function RootPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role as UserRole | undefined;

  if (role && ROLE_DASHBOARDS[role]) {
    redirect(ROLE_DASHBOARDS[role]);
  }

  // Fallback — should never reach here given middleware protection
  redirect("/login");
}
