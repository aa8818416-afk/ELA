"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions/auth";

const navItems = [
  { href: "/farmer", icon: "🏠", label: "الرئيسية" },
  { href: "/farmer/scanner", icon: "🌿", label: "طبيب المحاصيل" },
  { href: "/farmer/weather", icon: "🌤️", label: "الطقس" },
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

  const isWidePage = pathname?.startsWith("/farmer/scanner") || pathname?.startsWith("/farmer/chat");

  return (
    <div className={`min-h-screen bg-[#f8faf9] text-slate-900 flex flex-col font-sans ${isWidePage ? "h-[100dvh] max-h-[100dvh] overflow-hidden" : ""}`}>
      {/* Top Header */}
      <header className="bg-white/95 backdrop-blur-xl border-b border-slate-200/80 sticky top-0 z-50 shadow-sm shrink-0">
        <div className={`mx-auto px-4 flex items-center justify-between ${isWidePage ? "max-w-7xl" : "max-w-lg md:max-w-2xl"}`} style={{ height: '56px' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-base shadow-sm shadow-emerald-900/20 text-white flex-shrink-0">
              🌾
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-slate-900 font-black text-lg tracking-wider font-mono">ELA</span>
              <span className="text-[10px] text-emerald-700 font-bold -mt-0.5 tracking-tight">(ال اي)</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-emerald-800 text-xs font-bold bg-emerald-100/70 border border-emerald-200 px-2.5 py-1 rounded-full hidden xs:inline-flex">
              مزارع
            </span>
            {/* Logout — touch target 44×44 */}
            <button
              onClick={handleLogout}
              className="w-11 h-11 flex items-center justify-center hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-xl transition-all active:scale-90 active:bg-red-50"
              title="تسجيل الخروج"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Page Content — pb accounts for nav + iOS home indicator */}
      <main className={`flex-1 min-h-0 mx-auto w-full ${isWidePage ? "max-w-7xl px-1 sm:px-3 pt-1 pb-16 flex flex-col overflow-hidden" : "px-2 sm:px-4 pt-2 sm:pt-4 pb-[88px] max-w-lg md:max-w-2xl lg:max-w-4xl"}`}>
        {children}
      </main>

      {/* Bottom Navigation — min 60px tap area per item */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-white/97 backdrop-blur-xl border-t border-slate-200/90 shadow-lg"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="max-w-lg md:max-w-2xl mx-auto flex">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-all active:scale-90 relative
                  ${isActive ? "text-emerald-700" : "text-slate-400 hover:text-slate-700"}
                `}
                style={{ minHeight: '60px', paddingTop: '10px', paddingBottom: '10px' }}
              >
                {/* Active background pill */}
                {isActive && (
                  <span className="absolute inset-x-2 top-1.5 h-8 bg-emerald-50 rounded-xl border border-emerald-200/60" />
                )}
                <span
                  className={`relative text-xl transition-transform duration-200 ${isActive ? "scale-110" : "scale-100"}`}
                >
                  {item.icon}
                </span>
                <span
                  className={`relative text-[10px] font-bold leading-tight ${isActive ? "text-emerald-700" : "text-slate-500"}`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
