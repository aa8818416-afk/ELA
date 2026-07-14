import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import FarmerCropScanner from "@/components/farmer/FarmerCropScanner";
import { Sparkles } from "lucide-react";

export default async function FarmerScannerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
          <Sparkles className="w-8 h-8 text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">
          طبيب المحاصيل الذكي
        </h1>
        <p className="text-slate-400 text-sm leading-relaxed">
          اسأل عن أي مرض أو آفة، أو أرفق صورة من محصولك وسيشخص لك الذكاء الاصطناعي الإصابة ويقترح العلاج
        </p>
      </div>

      {/* Scanner Component */}
      <FarmerCropScanner />
    </div>
  );
}
