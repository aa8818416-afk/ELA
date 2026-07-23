import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import FarmersPageClient from "@/components/distributor/FarmersPageClient";

export default async function FarmersDirectoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // التحقق من أن الموزع مقبول قبل عرض الصفحة
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dist } = await (supabase as any)
    .from("distributors")
    .select("status")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (dist?.status === "PENDING_APPROVAL") {
    redirect("/distributor/pending");
  }
  if (dist?.status === "REJECTED") {
    redirect("/login");
  }

  // جلب الفلاحين التابعين لهذا الموزع
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: farmers, error } = await (supabase as any)
    .from("farmers")
    .select(`
      profile_id,
      profiles (
        full_name,
        phone
      )
    `)
    .eq("distributor_id", user.id);

  if (error) {
    console.error("Error fetching farmers:", error);
  }

  return <FarmersPageClient initialFarmers={farmers ?? []} />;
}
