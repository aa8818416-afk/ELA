import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import CropScanner from "@/components/distributor/CropScanner";
import { Sparkles } from "lucide-react";

export default async function ScannerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-6">
          <Sparkles className="w-8 h-8 text-emerald-400" />
        </div>
        <h2 className="text-3xl font-bold text-white mb-4">طبيب المحاصيل الذكي</h2>
        <p className="text-slate-400">
          استخدم الذكاء الاصطناعي لتشخيص أمراض النباتات وتقديم الحلول الفورية للفلاحين عبر التقاط صورة بسيطة.
        </p>
      </div>

      <CropScanner />
    </div>
  );
}
