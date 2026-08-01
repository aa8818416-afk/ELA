"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { 
  resetDailyUsage, 
  forceActiveStatus, 
  addKeyModel, 
  deleteKeyModel, 
  updateKeyModelLimit,
  updateKeyModelThinkingLevel
} from "@/app/actions/admin-api-keys";
import type { Database } from "@/types/database.types";
import { RefreshCw, PlayCircle, Plus, Trash2, Brain, ChevronDown } from "lucide-react";

type ApiKeyModel = Database["public"]["Tables"]["api_key_models"]["Row"];
type ApiKey = Database["public"]["Tables"]["api_keys"]["Row"] & {
  api_key_models: ApiKeyModel[];
};

// ─── Thinking Level Config ───────────────────────────────────────────────────
const THINKING_MODELS: Record<string, { levels: string[]; label: string; color: string }> = {
  "gemini-3.1-flash-lite": {
    levels: ["MINIMAL", "LOW", "MEDIUM", "HIGH"],
    label: "Gemini Flash Lite",
    color: "blue",
  },
  "gemini-3.5-flash-lite": {
    levels: ["MINIMAL", "LOW", "MEDIUM", "HIGH"],
    label: "Gemini 3.5 Flash Lite",
    color: "blue",
  },
  "gemma-4-31b-it": {
    levels: ["MINIMAL", "HIGH"],
    label: "Gemma 4 31B",
    color: "purple",
  },
  "gemma-4-26b-a4b-it": {
    levels: ["MINIMAL", "HIGH"],
    label: "Gemma 4 26B",
    color: "violet",
  },
};

const LEVEL_META: Record<string, { label: string; icon: string; bg: string; text: string; border: string }> = {
  MINIMAL: {
    label: "Minimal",
    icon: "🌱",
    bg: "bg-slate-100",
    text: "text-slate-600",
    border: "border-slate-200",
  },
  LOW: {
    label: "Low",
    icon: "⚡",
    bg: "bg-sky-50",
    text: "text-sky-700",
    border: "border-sky-200",
  },
  MEDIUM: {
    label: "Medium",
    icon: "🔥",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  HIGH: {
    label: "High",
    icon: "🚀",
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-200",
  },
};

function ThinkingLevelBadge({ level }: { level: string | null }) {
  if (!level) return null;
  const meta = LEVEL_META[level];
  if (!meta) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${meta.bg} ${meta.text} ${meta.border}`}
    >
      <span>{meta.icon}</span>
      {meta.label}
    </span>
  );
}

function ThinkingLevelDropdown({
  model,
  onUpdate,
}: {
  model: ApiKeyModel;
  onUpdate: () => void;
}) {
  const config = THINKING_MODELS[model.model_name];
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const currentLevel = model.thinking_level;

  if (!config) return null;

  async function handleSelect(level: string | null) {
    setLoading(true);
    setOpen(false);
    const res = await updateKeyModelThinkingLevel(model.id, level);
    if (!res.success && res.error) {
      alert("خطأ في تحديث مستوى التفكير: " + res.error);
    }
    setLoading(false);
    onUpdate();
  }

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className={`
          inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold
          transition-all duration-150 select-none
          ${loading ? "opacity-50 cursor-wait" : "cursor-pointer"}
          ${currentLevel
            ? `${LEVEL_META[currentLevel]?.bg} ${LEVEL_META[currentLevel]?.text} ${LEVEL_META[currentLevel]?.border} hover:brightness-95`
            : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
          }
        `}
      >
        <Brain className="w-3 h-3 opacity-80" />
        {currentLevel ? (
          <>
            <span>{LEVEL_META[currentLevel]?.icon}</span>
            <span>{LEVEL_META[currentLevel]?.label}</span>
          </>
        ) : (
          <span className="italic text-slate-400">اختر مستوى</span>
        )}
        <ChevronDown
          className={`w-3 h-3 ml-0.5 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full mt-1.5 z-20 min-w-[150px] bg-white rounded-xl shadow-xl border border-slate-200/80 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-100">
            {/* Header */}
            <div className="px-3 py-2 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200 flex items-center gap-1.5">
              <Brain className="w-3 h-3 text-slate-500" />
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                مستوى التفكير
              </span>
            </div>

            {/* Options */}
            <div className="p-1">
              {config.levels.map((lvl) => {
                const meta = LEVEL_META[lvl];
                const isActive = currentLevel === lvl;
                return (
                  <button
                    key={lvl}
                    onClick={() => handleSelect(lvl)}
                    className={`
                      w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold
                      transition-all duration-100
                      ${isActive
                        ? `${meta.bg} ${meta.text} ring-1 ring-inset ${meta.border}`
                        : "text-slate-600 hover:bg-slate-50"
                      }
                    `}
                  >
                    <span className="text-sm">{meta.icon}</span>
                    <span>{meta.label}</span>
                    {isActive && (
                      <span className="ml-auto text-[10px] opacity-60">✓ مفعّل</span>
                    )}
                  </button>
                );
              })}

              {/* None option */}
              {currentLevel && (
                <>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    onClick={() => handleSelect(null)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all duration-100"
                  >
                    <span>✕</span>
                    <span>إزالة الإعداد</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

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

      {/* Thinking Models Legend */}
      <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-sky-50 border border-indigo-100 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 bg-indigo-100 rounded-lg">
            <Brain className="w-4 h-4 text-indigo-600" />
          </div>
          <span className="text-sm font-semibold text-indigo-900">النماذج الداعمة للتحكم في مستوى التفكير</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Object.entries(THINKING_MODELS).map(([name, cfg]) => (
            <div key={name} className="bg-white/70 backdrop-blur-sm rounded-lg px-3 py-2.5 border border-white/80 shadow-sm">
              <p className="text-xs font-mono font-bold text-slate-700 mb-1.5 truncate" dir="ltr">{name}</p>
              <div className="flex flex-wrap gap-1">
                {cfg.levels.map((lvl) => (
                  <ThinkingLevelBadge key={lvl} level={lvl} />
                ))}
              </div>
            </div>
          ))}
        </div>
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

                    {/* Models, limits, usage, and thinking level */}
                    <td className="px-6 py-4 max-w-xl">
                      <div className="space-y-4">
                        {k.api_key_models && k.api_key_models.length > 0 ? (
                          k.api_key_models.map((model) => {
                            const supportsThinking = !!THINKING_MODELS[model.model_name];
                            return (
                              <div key={model.id} className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-2.5">
                                {/* Model header row */}
                                <div className="flex justify-between items-start gap-2">
                                  <div className="flex flex-col gap-1.5 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-semibold text-slate-700 text-sm font-mono" dir="ltr">
                                        {model.model_name}
                                      </span>
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

                                    {/* Thinking Level Dropdown */}
                                    {supportsThinking && (
                                      <div className="flex items-center gap-2">
                                        <ThinkingLevelDropdown
                                          model={model}
                                          onUpdate={fetchKeys}
                                        />
                                        {!model.thinking_level && (
                                          <span className="text-[10px] text-slate-400 italic">
                                            لم يُحدد مستوى التفكير
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  <button
                                    onClick={() => handleDeleteKeyModel(model.id)}
                                    className="text-slate-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 transition-colors shrink-0"
                                    title="حذف هذا النموذج"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                {/* Usage & limit row */}
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

                                {/* Progress bar */}
                                <div className="w-full bg-slate-200 rounded-full h-1.5">
                                  <div
                                    className={`h-1.5 rounded-full transition-all ${
                                      model.daily_usage >= model.daily_limit ? "bg-red-500" : "bg-green-500"
                                    }`}
                                    style={{ width: `${Math.min(100, (model.daily_usage / model.daily_limit) * 100)}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })
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
