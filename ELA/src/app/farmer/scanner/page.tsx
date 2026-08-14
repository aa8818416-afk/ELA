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
    <div className="space-y-5 text-right">
      {/* Header */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs flex items-center justify-between">
        <div>
          <div className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-200 mb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>مدعوم بالذكاء الاصطناعي</span>
          </div>
          <h1 className="text-xl font-black text-slate-900">طبيب المحاصيل والتشخيص</h1>
          <p className="text-slate-500 text-xs mt-0.5">اسأل عن أمراض النبات أو ارفع صورة الإصابة للعلاج الفوري</p>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-2xl shadow-xs">
          🌿
        </div>
      </div>

      {/* Scanner Component */}
      <FarmerCropScanner />
    </div>
  );
}
