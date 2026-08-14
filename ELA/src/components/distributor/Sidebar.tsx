"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  ScanLine,
  CheckSquare,
  LogOut,
  Package,
  Wallet,
  Eye,
  EyeOff,
} from "lucide-react";
import { signOut } from "@/app/actions/auth";

const navItems = [
  { name: "الرئيسية والإحصائيات", href: "/distributor", icon: LayoutDashboard },
  { name: "إدارة الفلاحين", href: "/distributor/farmers", icon: Users },
  { name: "طلب جديد وشراء جماعي", href: "/distributor/orders", icon: ShoppingCart },
  { name: "دليل المنتجات بالجملة", href: "/distributor/products", icon: Package },
  { name: "طبيب المحاصيل والآفات", href: "/distributor/scanner", icon: ScanLine },
  { name: "التسليمات والتحصيل", href: "/distributor/deliveries", icon: CheckSquare },
];

interface SidebarProps {
  distributorName?: string;
  walletBalance?: number;
}

export default function Sidebar({ distributorName = "الموزع", walletBalance = 0 }: SidebarProps) {
  const pathname = usePathname();
  const [showBalance, setShowBalance] = useState(false);

  const handleLogout = async () => {
    if (confirm("هل أنت متأكد من أنك تريد الخروج من هذا الحساب؟")) {
      await signOut();
    }
  };

  const formattedBalance = Math.round(walletBalance).toLocaleString("ar-EG");

  return (
    <aside className="w-64 bg-white border-l border-slate-200/90 flex flex-col h-full min-h-screen shadow-xs">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white text-lg shadow-sm border border-emerald-600">
            🌾
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-slate-900 font-black text-xl tracking-wider font-mono">ELA</span>
            <span className="text-[10px] text-emerald-700 font-bold -mt-0.5 tracking-tight">(ال اي)</span>
          </div>
          <span className="mr-auto text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
            موزع
          </span>
        </div>

        {/* Addition from Model B: Wallet Balance Chip with Privacy Eye Toggle */}
        <div className="mt-3 p-2.5 bg-emerald-50/80 border border-emerald-200/80 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <Wallet className="w-3.5 h-3.5" />
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-emerald-800 font-bold">محفظة الأرباح</span>
                <button
                  type="button"
                  onClick={() => setShowBalance(!showBalance)}
                  className="text-emerald-700 hover:text-emerald-950 p-0.5 rounded transition-colors"
                  title={showBalance ? "إخفاء الرصيد" : "إظهار الرصيد"}
                >
                  {showBalance ? (
                    <EyeOff className="w-3 h-3" />
                  ) : (
                    <Eye className="w-3 h-3" />
                  )}
                </button>
              </div>
              <p className="text-xs font-black text-emerald-950 font-mono mt-0.5">
                {showBalance ? (
                  <>
                    {formattedBalance}{" "}
                    <span className="text-[10px] font-normal text-emerald-700">ج.م</span>
                  </>
                ) : (
                  <span className="tracking-widest text-emerald-800 text-sm select-none">••••••</span>
                )}
              </p>
            </div>
          </div>
          <span className="text-[9px] bg-emerald-200/70 text-emerald-900 font-bold px-1.5 py-0.5 rounded-md">
            جاهزة
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                isActive
                  ? "bg-emerald-600 text-white border-emerald-700 shadow-xs"
                  : "bg-white text-slate-700 border-slate-200/60 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900"
              }`}
            >
              <item.icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-500"}`} />
              <span className="leading-none">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer / User Profile & Logout */}
      <div className="p-4 border-t border-slate-100 space-y-2 bg-slate-50/50">
        <div className="flex items-center gap-2.5 p-2 bg-white rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-800 flex items-center justify-center font-bold text-xs">
            {distributorName[0] || "م"}
          </div>
          <div className="text-right leading-none min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-900 truncate">{distributorName}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">سفير القرية المعتمد</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl border border-red-200 transition-all active:scale-95 shadow-2xs"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </aside>
  );
}
