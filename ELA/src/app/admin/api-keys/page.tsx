"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  resetDailyUsage, 
  forceActiveStatus, 
  addKeyModel, 
  deleteKeyModel, 
  updateKeyModelLimit 
} from "@/app/actions/admin-api-keys";
import type { Database } from "@/types/database.types";
import { RefreshCw, PlayCircle, Plus, Trash2, ShieldAlert } from "lucide-react";

type ApiKey = Database["public"]["Tables"]["api_keys"]["Row"] & {
  api_key_models: Database["public"]["Tables"]["api_key_models"]["Row"][];
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingModelForKey, setAddingModelForKey] = useState<string | null>(null);
  const [newModelName, setNewModelName] = useState("");
  const [newModelLimit, setNewModelLimit] = useState(1450);
  const supabase = createClient();

  useEffect(() => {
    fetchKeys();
  }, []);

  async function fetchKeys() {
    setLoading(true);
    const { data, error } = await supabase
      .from("api_keys")
      .select("*, api_key_models(*)")
      .order("project_name");
    
    if (!error && data) {
      setKeys(data as ApiKey[]);
    }
    setLoading(false);
  }

  async function handleReset(id: string) {
    const res = await resetDailyUsage(id);
    if (res.success) {
      fetchKeys();
    } else {
      alert("حدث خطأ أثناء إعادة التعيين: " + res.error);
    }
  }

  async function handleForceActive(id: string) {
    const res = await forceActiveStatus(id);
    if (res.success) {
      fetchKeys();
    } else {
      alert("حدث خطأ أثناء التفعيل: " + res.error);
    }
  }

  async function handleAddKeyModel(keyId: string) {
    if (!newModelName.trim()) return;
    const res = await addKeyModel(keyId, newModelName.trim(), newModelLimit);
    if (res.success) {
      setNewModelName("");
      setNewModelLimit(1450);
      setAddingModelForKey(null);
      fetchKeys();
    } else {
      alert("حدث خطأ أثناء إضافة النموذج: " + res.error);
    }
  }

  async function handleDeleteKeyModel(modelId: string) {
    if (!confirm("هل أنت متأكد من رغبتك في حذف هذا النموذج من هذا المفتاح؟")) return;
    const res = await deleteKeyModel(modelId);
    if (res.success) {
      fetchKeys();
    } else {
      alert("حدث خطأ أثناء حذف النموذج: " + res.error);
    }
  }

  async function handleUpdateModelLimit(modelId: string, limit: number) {
    const res = await updateKeyModelLimit(modelId, limit);
    if (res.success) {
      fetchKeys();
    } else {
      alert("حدث خطأ أثناء تحديث الحد: " + res.error);
    }
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
                <th className="px-6 py-4 font-medium">المفتاح (API Key)</th>
                <th className="px-6 py-4 font-medium">الحالة العامة</th>
                <th className="px-6 py-4 font-medium">النماذج المستضافة والاستخدام</th>
                <th className="px-6 py-4 font-medium">الإجراءات العامة</th>
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
                  <tr key={k.id} className="hover:bg-slate-50/50 transition-colors align-top">
                    {/* Project Name */}
                    <td className="px-6 py-4">
                      <span className="font-semibold text-slate-800">{k.project_name}</span>
                    </td>
                    
                    {/* API Key (Masked) */}
                    <td className="px-6 py-4 text-slate-500 font-mono text-sm" dir="ltr">
                      {maskKey(k.api_key)}
                    </td>

                    {/* General Status */}
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          k.status === "active"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {k.status === "active" ? "نشط" : "متوقف (محدود)"}
                      </span>
                    </td>

                    {/* Models, limits and usage */}
                    <td className="px-6 py-4 max-w-xl">
                      <div className="space-y-4">
                        {k.api_key_models && k.api_key_models.length > 0 ? (
                          k.api_key_models.map((model) => (
                            <div key={model.id} className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-2">
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-slate-700 text-sm">{model.model_name}</span>
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                                      model.status === "active"
                                        ? "bg-green-100/80 text-green-800"
                                        : "bg-amber-100 text-amber-800"
                                    }`}
                                  >
                                    {model.status === "active" ? "نشط" : "محدود (429)"}
                                  </span>
                                </div>
                                <button
                                  onClick={() => handleDeleteKeyModel(model.id)}
                                  className="text-slate-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 transition-colors"
                                  title="حذف هذا النموذج"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              <div className="flex items-center gap-4 text-xs">
                                <div className="flex items-center gap-1.5 text-slate-500">
                                  <span>الاستخدام:</span>
                                  <span className="font-bold text-slate-700">{model.daily_usage}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-slate-500">
                                  <span>الحد:</span>
                                  <input
                                    type="number"
                                    defaultValue={model.daily_limit}
                                    onBlur={(e) => {
                                      const val = parseInt(e.target.value);
                                      if (!isNaN(val) && val !== model.daily_limit) {
                                        handleUpdateModelLimit(model.id, val);
                                      }
                                    }}
                                    className="w-16 px-1.5 py-0.5 bg-white border border-slate-200 rounded text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500"
                                  />
                                </div>
                              </div>

                              <div className="w-full bg-slate-200 rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full ${
                                    model.daily_usage >= model.daily_limit ? "bg-red-500" : "bg-green-500"
                                  }`}
                                  style={{ width: `${Math.min(100, (model.daily_usage / model.daily_limit) * 100)}%` }}
                                ></div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-xs text-slate-400 italic">لا توجد نماذج مضافة لهذا المفتاح.</div>
                        )}

                        {/* Add Model Form */}
                        {addingModelForKey === k.id ? (
                          <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-lg border border-dashed border-slate-200">
                            <input
                              type="text"
                              placeholder="اسم النموذج (e.g. gemini-2.5-pro)"
                              value={newModelName}
                              onChange={(e) => setNewModelName(e.target.value)}
                              className="flex-1 px-2.5 py-1 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:border-blue-500 text-slate-700 font-mono"
                            />
                            <input
                              type="number"
                              placeholder="الحد"
                              value={newModelLimit}
                              onChange={(e) => setNewModelLimit(parseInt(e.target.value) || 0)}
                              className="w-16 px-2 py-1 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:border-blue-500 text-slate-700 font-semibold"
                            />
                            <button
                              onClick={() => handleAddKeyModel(k.id)}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
                            >
                              إضافة
                            </button>
                            <button
                              onClick={() => {
                                setAddingModelForKey(null);
                                setNewModelName("");
                              }}
                              className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-600 rounded text-xs font-medium transition-colors"
                            >
                              إلغاء
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setAddingModelForKey(k.id)}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium hover:underline transition-all"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            إضافة نموذج جديد للمفتاح
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReset(k.id)}
                          title="تصفير الاستهلاك وتنشيط المفتاح مع كافة نماذجه"
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium"
                        >
                          <RefreshCw className="w-4 h-4" />
                          <span>تصفير وتنشيط</span>
                        </button>
                        <button
                          onClick={() => handleForceActive(k.id)}
                          title="تفعيل إجباري لكافة النماذج والمفتاح"
                          disabled={k.status === "active" && k.api_key_models?.every(m => m.status === "active")}
                          className={`p-2 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium ${
                            k.status === "active" && k.api_key_models?.every(m => m.status === "active")
                              ? "text-slate-200 cursor-not-allowed"
                              : "text-slate-400 hover:text-green-600 hover:bg-green-50"
                          }`}
                        >
                          <PlayCircle className="w-4 h-4" />
                          <span>تفعيل إجباري</span>
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
