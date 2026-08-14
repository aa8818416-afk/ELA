"use client";

import { useState } from "react";
import { Wallet, Eye, EyeOff, ArrowUpRight } from "lucide-react";
import Link from "next/link";

interface DistributorWalletCardProps {
  walletBalance: number;
  totalUnpaidSales: number;
  completedThisMonthCount: number;
  farmersCount: number;
}

export default function DistributorWalletCard({
  walletBalance,
  totalUnpaidSales,
  completedThisMonthCount,
  farmersCount,
}: DistributorWalletCardProps) {
  const [showBalance, setShowBalance] = useState(false);

  const formattedBalance = Math.round(walletBalance).toLocaleString("ar-EG");
  const formattedUnpaid = Math.round(totalUnpaidSales).toLocaleString("ar-EG");
  const formattedCompleted = (completedThisMonthCount || 0).toLocaleString("ar-EG");
  const formattedFarmers = (farmersCount || 0).toLocaleString("ar-EG");

  return (
    <div className="lg:col-span-2 bg-gradient-to-br from-emerald-800 via-emerald-900 to-teal-950 text-white rounded-3xl p-6 border border-emerald-700/80 shadow-md relative overflow-hidden flex flex-col justify-between">
      <div className="absolute top-0 left-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl -ml-20 -mt-20 pointer-events-none"></div>

      <div className="relative z-10 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-200 font-bold bg-emerald-700/60 border border-emerald-500/40 px-3 py-1 rounded-full">
              <Wallet className="w-3 h-3 text-emerald-300" />
              محفظة الأرباح التراكمية
            </span>

            {/* Privacy Eye Toggle */}
            <button
              type="button"
              onClick={() => setShowBalance(!showBalance)}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300 hover:text-white bg-emerald-800/80 hover:bg-emerald-700 border border-emerald-600/50 px-2.5 py-1 rounded-full transition-all shadow-2xs cursor-pointer active:scale-95"
              title={showBalance ? "إخفاء الرصيد" : "إظهار الرصيد"}
            >
              {showBalance ? (
                <>
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>إخفاء</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  <span>كشف الرصيد</span>
                </>
              )}
            </button>
          </div>

          <h3 className="text-3xl sm:text-4xl font-black font-mono mt-3 tracking-tight">
            {showBalance ? (
              <>
                {formattedBalance}{" "}
                <span className="text-sm font-normal text-emerald-200">ج.م</span>
              </>
            ) : (
              <span className="tracking-widest text-emerald-300 select-none">••••••••</span>
            )}
          </h3>
          <p className="text-xs text-emerald-100/90 mt-1">
            عمولاتك المعتمدة الجاهزة للصرف من إدارة ELA (ال اي)
          </p>
        </div>

        <div className="text-left">
          <Link
            href="/distributor/deliveries"
            className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-100 text-emerald-900 font-bold text-xs px-4 py-2.5 rounded-xl border border-white shadow-xs transition-all active:scale-95"
          >
            تصفية الحسابات
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <div className="relative z-10 mt-6 pt-4 border-t border-emerald-700/60 grid grid-cols-3 gap-3 text-center">
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-2.5 border border-white/10">
          <p className="text-[10px] text-emerald-200 font-medium">مبيعات لم تُسدد</p>
          <p className="text-sm font-black font-mono mt-0.5 text-white">
            {formattedUnpaid} <span className="text-[10px] font-normal">ج.م</span>
          </p>
        </div>
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-2.5 border border-white/10">
          <p className="text-[10px] text-emerald-200 font-medium">المكتملة هذا الشهر</p>
          <p className="text-sm font-black font-mono mt-0.5 text-white">
            {formattedCompleted} طلب
          </p>
        </div>
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-2.5 border border-white/10">
          <p className="text-[10px] text-emerald-200 font-medium">إجمالي المزارعين</p>
          <p className="text-sm font-black font-mono mt-0.5 text-amber-300">
            {formattedFarmers} مزارع
          </p>
        </div>
      </div>
    </div>
  );
}
