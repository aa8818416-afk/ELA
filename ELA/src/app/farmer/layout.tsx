"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions/auth";

const navItems = [
  { href: "/farmer", icon: "🏠", label: "الرئيسية" },
  { href: "/farmer/scanner", icon: "🌿", label: "طبيب المحاصيل" },
  { href: "/farmer/weather", icon: "🌤️", label: "الطقس والبيئة" },
  { href: "/farmer/products", icon: "🛒", label: "المنتجات" },
  { href: "/farmer/orders", icon: "📦", label: "طلباتي" },
];

export default function FarmerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();

  const handleLogout = async () => {
    if (confirm("هل أنت متأكد من أنك تريد الخروج من هذا الحساب؟")) {
      await signOut();
    }
  };

  return (
    <div className="min-h-screen bg-[#f8faf9] text-slate-900 flex flex-col font-sans">
      {/* Top Header */}
      <header className="bg-white/90 backdrop-blur-xl border-b border-slate-200/80 sticky top-0 z-50 shadow-xs">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-base shadow-sm shadow-emerald-900/20 text-white">
              🌾
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-slate-900 font-black text-lg tracking-wider font-mono">ELA</span>
              <span className="text-[10px] text-emerald-700 font-bold -mt-0.5 tracking-tight">(ال اي)</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-emerald-800 text-xs font-bold bg-emerald-100/70 border border-emerald-200 px-2.5 py-1 rounded-full">
              مزارع
            </span>
            <button
              onClick={handleLogout}
              className="p-1.5 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-lg transition-all active:scale-95"
              title="تسجيل الخروج"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Page Content */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 pb-28 pt-5">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-slate-200/90 shadow-lg safe-area-pb">
        <div className="max-w-lg mx-auto flex justify-around">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-all active:scale-95 ${
                  isActive ? "text-emerald-700 font-bold" : "text-slate-500 hover:text-slate-800 font-medium"
                }`}
              >
                <span className={`text-xl transition-transform ${isActive ? "scale-110" : ""}`}>{item.icon}</span>
                <span className="text-[11px]">{item.label}</span>
                {isActive && <span className="w-1 h-1 rounded-full bg-emerald-600 mt-0.5"></span>}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
