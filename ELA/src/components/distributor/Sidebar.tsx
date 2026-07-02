"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  ScanLine,
  CheckSquare,
  LogOut,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

const navItems = [
  { name: "الرئيسية", href: "/distributor", icon: LayoutDashboard },
  { name: "إدارة الفلاحين", href: "/distributor/farmers", icon: Users },
  { name: "طلب جديد", href: "/distributor/orders", icon: ShoppingCart },
  { name: "فحص المحاصيل", href: "/distributor/scanner", icon: ScanLine },
  { name: "التسليمات والتحصيل", href: "/distributor/deliveries", icon: CheckSquare },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  };

  return (
    <aside className="w-64 bg-slate-900 border-l border-slate-800 flex flex-col h-full min-h-screen">
      {/* Brand */}
      <div className="p-6 border-b border-slate-800 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-xl">
          🚚
        </div>
        <div>
          <h2 className="text-white font-bold text-lg">بوابة الموزع</h2>
          <p className="text-amber-500/80 text-xs">منصة ELA</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                isActive
                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <item.icon className={`w-5 h-5 ${isActive ? "text-amber-400" : ""}`} />
              <span className="font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer / Logout */}
      <div className="p-4 border-t border-slate-800">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">تسجيل الخروج</span>
        </button>
      </div>
    </aside>
  );
}
