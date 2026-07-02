"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { toggleDistributorStatus, settleDistributorWallet } from "@/app/actions/admin-distributors";
import { CheckCircle2, XCircle, DollarSign, Wallet } from "lucide-react";

type DistributorWithProfile = {
  profile_id: string;
  active_status: boolean;
  wallet_balance: number;
  pending_commission: number;
  village: string | null;
  profiles: {
    full_name: string | null;
    phone: string | null;
  };
};

export default function DistributorsPage() {
  const [distributors, setDistributors] = useState<DistributorWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    fetchDistributors();
  }, []);

  async function fetchDistributors() {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("distributors")
      .select("profile_id, active_status, wallet_balance, pending_commission, village, profiles(full_name, phone)");

    if (!error && data) {
      setDistributors(data);
    }
    setLoading(false);
  }

  async function handleToggleStatus(profileId: string, currentStatus: boolean) {
    await toggleDistributorStatus(profileId, currentStatus);
    fetchDistributors();
  }

  async function handleSettle(profileId: string) {
    if (confirm("هل أنت متأكد من تسوية هذه المحفظة وتصفير الرصيد المتاح؟")) {
      await settleDistributorWallet(profileId);
      fetchDistributors();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">إدارة الموزعين والعمولات</h2>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 text-sm">
              <tr>
                <th className="px-6 py-4 font-medium">الموزع</th>
                <th className="px-6 py-4 font-medium">القرية</th>
                <th className="px-6 py-4 font-medium">الرصيد المتاح للسحب</th>
                <th className="px-6 py-4 font-medium">عمولات معلقة (قيد التوصيل)</th>
                <th className="px-6 py-4 font-medium">حالة الحساب</th>
                <th className="px-6 py-4 font-medium">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    جاري التحميل...
                  </td>
                </tr>
              ) : distributors.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    لا يوجد موزعين مسجلين حالياً.
                  </td>
                </tr>
              ) : (
                distributors.map((dist) => (
                  <tr key={dist.profile_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-800">{dist.profiles?.full_name || "غير محدد"}</div>
                      <div className="text-sm text-slate-500 dir-ltr text-right">{dist.profiles?.phone || "غير محدد"}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {dist.village || "غير محددة"}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-green-600 font-bold">
                        <Wallet className="w-4 h-4" />
                        <span>{dist.wallet_balance} ج.م</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {dist.pending_commission} ج.م
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleStatus(dist.profile_id, dist.active_status)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          dist.active_status
                            ? "bg-green-100 text-green-800 hover:bg-red-100 hover:text-red-800"
                            : "bg-red-100 text-red-800 hover:bg-green-100 hover:text-green-800"
                        }`}
                      >
                        {dist.active_status ? (
                          <><CheckCircle2 className="w-3.5 h-3.5" /> نشط (انقر للإيقاف)</>
                        ) : (
                          <><XCircle className="w-3.5 h-3.5" /> موقوف (انقر للتفعيل)</>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleSettle(dist.profile_id)}
                        disabled={dist.wallet_balance === 0}
                        className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                          dist.wallet_balance > 0
                            ? "bg-blue-600 text-white hover:bg-blue-700"
                            : "bg-slate-100 text-slate-400 cursor-not-allowed"
                        }`}
                      >
                        <DollarSign className="w-4 h-4" />
                        تسوية الرصيد
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
