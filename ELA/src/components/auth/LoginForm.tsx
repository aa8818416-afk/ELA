"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";

export default function LoginForm() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    // Basic validation
    if (password.length < 6) {
      setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل.");
      setIsLoading(false);
      return;
    }

    try {
      if (isSignUp) {
        // ── Sign Up Flow ──────────────────────────────────────────────────
        // NOTE: Profile creation is handled automatically by a DB Trigger.
        // We do NOT insert into profiles here to avoid RLS conflicts.
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // Pass the role as metadata — the DB trigger will read it
            data: { role: "farmer" },
          },
        });

        if (authError) {
          console.error("[LoginForm] SignUp error:", authError.message);
          // Provide specific, helpful Arabic error messages
          if (authError.message.includes("already registered") || authError.message.includes("already been registered")) {
            setError("هذا البريد الإلكتروني مسجل مسبقاً. جرب تسجيل الدخول بدلاً من ذلك.");
          } else if (authError.message.includes("Password should be")) {
            setError("كلمة المرور ضعيفة جداً. يجب أن تكون 6 أحرف على الأقل.");
          } else if (authError.message.includes("Invalid email")) {
            setError("البريد الإلكتروني غير صحيح. يرجى التحقق منه.");
          } else {
            setError("تعذر إنشاء الحساب. يرجى المحاولة مرة أخرى.");
          }
          setIsLoading(false);
          return;
        }

        // Check if email confirmation is required
        if (data.user && !data.session) {
          // Email confirmation is ON — user needs to confirm
          setSuccessMessage("تم إرسال رابط التأكيد إلى بريدك الإلكتروني. يرجى مراجعة بريدك لتفعيل الحساب.");
          setIsLoading(false);
          return;
        }

        // Email confirmation is OFF — session is ready, redirect
        if (data.session) {
          router.refresh();
          return;
        }

      } else {
        // ── Login Flow ────────────────────────────────────────────────────
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (authError) {
          console.error("[LoginForm] Auth error:", authError.message);
          if (authError.message.includes("Email not confirmed")) {
            setError("بريدك الإلكتروني لم يتم تأكيده بعد. يرجى مراجعة بريدك الإلكتروني والضغط على رابط التأكيد.");
          } else if (authError.message.includes("Invalid login credentials")) {
            setError("البريد الإلكتروني أو كلمة المرور غير صحيحة. يرجى المحاولة مرة أخرى.");
          } else if (authError.message.includes("Too many requests")) {
            setError("تم تجاوز الحد المسموح من المحاولات. يرجى الانتظار قليلاً ثم المحاولة مجدداً.");
          } else {
            setError("فشل تسجيل الدخول. يرجى المحاولة مرة أخرى.");
          }
          setIsLoading(false);
          return;
        }

        router.refresh();
      }
    } catch (err) {
      console.error("[LoginForm] Unexpected error:", err);
      setError("حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى لاحقاً.");
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold text-white mb-6 text-center">
        {isSignUp ? "إنشاء حساب كمزارع" : "تسجيل الدخول"}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* Email Field */}
        <div className="space-y-2">
          <label htmlFor="email" className="block text-sm font-medium text-slate-300">
            البريد الإلكتروني
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@email.com"
            required
            autoComplete="email"
            dir="ltr"
            className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50 transition-all"
          />
        </div>

        {/* Password Field */}
        <div className="space-y-2">
          <label htmlFor="password" className="block text-sm font-medium text-slate-300">
            كلمة المرور
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              dir="ltr"
              className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50 transition-all pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {isSignUp && (
            <p className="text-xs text-slate-500">يجب أن تكون كلمة المرور 6 أحرف على الأقل</p>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div
            role="alert"
            className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm flex items-start gap-2"
          >
            <span className="mt-0.5 shrink-0">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Success Message */}
        {successMessage && (
          <div
            role="status"
            className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-green-300 text-sm flex items-start gap-2"
          >
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Submit Button */}
        <button
          id="login-submit-btn"
          type="submit"
          disabled={isLoading}
          className="w-full bg-green-600 hover:bg-green-500 disabled:bg-green-900 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-sm transition-all duration-200 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{isSignUp ? "جاري إنشاء الحساب..." : "جاري تسجيل الدخول..."}</span>
            </>
          ) : (
            isSignUp ? "إنشاء حساب" : "تسجيل الدخول"
          )}
        </button>

        {/* Toggle Login/SignUp */}
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
              setSuccessMessage(null);
            }}
            className="text-sm text-green-400 hover:text-green-300 transition-colors"
          >
            {isSignUp
              ? "لديك حساب بالفعل؟ تسجيل الدخول"
              : "ليس لديك حساب؟ إنشاء حساب كمزارع"}
          </button>
        </div>
      </form>
    </div>
  );
}
