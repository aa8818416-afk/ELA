"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { EGYPT_LOCATIONS, getCenters } from "@/data/egyptLocations";
import SearchableSelect from "@/components/ui/SearchableSelect";
import LocationPicker from "@/components/ui/LocationPicker";
import { Loader2, CheckCircle2, ArrowRight, User, Mail, MapPin, Home, TreePine, Crop } from "lucide-react";

const GOVERNORATES = EGYPT_LOCATIONS.map((l) => l.governorate);

export default function DistributorRegisterForm() {
  const router = useRouter();
  const supabase = createClient();

  // معلومات الحساب
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // البيانات الشخصية
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  // العنوان الجغرافي
  const [governorate, setGovernorate] = useState("");
  const [center, setCenter] = useState("");
  const [mainRoad, setMainRoad] = useState("");
  const [villageName, setVillageName] = useState("");
  const [landmark, setLandmark] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  // معلومات الإشراف
  const [supervisedVillagesText, setSupervisedVillagesText] = useState("");
  const [totalAcres, setTotalAcres] = useState("");

  const [step, setStep] = useState(1); // 3 خطوات
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const centers = getCenters(governorate);

  // ================== تحقق من الخطوة الأولى ==================
  function validateStep1(): string | null {
    if (!fullName.trim()) return "الاسم الكامل مطلوب.";
    if (!email.trim() || !email.includes("@")) return "البريد الإلكتروني غير صحيح.";
    if (!phone.trim() || phone.length < 10) return "رقم الهاتف غير صحيح.";
    if (password.length < 8) return "كلمة المرور يجب أن تكون 8 أحرف على الأقل.";
    if (password !== confirmPassword) return "كلمتا المرور غير متطابقتان.";
    return null;
  }

  // ================== تحقق من الخطوة الثانية ==================
  function validateStep2(): string | null {
    if (!governorate) return "يرجى اختيار المحافظة.";
    if (!center) return "يرجى اختيار المركز.";
    if (!villageName.trim()) return "اسم القرية مطلوب.";
    if (!latitude || !longitude) return "يرجى تحديد موقعك الجغرافي (GPS) أولاً.";
    return null;
  }

  // ================== تحقق من الخطوة الثالثة ==================
  function validateStep3(): string | null {
    if (!supervisedVillagesText.trim()) return "يرجى إدخال القرى المشرف عليها.";
    if (!totalAcres || isNaN(Number(totalAcres)) || Number(totalAcres) <= 0) {
      return "يرجى إدخال إجمالي عدد الفدادين بشكل صحيح.";
    }
    return null;
  }

  function handleNextStep() {
    setError(null);
    if (step === 1) {
      const err = validateStep1();
      if (err) { setError(err); return; }
    }
    if (step === 2) {
      const err = validateStep2();
      if (err) { setError(err); return; }
    }
    setStep((s) => s + 1);
  }

  // ================== إرسال طلب التسجيل ==================
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const err = validateStep3();
    if (err) { setError(err); return; }

    setIsLoading(true);

    try {
      // 1. إنشاء حساب في Supabase Auth
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { role: "distributor", full_name: fullName, phone },
        },
      });

      if (signUpError) {
        if (signUpError.message.includes("already registered")) {
          setError("هذا البريد الإلكتروني مسجل مسبقاً. جرب تسجيل الدخول.");
        } else {
          setError("تعذر إنشاء الحساب: " + signUpError.message);
        }
        setIsLoading(false);
        return;
      }

      const userId = data.user?.id;
      if (!userId) {
        setError("حدث خطأ في إنشاء الحساب. يرجى المحاولة مرة أخرى.");
        setIsLoading(false);
        return;
      }

      // 2. إدراج ملف الموزع (يُنشأ تلقائياً في profiles عبر DB Trigger)
      //    وننتظر قليلاً لإتاحة الوقت للتريجر لينفذ
      await new Promise((r) => setTimeout(r, 800));

      const supervisedVillages = supervisedVillagesText
        .split(/[,،\n]/)
        .map((v) => v.trim())
        .filter(Boolean);

      const { error: distError } = await (supabase as any).from("distributors").insert({
        profile_id: userId,
        full_name: fullName,
        email,
        governorate,
        center,
        main_road: mainRoad || null,
        village: villageName,
        landmark: landmark || null,
        latitude,
        longitude,
        supervised_villages: supervisedVillages,
        total_acres: Number(totalAcres),
        status: "PENDING_APPROVAL",
      });

      if (distError) {
        // إذا الصف موجود مسبقاً (من تريجر آخر)، نحدّثه
        if (distError.code === "23505") {
          await (supabase as any).from("distributors").update({
            full_name: fullName,
            email,
            governorate,
            center,
            main_road: mainRoad || null,
            village: villageName,
            landmark: landmark || null,
            latitude,
            longitude,
            supervised_villages: supervisedVillages,
            total_acres: Number(totalAcres),
            status: "PENDING_APPROVAL",
          }).eq("profile_id", userId);
        } else {
          setError("تعذر حفظ بياناتك: " + distError.message);
          setIsLoading(false);
          return;
        }
      }

      // 3. تسجيل الخروج — الموزع لا يدخل قبل القبول
      await supabase.auth.signOut();

      setDone(true);
    } catch {
      setError("حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.");
    } finally {
      setIsLoading(false);
    }
  }

  // =================== شاشة النجاح ===================
  if (done) {
    return (
      <div className="text-center space-y-6 py-4">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/10 border border-green-500/30">
          <CheckCircle2 className="w-10 h-10 text-green-400" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-white mb-2">تم إرسال الطلب بنجاح!</h3>
          <p className="text-slate-400 text-sm leading-relaxed max-w-xs mx-auto">
            تم استلام بيانات تسجيلك وسيتم مراجعتها من قِبل إدارة المنصة. ستتلقى إشعاراً بقرار القبول خلال 24-48 ساعة.
          </p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-amber-300 text-sm">
          🕐 طلبك الآن قيد المراجعة
        </div>
        <button
          onClick={() => router.push("/login")}
          className="text-sm text-green-400 hover:text-green-300 transition-colors underline"
        >
          العودة لصفحة تسجيل الدخول
        </button>
      </div>
    );
  }

  // =================== مؤشر الخطوات ===================
  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-6">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
            s < step ? "bg-green-600 text-white" :
            s === step ? "bg-green-500 text-white ring-2 ring-green-400/40" :
            "bg-white/10 text-slate-400"
          }`}>
            {s < step ? "✓" : s}
          </div>
          {s < 3 && <div className={`w-8 h-0.5 ${s < step ? "bg-green-500" : "bg-white/10"}`} />}
        </div>
      ))}
    </div>
  );

  return (
    <div className="w-full space-y-5">
      <StepIndicator />

      {error && (
        <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-300 text-sm flex items-start gap-2">
          <span className="shrink-0 mt-0.5">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={step === 3 ? handleSubmit : (e) => { e.preventDefault(); handleNextStep(); }} className="space-y-4">

        {/* =================== الخطوة 1: البيانات الشخصية =================== */}
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <User className="w-4 h-4 text-green-400" /> البيانات الشخصية
            </h3>

            <div className="space-y-1.5">
              <label htmlFor="dist-reg-name" className="block text-sm font-medium text-slate-300">الاسم الكامل <span className="text-red-400">*</span></label>
              <input id="dist-reg-name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="محمد أحمد العيسوي" required className="w-full bg-white/5 border border-slate-600 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 transition-all" />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="dist-reg-email" className="block text-sm font-medium text-slate-300">البريد الإلكتروني <span className="text-red-400">*</span></label>
              <input id="dist-reg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@email.com" required dir="ltr" className="w-full bg-white/5 border border-slate-600 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 transition-all" />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="dist-reg-phone" className="block text-sm font-medium text-slate-300">رقم الهاتف <span className="text-red-400">*</span></label>
              <input id="dist-reg-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01xxxxxxxxx" inputMode="numeric" dir="ltr" className="w-full bg-white/5 border border-slate-600 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 transition-all" />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="dist-reg-pass" className="block text-sm font-medium text-slate-300">كلمة المرور <span className="text-red-400">*</span></label>
              <input id="dist-reg-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8 أحرف على الأقل" minLength={8} dir="ltr" className="w-full bg-white/5 border border-slate-600 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 transition-all" />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="dist-reg-pass2" className="block text-sm font-medium text-slate-300">تأكيد كلمة المرور <span className="text-red-400">*</span></label>
              <input id="dist-reg-pass2" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" dir="ltr" className="w-full bg-white/5 border border-slate-600 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 transition-all" />
            </div>
          </div>
        )}

        {/* =================== الخطوة 2: العنوان والموقع =================== */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-green-400" /> العنوان والموقع
            </h3>

            <SearchableSelect
              id="dist-reg-gov"
              label="المحافظة"
              required
              options={GOVERNORATES}
              value={governorate}
              onChange={(v) => { setGovernorate(v); setCenter(""); }}
              placeholder="اختر المحافظة..."
            />

            <SearchableSelect
              id="dist-reg-center"
              label="المركز"
              required
              options={centers}
              value={center}
              onChange={setCenter}
              placeholder={governorate ? "اختر المركز..." : "اختر المحافظة أولاً"}
              disabled={!governorate}
            />

            <div className="space-y-1.5">
              <label htmlFor="dist-reg-road" className="block text-sm font-medium text-slate-300 flex items-center gap-1.5"><Home className="w-3.5 h-3.5 text-slate-400" /> الطريق الرئيسي (من المركز للقرية)</label>
              <input id="dist-reg-road" type="text" value={mainRoad} onChange={(e) => setMainRoad(e.target.value)} placeholder="مثال: طريق الزقازيق - فاقوس" className="w-full bg-white/5 border border-slate-600 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 transition-all" />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="dist-reg-village" className="block text-sm font-medium text-slate-300">اسم القرية <span className="text-red-400">*</span></label>
              <input id="dist-reg-village" type="text" value={villageName} onChange={(e) => setVillageName(e.target.value)} placeholder="مثال: قرية نشاوي" required className="w-full bg-white/5 border border-slate-600 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 transition-all" />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="dist-reg-landmark" className="block text-sm font-medium text-slate-300">مكان مميز قريب (جامع / مدرسة / ...)</label>
              <input id="dist-reg-landmark" type="text" value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="مثال: أمام مسجد النور" className="w-full bg-white/5 border border-slate-600 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 transition-all" />
            </div>

            <LocationPicker
              onLocation={(lat, lng) => { setLatitude(lat); setLongitude(lng); }}
              latitude={latitude}
              longitude={longitude}
            />
          </div>
        )}

        {/* =================== الخطوة 3: بيانات الإشراف =================== */}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <TreePine className="w-4 h-4 text-green-400" /> معلومات الإشراف الزراعي
            </h3>

            <div className="space-y-1.5">
              <label htmlFor="dist-reg-villages" className="block text-sm font-medium text-slate-300">
                القرى المشرف عليها <span className="text-red-400">*</span>
              </label>
              <textarea
                id="dist-reg-villages"
                value={supervisedVillagesText}
                onChange={(e) => setSupervisedVillagesText(e.target.value)}
                placeholder={"اكتب كل قرية في سطر أو افصل بينها بفاصلة:\nقرية A\nقرية B\nقرية C"}
                rows={4}
                className="w-full bg-white/5 border border-slate-600 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 transition-all resize-none"
              />
              <p className="text-xs text-slate-500">افصل بين القرى بفاصلة أو سطر جديد</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="dist-reg-acres" className="block text-sm font-medium text-slate-300 flex items-center gap-1.5">
                <Crop className="w-3.5 h-3.5 text-slate-400" /> إجمالي الفدادين المشرف عليها (تقريباً) <span className="text-red-400">*</span>
              </label>
              <input
                id="dist-reg-acres"
                type="number"
                value={totalAcres}
                onChange={(e) => setTotalAcres(e.target.value)}
                placeholder="مثال: 500"
                min={1}
                inputMode="numeric"
                className="w-full bg-white/5 border border-slate-600 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 transition-all"
              />
            </div>

            {/* ملخص ما تم ملؤه */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2 text-sm">
              <p className="font-medium text-slate-300 mb-2">مراجعة سريعة:</p>
              <div className="flex justify-between text-slate-400"><span>الاسم:</span><span className="text-white font-medium">{fullName}</span></div>
              <div className="flex justify-between text-slate-400"><span>المحافظة:</span><span className="text-white font-medium">{governorate} — {center}</span></div>
              <div className="flex justify-between text-slate-400"><span>القرية:</span><span className="text-white font-medium">{villageName}</span></div>
              <div className="flex justify-between text-slate-400"><span>GPS:</span><span className="text-green-400 font-medium text-xs" dir="ltr">{latitude ? `${latitude.toFixed(4)}, ${longitude?.toFixed(4)}` : "لم يُحدد"}</span></div>
            </div>
          </div>
        )}

        {/* أزرار التنقل */}
        <div className="flex gap-3 pt-2">
          {step > 1 && (
            <button
              type="button"
              onClick={() => { setStep((s) => s - 1); setError(null); }}
              className="flex items-center gap-1.5 px-4 py-3 rounded-xl text-sm text-slate-300 border border-slate-600 hover:border-slate-400 transition-all"
            >
              <ArrowRight className="w-4 h-4" />
              السابق
            </button>
          )}
          <button
            id={step === 3 ? "distributor-register-submit-btn" : "distributor-register-next-btn"}
            type="submit"
            disabled={isLoading}
            className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-green-900 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-sm transition-all duration-200 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /><span>جاري الإرسال...</span></>
            ) : step === 3 ? (
              "📤 إرسال طلب التسجيل"
            ) : (
              "التالي"
            )}
          </button>
        </div>
      </form>

      <div className="text-center">
        <a href="/login" className="text-xs text-slate-400 hover:text-slate-200 transition-colors underline">
          لديك حساب؟ تسجيل الدخول
        </a>
      </div>
    </div>
  );
}
