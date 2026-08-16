"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  CheckSquare,
  MoreHorizontal,
  Package,
  ScanLine,
  LogOut,
  Wallet,
  Eye,
  EyeOff,
  X,
  ChevronLeft,
} from "lucide-react";
import { signOut } from "@/app/actions/auth";

const mainNavItems = [
  { name: "الرئيسية", href: "/distributor", icon: LayoutDashboard },
  { name: "الفلاحين", href: "/distributor/farmers", icon: Users },
  { name: "طلب فوري", href: "/distributor/orders", icon: ShoppingCart },
  { name: "التسليمات", href: "/distributor/deliveries", icon: CheckSquare },
];

const secondaryNavItems = [
  { name: "دليل المنتجات بالجملة", href: "/distributor/products", icon: Package, desc: "الأسعار وهوامش العمولات" },
  { name: "طبيب المحاصيل والآفات", href: "/distributor/scanner", icon: ScanLine, desc: "تشخيص ميداني بالذكاء الاصطناعي" },
];

interface DistributorMobileNavProps {
  distributorName?: string;
  walletBalance?: number;
}

export default function DistributorMobileNav({
  distributorName = "الموزع",
  walletBalance = 0,
}: DistributorMobileNavProps) {
  const pathname = usePathname();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showBalance, setShowBalance] = useState(false);

  const handleLogout = async () => {
    if (confirm("هل أنت متأكد من أنك تريد الخروج من هذا الحساب؟")) {
      await signOut();
    }
  };

  const formattedBalance = Math.round(walletBalance).toLocaleString("ar-EG");
  const isSecondaryActive = secondaryNavItems.some((item) => pathname === item.href);

  return (
    <>
      {/* Bottom Navigation Bar on Mobile (< lg) */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/97 backdrop-blur-xl border-t border-slate-200/90 shadow-lg"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        dir="rtl"
      >
        <div className="max-w-lg mx-auto flex items-center justify-around">
          {mainNavItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsDrawerOpen(false)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-all active:scale-90 relative ${
                  isActive ? "text-emerald-700 font-bold" : "text-slate-400 hover:text-slate-700 font-medium"
                }`}
                style={{ minHeight: "60px", paddingTop: "10px", paddingBottom: "10px" }}
              >
                {isActive && (
                  <span className="absolute inset-x-2 top-1.5 h-8 bg-emerald-50 rounded-xl border border-emerald-200/60" />
                )}
                <item.icon
                  className={`relative w-5 h-5 transition-transform duration-200 ${
                    isActive ? "scale-110 text-emerald-700" : "scale-100 text-slate-500"
                  }`}
                />
                <span className={`relative text-[10px] leading-tight ${isActive ? "text-emerald-800 font-bold" : "text-slate-500"}`}>
                  {item.name}
                </span>
              </Link>
            );
          })}

          {/* More Button (Drawer Trigger) */}
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-all active:scale-90 relative ${
              isSecondaryActive || isDrawerOpen ? "text-emerald-700 font-bold" : "text-slate-400 hover:text-slate-700 font-medium"
            }`}
            style={{ minHeight: "60px", paddingTop: "10px", paddingBottom: "10px" }}
          >
            {(isSecondaryActive || isDrawerOpen) && (
              <span className="absolute inset-x-2 top-1.5 h-8 bg-emerald-50 rounded-xl border border-emerald-200/60" />
            )}
            <MoreHorizontal
              className={`relative w-5 h-5 transition-transform duration-200 ${
                isSecondaryActive || isDrawerOpen ? "scale-110 text-emerald-700" : "scale-100 text-slate-500"
              }`}
            />
            <span className={`relative text-[10px] leading-tight ${isSecondaryActive || isDrawerOpen ? "text-emerald-800 font-bold" : "text-slate-500"}`}>
              المزيد
            </span>
          </button>
        </div>
      </nav>

      {/* Mobile Drawer (Bottom Sheet) */}
      {isDrawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 backdrop-blur-xs animate-fadeIn" dir="rtl">
          <div
            className="w-full bg-white rounded-t-3xl border-t border-slate-200 p-5 space-y-4 shadow-2xl max-h-[85dvh] overflow-y-auto"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-800 flex items-center justify-center font-bold text-xs">
                  🌾
                </div>
                <div>
                  <h3 className="text-slate-900 font-black text-sm">خدمات وأدوات السفير</h3>
                  <p className="text-slate-500 text-[10px]">{distributorName}</p>
                </div>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors active:scale-90"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Wallet Balance Card in Drawer */}
            <div className="p-3.5 bg-gradient-to-br from-emerald-800 via-emerald-900 to-teal-950 text-white rounded-2xl border border-emerald-700 shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600/80 border border-emerald-400/40 text-white flex items-center justify-center shrink-0">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-emerald-200 font-bold">محفظة العمولات</span>
                    <button
                      type="button"
                      onClick={() => setShowBalance(!showBalance)}
                      className="text-emerald-300 hover:text-white p-0.5 rounded transition-colors"
                      title={showBalance ? "إخفاء" : "إظهار"}
                    >
                      {showBalance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-base font-black font-mono mt-0.5 text-white">
                    {showBalance ? (
                      <>
                        {formattedBalance} <span className="text-xs font-normal text-emerald-300">ج.م</span>
                      </>
                    ) : (
                      <span className="tracking-widest text-emerald-300 text-sm">••••••</span>
                    )}
                  </p>
                </div>
              </div>
              <Link
                href="/distributor/deliveries"
                onClick={() => setIsDrawerOpen(false)}
                className="text-xs bg-white text-emerald-900 font-bold px-3 py-1.5 rounded-xl border border-white active:scale-95 shadow-xs flex items-center gap-1"
              >
                <span>التحصيل</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Additional Nav Links */}
            <div className="space-y-2">
              {secondaryNavItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsDrawerOpen(false)}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all active:scale-[0.98] ${
                      isActive
                        ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-bold shadow-xs"
                        : "bg-slate-50 hover:bg-slate-100 border-slate-200/80 text-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isActive ? "bg-emerald-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>
                        <item.icon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-900">{item.name}</p>
                        <p className="text-[10px] text-slate-500">{item.desc}</p>
                      </div>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-slate-400" />
                  </Link>
                );
              })}
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-all active:scale-[0.98]"
            >
              <LogOut className="w-4 h-4" />
              <span>تسجيل الخروج من الحساب</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
