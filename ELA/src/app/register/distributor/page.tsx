import type { Metadata } from "next";
import DistributorRegisterForm from "@/components/auth/DistributorRegisterForm";

export const metadata: Metadata = {
  title: "تسجيل موزع جديد | منصة ELA",
  description: "انضم إلى شبكة موزعي منصة ELA الزراعية في مصر",
};

export default function DistributorRegisterPage() {
  return (
    <main
      className="min-h-screen bg-gradient-to-br from-green-950 via-emerald-900 to-green-900 flex items-center justify-center p-4"
      dir="rtl"
    >
      <div className="w-full max-w-lg">
        {/* العلامة التجارية */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-green-500/20 border border-green-500/30 mb-3">
            <span className="text-2xl">🌱</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">انضم كموزع معتمد</h1>
          <p className="text-green-300 text-sm">أكمل بياناتك وانتظر موافقة الإدارة</p>
        </div>

        {/* بطاقة النموذج */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
          <DistributorRegisterForm />
        </div>

        <p className="text-center text-green-400/60 text-xs mt-6">
          © 2025 منصة ELA — جميع الحقوق محفوظة
        </p>
      </div>
    </main>
  );
}
