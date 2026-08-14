import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import CropScanner from "@/components/distributor/CropScanner";
import { Sparkles, ScanLine, AlertTriangle, ShieldCheck } from "lucide-react";

export default async function ScannerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 1. Fetch distributor's registered farmers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: farmersData } = await (supabase as any)
    .from("farmers")
    .select(`
      profile_id,
      profiles ( full_name, phone )
    `)
    .eq("distributor_id", user.id);

  const farmers = (farmersData || []).map((f: any) => ({
    id: f.profile_id,
    name: f.profiles?.full_name || "مزارع",
    phone: f.profiles?.phone || "",
  }));

  // 2. Fetch active pest / disease outbreaks in this distributor's village
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: outbreaksData } = await (supabase as any)
    .from("alert_instances")
    .select(`
      id,
      risk_type,
      severity_snapshot,
      status,
      created_at,
      farmer_fields!inner (
        field_name,
        crop_type,
        farmers!inner (
          distributor_id,
          profiles ( full_name )
        )
      )
    `)
    .eq("farmer_fields.farmers.distributor_id", user.id)
    .not("status", "in", '("CLOSED_FALSE_ALARM","AUTO_CLOSED_NO_RESPONSE","RESOLVED","CROP_LOSS","CLOSED_SEASON_END","MISDIAGNOSED_ORIGINAL")')
    .order("created_at", { ascending: false })
    .limit(10);

  const outbreaks = (outbreaksData || []).map((o: any) => ({
    id: o.id,
    riskType: o.risk_type,
    severity: o.severity_snapshot,
    status: o.status,
    createdAt: o.created_at,
    fieldName: o.farmer_fields?.field_name || "حقل",
    cropType: o.farmer_fields?.crop_type || "محصول",
    farmerName: o.farmer_fields?.farmers?.profiles?.full_name || "فلاح",
  }));

  return (
    <div className="space-y-6 max-w-6xl mx-auto" dir="rtl">
      {/* Top Banner */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <ScanLine className="w-5 h-5 text-emerald-700" />
              طبيب المحاصيل ورصد بؤر الآفات بالقرية
            </h1>
            <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
              ذكاء اصطناعي زراعي 2026
            </span>
          </div>
          <p className="text-slate-500 text-xs mt-1">
            فحص وتشخيص الآفات فورياً بالذكاء الاصطناعي مع ربط التشخيص بحقل المزارع ومتابعة خريطة بؤر الإصابة في قريتك
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
            {outbreaks.length > 0 ? `${outbreaks.length} بؤر نشطة بالقرية` : "القرية خالية من البؤر 🌿"}
          </span>
        </div>
      </div>

      <CropScanner farmers={farmers} outbreaks={outbreaks} distributorId={user.id} />
    </div>
  );
}
