import type { Metadata } from "next";
import LoginForm from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "تسجيل الدخول | منصة ELA",
  description: "تسجيل الدخول إلى منصة ELA الزراعية",
};

/**
 * Login page — Server Component wrapper.
 * The actual form is a Client Component (LoginForm) to handle state.
 * Middleware redirects authenticated users away from this page automatically.
 */
export default function LoginPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-green-950 via-emerald-900 to-green-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-500/20 border border-green-500/30 mb-4">
            <span className="text-3xl">🌱</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">إيلا</h1>
          <p className="text-green-300 text-sm">منصة الزراعة الاجتماعية في مصر</p>
        </div>

        {/* Login Card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
          <h2 className="text-xl font-semibold text-white mb-6 text-center">
            تسجيل الدخول
          </h2>
          <LoginForm />
        </div>

        <p className="text-center text-green-400/60 text-xs mt-6">
          © 2025 منصة ELA — جميع الحقوق محفوظة
        </p>
      </div>
    </main>
  );
}
