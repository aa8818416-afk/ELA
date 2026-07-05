"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { resetDailyUsage, forceActiveStatus } from "@/app/actions/admin-api-keys";
import type { Database } from "@/types/database.types";
import { RefreshCw, PlayCircle } from "lucide-react";

type ApiKey = Database["public"]["Tables"]["api_keys"]["Row"];

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    fetchKeys();
  }, []);

  async function fetchKeys() {
    setLoading(true);
    const { data, error } = await supabase.from("api_keys").select("*").order("project_name");
    if (!error && data) {
      setKeys(data);
    }
    setLoading(false);
  }

  async function handleReset(id: string) {
    await resetDailyUsage(id);
    fetchKeys();
  }

  async function handleForceActive(id: string) {
    await forceActiveStatus(id);
    fetchKeys();
  }

  function maskKey(key: string) {
    if (!key) return "";
    return key.slice(0, 4) + "..." + key.slice(-4);
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">مفاتيح الذكاء الاصطناعي (API Keys)</h2>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 text-sm">
              <tr>
                <th className="px-6 py-4 font-medium">المشروع</th>
                <th className="px-6 py-4 font-medium">النموذج</th>
                <th className="px-6 py-4 font-medium">المفتاح (API Key)</th>
                <th className="px-6 py-4 font-medium">الاستخدام اليومي</th>
                <th className="px-6 py-4 font-medium">الحالة</th>
                <th className="px-6 py-4 font-medium">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                    جاري التحميل...
                  </td>
                </tr>
              ) : keys.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                    لا توجد مفاتيح مسجلة.
                  </td>
                </tr>
              ) : (
                keys.map((k) => (
                  <tr key={k.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-semibold text-slate-800">{k.project_name}</span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 text-sm">
                      <input
                        type="text"
                        value={k.model_name || ""}
                        onChange={(e) => {
                          const newKeys = [...keys];
                          newKeys.find(key => key.id === k.id)!.model_name = e.target.value;
                          setKeys(newKeys);
                        }}
                        onBlur={async () => {
                          await (supabase as any).from("api_keys").update({ model_name: k.model_name }).eq("id", k.id);
                        }}
                        className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm"
                      />
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-mono text-sm" dir="ltr">
                      {maskKey(k.api_key)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-700">{k.daily_usage}</span>
                        <span className="text-xs text-slate-400">/ 1500</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
                        <div
                          className={`h-1.5 rounded-full ${k.daily_usage > 1400 ? "bg-red-500" : "bg-green-500"
                            }`}
                          style={{ width: `${Math.min(100, (k.daily_usage / 1500) * 100)}%` }}
                        ></div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${k.status === "active"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                          }`}
                      >
                        {k.status === "active" ? "نشط" : "متوقف (محدود)"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReset(k.id)}
                          title="تصفير العداد"
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleForceActive(k.id)}
                          title="تفعيل إجباري"
                          disabled={k.status === "active"}
                          className={`p-2 rounded-lg transition-colors ${k.status === "active"
                            ? "text-slate-200 cursor-not-allowed"
                            : "text-slate-400 hover:text-green-600 hover:bg-green-50"
                            }`}
                        >
                          <PlayCircle className="w-4 h-4" />
                        </button>
                      </div>
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
