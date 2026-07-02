import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "تطبيق المزارع | منصة ELA",
  description: "اشتري مبيداتك بسعر أقل مع جيرانك - منصة ELA",
};

const navItems = [
  { href: "/farmer", icon: "🏠", label: "الرئيسية" },
  { href: "/farmer/scanner", icon: "🌿", label: "طبيب المحاصيل" },
  { href: "/farmer/orders", icon: "📦", label: "طلباتي" },
];

export default function FarmerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Top Header */}
      <header className="bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50 sticky top-0 z-50">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-sm">
              🌾
            </div>
            <span className="text-white font-bold text-lg">إيلا</span>
          </div>
          <span className="text-emerald-400 text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full">
            مزارع
          </span>
        </div>
      </header>

      {/* Page Content */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 pb-28 pt-6">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800 safe-area-pb">
        <div className="max-w-lg mx-auto flex items-stretch">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1 flex flex-col items-center justify-center py-3 gap-1 text-slate-400 hover:text-emerald-400 transition-colors active:scale-95"
            >
              <span className="text-xl">{item.icon}</span>
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
