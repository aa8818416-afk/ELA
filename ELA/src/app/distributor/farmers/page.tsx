import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import FarmerRegistrationModal from "@/components/distributor/FarmerRegistrationModal";

export default async function FarmersDirectoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch farmers linked to this distributor, along with their profile info
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: farmers, error } = await (supabase as any)
    .from("farmers")
    .select(`
      profile_id,
      current_crop,
      land_size,
      profiles (
        full_name,
        phone
      )
    `)
    .eq("distributor_id", user.id);

  if (error) {
    console.error("Error fetching farmers:", error);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">إدارة الفلاحين</h2>
          <p className="text-slate-400 text-sm">
            سجل الفلاحين التابعين لك والذين يمكنك إصدار طلبات بالنيابة عنهم
          </p>
        </div>
        <FarmerRegistrationModal />
      </div>

      <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm text-slate-300">
            <thead className="text-xs text-slate-400 uppercase bg-slate-900 border-b border-slate-800">
              <tr>
                <th scope="col" className="px-6 py-4 font-medium">الاسم</th>
                <th scope="col" className="px-6 py-4 font-medium">رقم الهاتف</th>
                <th scope="col" className="px-6 py-4 font-medium">المحصول الحالي</th>
                <th scope="col" className="px-6 py-4 font-medium">المساحة (فدان)</th>
                <th scope="col" className="px-6 py-4 font-medium">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {!farmers || farmers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    لا يوجد فلاحين مسجلين بعد. ابدأ بإضافة فلاح جديد.
                  </td>
                </tr>
              ) : (
                farmers.map((farmer: any) => {
                  const profile = Array.isArray(farmer.profiles) ? farmer.profiles[0] : farmer.profiles;
                  return (
                    <tr
                      key={farmer.profile_id}
                      className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-6 py-4 font-medium text-white">
                        {profile?.full_name || "غير محدد"}
                      </td>
                      <td className="px-6 py-4" dir="ltr">
                        {profile?.phone || "غير محدد"}
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded-lg text-xs">
                          {farmer.current_crop || "غير محدد"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {farmer.land_size ? `${farmer.land_size} فدان` : "غير محدد"}
                      </td>
                      <td className="px-6 py-4">
                        <button className="text-amber-400 hover:text-amber-300 transition-colors text-xs font-medium">
                          إصدار طلب
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
