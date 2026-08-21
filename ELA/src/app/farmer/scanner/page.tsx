import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import FarmerChat from "@/components/farmer/FarmerChat";

export default async function FarmerScannerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="w-full">
      <FarmerChat />
    </div>
  );
}
