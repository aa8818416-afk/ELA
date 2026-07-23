"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Eye, EyeOff, Loader2, CheckCircle2, Clock, Wheat, Truck } from "lucide-react";

type Tab = "distributor" | "farmer";

export default function LoginForm() {
  const router = useRouter();
  const supabase = createClient();

  // === تحكم التبويبات ===
  const [activeTab, setActiveTab] = useState<Tab>("distributor");

  // === حالة الموزع ===
  const [distEmail, setDistEmail] = useState("");
  const [distPassword, setDistPassword] = useState("");
  const [showDistPassword, setShowDistPassword] = useState(false);
  const [distLoading, setDistLoading] = useState(false);
  const [distError, setDistError] = useState<string | null>(null);
  const [distPending, setDistPending] = useState(false);

  // === حالة الفلاح ===
  const [farmerPhone, setFarmerPhone] = useState("");
  const [farmerPin, setFarmerPin] = useState("");
  const [farmerLoading, setFarmerLoading] = useState(false);
  const [farmerError, setFarmerError] = useState<string | null>(null);

  // ====================================================
  // تسجيل دخول الموزع
  // ====================================================
  async function handleDistributorLogin(e: React.FormEvent) {
    e.preventDefault();
    setDistLoading(true);
    setDistError(null);
    setDistPending(false);

    try {
      const inputVal = distEmail.trim();
      // إذا أدخل الموزع بريداً إلكترونياً أو رقم هاتف
      let loginEmail = inputVal;

      // إذا كان الإدخال عبارة عن أرقام فقط (رقم هاتف)، نبحث عن البريد الإلكتروني المرتبط بالهاتف في جدول الملفات
      if (/^\d+$/.test(inputVal.replace(/[\s+-]/g, ""))) {
        const cleanPhone = inputVal.replace(/\D/g, "");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: profile } = await (supabase as any)
          .from("profiles")
          .select("id")
          .eq("phone", cleanPhone)
          .maybeSingle();

        if (profile?.id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: distData } = await (supabase as any)
            .from("distributors")
            .select("email")
            .eq("profile_id", profile.id)
            .maybeSingle();

          if (distData?.email) {
            loginEmail = distData.email;
          }
        }
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: distPassword,
      });

      if (authError) {
        if (authError.message.includes("Invalid login credentials")) {
          setDistError("البريد الإلكتروني/رقم الهاتف أو كلمة المرور غير صحيحة.");
        } else if (authError.message.includes("Too many requests")) {
          setDistError("تم تجاوز الحد المسموح من المحاولات. انتظر قليلاً ثم حاول مجدداً.");
        } else {
          setDistError("فشل تسجيل الدخول. يرجى المحاولة مرة أخرى.");
        }
        setDistLoading(false);
        return;
      }

      // فحص حالة الموزع (PENDING / APPROVED / REJECTED)
      const userRes = await supabase.auth.getUser();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: dist } = await (supabase as any)
        .from("distributors")
        .select("status")
        .eq("profile_id", userRes.data.user?.id ?? "")
        .maybeSingle();

      if (dist?.status === "PENDING_APPROVAL") {
        setDistPending(true);
        await supabase.auth.signOut();
        setDistLoading(false);
        return;
      }

      if (dist?.status === "REJECTED") {
        setDistError("تم رفض طلب تسجيلك. يرجى التواصل مع الإدارة لمعرفة التفاصيل.");
        await supabase.auth.signOut();
        setDistLoading(false);
        return;
      }

      // تسجيل الدخول بنجاح → توجيه للوحة الموزع
      router.refresh();
    } catch {
      setDistError("حدث خطأ غير متوقع. يرجى المحاولة مجدداً.");
      setDistLoading(false);
    }
  }

  // ====================================================
  // تسجيل دخول الفلاح (رقم الهاتف + PIN)
  // ====================================================
  async function handleFarmerLogin(e: React.FormEvent) {
    e.preventDefault();
    setFarmerLoading(true);
    setFarmerError(null);

    const phone = farmerPhone.trim();
    const pin = farmerPin.trim();

    if (!phone || !pin) {
      setFarmerError("يرجى إدخال رقم الهاتف والرمز السري.");
      setFarmerLoading(false);
      return;
    }

    if (pin.length < 4) {
      setFarmerError("الرمز السري يجب أن يكون 4 أرقام على الأقل.");
      setFarmerLoading(false);
      return;
    }

    try {
      // الفلاحون يسجلون باستخدام رقم الهاتف كـ email وهمي: phone@ela-farmer.internal
      const farmerEmail = `${phone.replace(/\D/g, "")}@ela-farmer.internal`;

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: farmerEmail,
        password: pin,
      });

      if (authError) {
        if (authError.message.includes("Invalid login credentials")) {
          setFarmerError("رقم الهاتف أو الرمز السري غير صحيح. تواصل مع موزعك للحصول على بيانات الدخول.");
        } else {
          setFarmerError("فشل تسجيل الدخول. تأكد من البيانات وحاول مرة أخرى.");
        }
        setFarmerLoading(false);
        return;
      }

      // تسجيل الدخول بنجاح → توجيه للوحة الفلاح
      router.refresh();
    } catch {
      setFarmerError("حدث خطأ غير متوقع. يرجى المحاولة مجدداً.");
      setFarmerLoading(false);
    }
  }

  // ====================================================
  // واجهة انتظار القبول
  // ====================================================
  if (distPending) {
    return (
      <div className="text-center space-y-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/30">
          <Clock className="w-10 h-10 text-amber-400" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-white mb-2">طلبك قيد المراجعة</h3>
          <p className="text-slate-400 text-sm leading-relaxed max-w-xs mx-auto">
            تم إرسال طلب تسجيلك كموزع إلى إدارة المنصة. سيتم مراجعة بياناتك وإخطارك بقرار القبول أو الرفض في أقرب وقت.
          </p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-amber-300 text-sm">
          🕐 متوسط وقت المراجعة: 24-48 ساعة
        </div>
        <button
          type="button"
          onClick={() => { setDistPending(false); setDistEmail(""); setDistPassword(""); }}
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors underline"
        >
          العودة لتسجيل الدخول
        </button>
      </div>
    );
  }

  // ====================================================
  // الواجهة الرئيسية
  // ====================================================
  return (
    <div className="w-full">
      {/* التبويبات */}
      <div className="flex mb-8 rounded-xl bg-white/5 border border-white/10 p-1">
        <button
          type="button"
          onClick={() => { setActiveTab("distributor"); setDistError(null); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeTab === "distributor"
              ? "bg-green-600 text-white shadow-lg shadow-green-900/40"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>الموزع</span>
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab("farmer"); setFarmerError(null); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeTab === "farmer"
              ? "bg-green-600 text-white shadow-lg shadow-green-900/40"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Wheat className="w-4 h-4" />
          <span>الفلاح</span>
        </button>
      </div>

      {/* ======================== تبويب الموزع ======================== */}
      {activeTab === "distributor" && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-6 text-center">
            تسجيل دخول الموزع
          </h2>

          <form onSubmit={handleDistributorLogin} className="space-y-5" noValidate>
            {/* البريد الإلكتروني أو رقم الهاتف */}
            <div className="space-y-1.5">
              <label htmlFor="dist-email" className="block text-sm font-medium text-slate-300">
                البريد الإلكتروني أو رقم الهاتف
              </label>
              <input
                id="dist-email"
                type="text"
                value={distEmail}
                onChange={(e) => setDistEmail(e.target.value)}
                placeholder="example@email.com أو 01xxxxxxxxx"
                required
                autoComplete="username"
                dir="ltr"
                className="w-full bg-white/5 border border-slate-600 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all"
              />
            </div>

            {/* كلمة المرور */}
            <div className="space-y-1.5">
              <label htmlFor="dist-password" className="block text-sm font-medium text-slate-300">
                كلمة المرور
              </label>
              <div className="relative">
                <input
                  id="dist-password"
                  type={showDistPassword ? "text" : "password"}
                  value={distPassword}
                  onChange={(e) => setDistPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  dir="ltr"
                  className="w-full bg-white/5 border border-slate-600 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowDistPassword((p) => !p)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                  aria-label={showDistPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                >
                  {showDistPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* خطأ */}
            {distError && (
              <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-300 text-sm flex items-start gap-2">
                <span>⚠️</span>
                <span>{distError}</span>
              </div>
            )}

            {/* زر الدخول */}
            <button
              id="distributor-login-btn"
              type="submit"
              disabled={distLoading}
              className="w-full bg-green-600 hover:bg-green-500 disabled:bg-green-900 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-sm transition-all duration-200 flex items-center justify-center gap-2"
            >
              {distLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /><span>جاري تسجيل الدخول...</span></>
              ) : "تسجيل الدخول"}
            </button>

            {/* رابط التسجيل كموزع جديد */}
            <div className="text-center mt-2">
              <a
                href="/register/distributor"
                className="text-sm text-green-400 hover:text-green-300 transition-colors"
              >
                ليس لديك حساب؟ سجل كموزع جديد
              </a>
            </div>
          </form>
        </div>
      )}

      {/* ======================== تبويب الفلاح ======================== */}
      {activeTab === "farmer" && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-2 text-center">
            تسجيل دخول الفلاح
          </h2>
          <p className="text-xs text-slate-400 text-center mb-6 leading-relaxed">
            بيانات الدخول تُعطى لك من قِبل موزعك المعتمد
          </p>

          <form onSubmit={handleFarmerLogin} className="space-y-5" noValidate>
            {/* رقم الهاتف */}
            <div className="space-y-1.5">
              <label htmlFor="farmer-phone" className="block text-sm font-medium text-slate-300">
                رقم الهاتف
              </label>
              <input
                id="farmer-phone"
                type="tel"
                value={farmerPhone}
                onChange={(e) => setFarmerPhone(e.target.value)}
                placeholder="01xxxxxxxxx"
                required
                inputMode="numeric"
                dir="ltr"
                className="w-full bg-white/5 border border-slate-600 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all tracking-widest"
              />
            </div>

            {/* الرمز السري (PIN) */}
            <div className="space-y-1.5">
              <label htmlFor="farmer-pin" className="block text-sm font-medium text-slate-300">
                الرمز السري (PIN)
              </label>
              <input
                id="farmer-pin"
                type="password"
                value={farmerPin}
                onChange={(e) => setFarmerPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
                required
                inputMode="numeric"
                maxLength={6}
                autoComplete="current-password"
                dir="ltr"
                className="w-full bg-white/5 border border-slate-600 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all tracking-widest text-center text-xl letter-spacing-8"
              />
              <p className="text-xs text-slate-500">الرمز السري مكون من 4-6 أرقام</p>
            </div>

            {/* خطأ */}
            {farmerError && (
              <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-300 text-sm flex items-start gap-2">
                <span>⚠️</span>
                <span>{farmerError}</span>
              </div>
            )}

            {/* زر الدخول */}
            <button
              id="farmer-login-btn"
              type="submit"
              disabled={farmerLoading}
              className="w-full bg-green-600 hover:bg-green-500 disabled:bg-green-900 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-sm transition-all duration-200 flex items-center justify-center gap-2"
            >
              {farmerLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /><span>جاري تسجيل الدخول...</span></>
              ) : "دخول"}
            </button>

            {/* توضيح لا تسجيل عام */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-400 leading-relaxed">
                🌾 حسابات الفلاحين تُنشأ وتُدار عن طريق الموزع المعتمد فقط.
                <br />
                إذا لم يكن لديك حساب، تواصل مع موزعك.
              </p>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
