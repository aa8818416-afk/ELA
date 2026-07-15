"use client";

import { useState, useEffect, useRef } from "react";
import {
  Volume2, Save, Play, Loader2, CheckCircle2,
  AlertCircle, Mic, Sliders, Clock, Scissors, Info,
} from "lucide-react";

// ─── Available Arabic Voices ──────────────────────────────────────────────────
const ARABIC_VOICES = [
  // Egyptian
  { value: "ar-EG-SalmaNeural",     label: "🇪🇬 سلمى — مصري (أنثى)",   group: "مصري" },
  { value: "ar-EG-ShakirNeural",    label: "🇪🇬 شاكر — مصري (ذكر)",    group: "مصري" },
  // Saudi
  { value: "ar-SA-ZariyahNeural",   label: "🇸🇦 زارية — سعودي (أنثى)",  group: "سعودي" },
  { value: "ar-SA-HamedNeural",     label: "🇸🇦 حامد — سعودي (ذكر)",    group: "سعودي" },
  // UAE
  { value: "ar-AE-FatimaNeural",    label: "🇦🇪 فاطمة — إماراتي (أنثى)", group: "خليجي" },
  { value: "ar-AE-HamdanNeural",    label: "🇦🇪 حمدان — إماراتي (ذكر)",  group: "خليجي" },
  // Levantine
  { value: "ar-SY-AmanyNeural",     label: "🇸🇾 أماني — شامي (أنثى)",   group: "شامي" },
  { value: "ar-SY-LaithNeural",     label: "🇸🇾 ليث — شامي (ذكر)",      group: "شامي" },
  // Moroccan / Algerian
  { value: "ar-MA-MounaNeural",     label: "🇲🇦 مونا — مغربي (أنثى)",   group: "مغاربي" },
  { value: "ar-MA-JamalNeural",     label: "🇲🇦 جمال — مغربي (ذكر)",    group: "مغاربي" },
  // Kuwaiti
  { value: "ar-KW-FahedNeural",     label: "🇰🇼 فهد — كويتي (ذكر)",     group: "خليجي" },
  { value: "ar-KW-NouraNeural",     label: "🇰🇼 نورا — كويتي (أنثى)",   group: "خليجي" },
];

interface TtsSettings {
  voice: string;
  rate: string;
  pitch: string;
  volume: string;
  break_on_comma_ms: number;
  break_on_period_ms: number;
  chunk_max_chars: number;
  auto_breaks_enabled: boolean;
  updated_at?: string;
}

const DEFAULT_SETTINGS: TtsSettings = {
  voice: "ar-EG-SalmaNeural",
  rate: "+0%",
  pitch: "+0Hz",
  volume: "+0%",
  break_on_comma_ms: 300,
  break_on_period_ms: 600,
  chunk_max_chars: 800,
  auto_breaks_enabled: true,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function parseSignedPercent(val: string): number {
  return parseInt(val.replace("%", "").replace("+", ""), 10) || 0;
}
function parseSignedHz(val: string): number {
  return parseInt(val.replace("Hz", "").replace("+", ""), 10) || 0;
}
function toSignedPercent(n: number): string {
  return n >= 0 ? `+${n}%` : `${n}%`;
}
function toSignedHz(n: number): string {
  return n >= 0 ? `+${n}Hz` : `${n}Hz`;
}

// ─── Slider Component ─────────────────────────────────────────────────────────
function SettingSlider({
  label, value, min, max, step = 1, unit,
  onChange, colorClass = "accent-green-600",
  description,
}: {
  label: string; value: number; min: number; max: number; step?: number;
  unit: string; onChange: (v: number) => void;
  colorClass?: string; description?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-slate-700">{label}</label>
        <span className={`text-sm font-mono font-bold px-2 py-0.5 rounded-md ${
          value > 0 ? "bg-green-50 text-green-700" :
          value < 0 ? "bg-red-50 text-red-700"   :
                      "bg-slate-100 text-slate-600"
        }`}>
          {value >= 0 ? `+${value}` : value}{unit}
        </span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={min} max={max} step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`w-full h-2 rounded-full appearance-none cursor-pointer bg-slate-200 ${colorClass}`}
          style={{
            background: `linear-gradient(to left, #e2e8f0 ${100 - pct}%, #16a34a ${100 - pct}%)`,
          }}
        />
        <div className="flex justify-between text-xs text-slate-400 mt-1">
          <span>{min}{unit}</span>
          <span>0{unit}</span>
          <span>+{max}{unit}</span>
        </div>
      </div>
      {description && (
        <p className="text-xs text-slate-400 flex items-center gap-1">
          <Info className="w-3 h-3 flex-shrink-0" /> {description}
        </p>
      )}
    </div>
  );
}

// ─── Page Component ───────────────────────────────────────────────────────────
export default function SmartVoicePage() {
  const [settings, setSettings] = useState<TtsSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [testText, setTestText] = useState(
    "مرحباً، هذه تجربة صوتية. الطقس جميل اليوم، والمحصول يبدو رائعاً!"
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch current settings on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/tts-settings");
        if (res.ok) {
          const json = await res.json();
          if (json.settings) setSettings(json.settings);
        }
      } catch (err) {
        console.error("[smart-voice] Failed to load settings:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ─ Setters ─
  const set = <K extends keyof TtsSettings>(key: K, val: TtsSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: val }));

  const rateNum   = parseSignedPercent(settings.rate);
  const pitchNum  = parseSignedHz(settings.pitch);
  const volumeNum = parseSignedPercent(settings.volume);

  // ─ Save ─
  async function handleSave() {
    setSaving(true);
    setSaveStatus("idle");
    try {
      const res = await fetch("/api/admin/tts-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSaveStatus("success");
        setTimeout(() => setSaveStatus("idle"), 3000);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  // ─ Test Preview ─
  async function handleTest() {
    if (testing) {
      audioRef.current?.pause();
      setTesting(false);
      return;
    }
    setTesting(true);
    try {
      const res = await fetch("/api/admin/tts-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: testText, ...settings }),
      });
      if (!res.ok) throw new Error("Test failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setTesting(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setTesting(false);
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm">جاري تحميل الإعدادات...</p>
        </div>
      </div>
    );
  }

  // Group voices by region
  const voiceGroups = ARABIC_VOICES.reduce<Record<string, typeof ARABIC_VOICES>>(
    (acc, v) => { (acc[v.group] ??= []).push(v); return acc; }, {}
  );

  return (
    <div className="space-y-8 max-w-3xl" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-green-100 rounded-xl">
              <Volume2 className="w-6 h-6 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">المتحدث الذكي</h2>
          </div>
          <p className="text-slate-500 text-sm mr-14">
            التحكم الكامل في صوت المنصة وإيقاعه وأسلوب نطقه
          </p>
          {settings.updated_at && (
            <p className="text-xs text-slate-400 mr-14 mt-1">
              آخر تحديث: {new Date(settings.updated_at).toLocaleString("ar-EG")}
            </p>
          )}
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm
            ${saveStatus === "success"
              ? "bg-green-500 text-white"
              : saveStatus === "error"
              ? "bg-red-500 text-white"
              : "bg-slate-900 text-white hover:bg-slate-700"
            }`}
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> جاري الحفظ...</>
          ) : saveStatus === "success" ? (
            <><CheckCircle2 className="w-4 h-4" /> تم الحفظ بنجاح!</>
          ) : saveStatus === "error" ? (
            <><AlertCircle className="w-4 h-4" /> فشل الحفظ</>
          ) : (
            <><Save className="w-4 h-4" /> حفظ الإعدادات</>
          )}
        </button>
      </div>

      {/* ── Section 1: Voice Selection ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-5">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
          <Mic className="w-5 h-5 text-green-600" />
          <h3 className="font-bold text-slate-800">اختيار الصوت</h3>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-semibold text-slate-700">الصوت النشط</label>
          <select
            value={settings.voice}
            onChange={(e) => set("voice", e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            {Object.entries(voiceGroups).map(([group, voices]) => (
              <optgroup key={group} label={group}>
                {voices.map((v) => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </optgroup>
            ))}
          </select>

          {/* Voice badge */}
          <div className="flex items-center gap-2 text-xs">
            <span className="bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-lg font-mono">
              {settings.voice}
            </span>
            <span className="text-slate-400">الصوت الحالي المستخدم في الـ API</span>
          </div>
        </div>
      </div>

      {/* ── Section 2: Rhythm & Tone ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-6">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
          <Sliders className="w-5 h-5 text-green-600" />
          <h3 className="font-bold text-slate-800">الإيقاع والنبرة</h3>
        </div>

        <SettingSlider
          label="سرعة الكلام (Rate)"
          value={rateNum} min={-50} max={100} unit="%"
          onChange={(v) => set("rate", toSignedPercent(v))}
          description="القيمة الافتراضية +0%. القيم الموجبة تزيد السرعة، والسالبة تبطئها."
        />
        <SettingSlider
          label="حدة الصوت (Pitch)"
          value={pitchNum} min={-20} max={20} unit="Hz"
          onChange={(v) => set("pitch", toSignedHz(v))}
          description="رفع أو خفض طبقة الصوت. القيمة الافتراضية +0Hz."
        />
        <SettingSlider
          label="مستوى الصوت (Volume)"
          value={volumeNum} min={-50} max={50} unit="%"
          onChange={(v) => set("volume", toSignedPercent(v))}
          description="رفع أو خفض مستوى الصوت الصادر. القيمة الافتراضية +0%."
        />
      </div>

      {/* ── Section 3: Punctuation Breaks ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-6">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
          <Clock className="w-5 h-5 text-green-600" />
          <h3 className="font-bold text-slate-800">وقفات الترقيم التلقائية</h3>
        </div>

        {/* Toggle */}
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
          <div>
            <p className="text-sm font-semibold text-slate-700">تفعيل الوقفات التلقائية</p>
            <p className="text-xs text-slate-400 mt-0.5">
              يُدرج وقفات صوتية عند الفاصلة والنقطة لتجربة استماع أكثر طبيعية
            </p>
          </div>
          <button
            onClick={() => set("auto_breaks_enabled", !settings.auto_breaks_enabled)}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${
              settings.auto_breaks_enabled ? "bg-green-500" : "bg-slate-300"
            }`}
            role="switch"
            aria-checked={settings.auto_breaks_enabled}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                settings.auto_breaks_enabled ? "translate-x-1" : "translate-x-6"
              }`}
            />
          </button>
        </div>

        {settings.auto_breaks_enabled && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Comma pause */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700">
                  وقفة عند الفاصلة ،
                </label>
                <span className="text-sm font-mono font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md">
                  {settings.break_on_comma_ms} ms
                </span>
              </div>
              <input
                type="range"
                min={0} max={1000} step={50}
                value={settings.break_on_comma_ms}
                onChange={(e) => set("break_on_comma_ms", Number(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to left, #e2e8f0 ${100 - (settings.break_on_comma_ms / 1000) * 100}%, #d97706 ${100 - (settings.break_on_comma_ms / 1000) * 100}%)`,
                }}
              />
              <div className="flex justify-between text-xs text-slate-400">
                <span>0 ms (بلا وقفة)</span>
                <span>500 ms</span>
                <span>1000 ms</span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Info className="w-3 h-3 flex-shrink-0" />
                يُدرج{" "}
                <code className="bg-slate-100 px-1 rounded text-slate-600 font-mono text-[10px]">
                  &lt;break time=&quot;{settings.break_on_comma_ms}ms&quot;/&gt;
                </code>{" "}
                بعد كل فاصلة
              </p>
            </div>

            {/* Period pause */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700">
                  وقفة عند النقطة .
                </label>
                <span className="text-sm font-mono font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md">
                  {settings.break_on_period_ms} ms
                </span>
              </div>
              <input
                type="range"
                min={0} max={2000} step={100}
                value={settings.break_on_period_ms}
                onChange={(e) => set("break_on_period_ms", Number(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to left, #e2e8f0 ${100 - (settings.break_on_period_ms / 2000) * 100}%, #2563eb ${100 - (settings.break_on_period_ms / 2000) * 100}%)`,
                }}
              />
              <div className="flex justify-between text-xs text-slate-400">
                <span>0 ms</span>
                <span>1000 ms</span>
                <span>2000 ms</span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Info className="w-3 h-3 flex-shrink-0" />
                يُدرج{" "}
                <code className="bg-slate-100 px-1 rounded text-slate-600 font-mono text-[10px]">
                  &lt;break time=&quot;{settings.break_on_period_ms}ms&quot;/&gt;
                </code>{" "}
                بعد كل نقطة أو استفهام
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Section 4: Chunking ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-5">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
          <Scissors className="w-5 h-5 text-green-600" />
          <h3 className="font-bold text-slate-800">تقسيم النصوص الطويلة (Chunking)</h3>
        </div>

        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex gap-2">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            Vercel Serverless Functions لها حد زمني 10 ثوانٍ. النصوص الطويلة تُقسَّم
            تلقائياً وتُعالَج بالتوازي لتفادي انقطاع الصوت.
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-slate-700">
              الحد الأقصى للحروف في كل جزء
            </label>
            <span className="text-sm font-mono font-bold bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md">
              {settings.chunk_max_chars} حرف
            </span>
          </div>
          <input
            type="range"
            min={200} max={2000} step={100}
            value={settings.chunk_max_chars}
            onChange={(e) => set("chunk_max_chars", Number(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to left, #e2e8f0 ${100 - ((settings.chunk_max_chars - 200) / 1800) * 100}%, #9333ea ${100 - ((settings.chunk_max_chars - 200) / 1800) * 100}%)`,
            }}
          />
          <div className="flex justify-between text-xs text-slate-400">
            <span>200 (أسرع)</span>
            <span>800 (موصى به)</span>
            <span>2000 (نصوص طويلة)</span>
          </div>
        </div>

        {/* Live preview of chunking impact */}
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-xl font-bold text-slate-800">{settings.chunk_max_chars}</p>
            <p className="text-xs text-slate-500">حرف لكل جزء</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-xl font-bold text-slate-800">
              ~{Math.ceil(settings.chunk_max_chars / 5)}
            </p>
            <p className="text-xs text-slate-500">كلمة لكل جزء</p>
          </div>
        </div>
      </div>

      {/* ── Section 5: Live Test ── */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2 border-b border-slate-700 pb-4">
          <Play className="w-5 h-5 text-green-400" />
          <h3 className="font-bold text-white">تجربة فورية</h3>
          <span className="text-xs text-slate-400 mr-auto">
            الإعدادات الحالية (غير المحفوظة) ستُطبَّق على التجربة
          </span>
        </div>

        <textarea
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
          rows={3}
          placeholder="اكتب نصاً هنا للاستماع إليه..."
          className="w-full bg-slate-800 text-white placeholder-slate-500 border border-slate-700
            rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500
            resize-none"
        />

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleTest}
            disabled={!testText.trim()}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
              testing
                ? "bg-red-500 hover:bg-red-600 text-white"
                : "bg-green-500 hover:bg-green-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
          >
            {testing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> إيقاف</>
            ) : (
              <><Play className="w-4 h-4" /> استمع الآن</>
            )}
          </button>

          <div className="text-xs text-slate-400 flex gap-4">
            <span>
              🎙️ <span className="text-slate-300">
                {ARABIC_VOICES.find(v => v.value === settings.voice)?.label ?? settings.voice}
              </span>
            </span>
            <span>⚡ <span className="text-slate-300">{settings.rate}</span></span>
            <span>🎵 <span className="text-slate-300">{settings.pitch}</span></span>
          </div>
        </div>
      </div>

      {/* Bottom save button (convenience duplicate) */}
      <div className="flex justify-end pb-8">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all shadow-sm
            ${saveStatus === "success"
              ? "bg-green-500 text-white"
              : "bg-slate-900 text-white hover:bg-slate-700"
            }`}
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> جاري الحفظ...</>
          ) : saveStatus === "success" ? (
            <><CheckCircle2 className="w-4 h-4" /> تم الحفظ بنجاح!</>
          ) : (
            <><Save className="w-4 h-4" /> حفظ جميع الإعدادات</>
          )}
        </button>
      </div>
    </div>
  );
}
