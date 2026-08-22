import type { Metadata } from "next";
import Sidebar from "@/components/distributor/Sidebar";
import DistributorMobileNav from "@/components/distributor/DistributorMobileNav";
import { createClient } from "@/utils/supabase/server";

export const metadata: Metadata = {
  title: "بوابة الموزع | منصة ELA",
  description: "لوحة تحكم الموزع - منصة ELA (ال اي)",
};

export default async function DistributorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let distributorName = "الموزع";
  let walletBalance = 0;

  if (user) {
    const [profileRes, distRes] = await Promise.allSettled([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("distributors")
        .select("wallet_balance")
        .eq("profile_id", user.id)
        .maybeSingle(),
    ]);

    const profile = profileRes.status === "fulfilled" ? profileRes.value.data : null;
    const dist = distRes.status === "fulfilled" ? distRes.value.data : null;

    if (profile?.full_name) {
      distributorName = profile.full_name;
    }

    if (dist?.wallet_balance) {
      walletBalance = Number(dist.wallet_balance) || 0;
    }
  }

  return (
    <div className="flex min-h-screen bg-[#f8faf9] text-slate-900 font-sans antialiased" dir="rtl">
      {/* Desktop Sidebar - hidden on mobile, visible on lg and up */}
      <div className="hidden lg:block fixed top-0 bottom-0 right-0 z-50">
        <Sidebar distributorName={distributorName} walletBalance={walletBalance} />
      </div>

      {/* Main Content Area - padded right only on lg */}
      <div className="flex-1 lg:pr-64 flex flex-col min-h-screen w-full">
        {/* Mobile + Desktop Topbar */}
        <header className="h-14 sm:h-16 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl flex items-center justify-between px-4 sm:px-8 sticky top-0 z-40 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white font-bold text-sm shadow-xs flex-shrink-0">
              🌾
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-slate-900 font-black text-base sm:text-lg tracking-wider font-mono">ELA</span>
              <span className="text-[9px] sm:text-[10px] text-emerald-700 font-bold -mt-0.5 tracking-tight">سفير القرية</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="text-left hidden xs:block">
              <p className="text-slate-900 text-xs font-bold truncate max-w-[120px] sm:max-w-none">{distributorName}</p>
              <p className="text-[10px] text-slate-500">الموزع المعتمد</p>
            </div>
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800 font-bold text-xs sm:text-sm shadow-xs">
              👨‍💼
            </div>
          </div>
        </header>

        {/* Page Content with safe padding for bottom nav on mobile */}
        <main className="p-3.5 sm:p-6 md:p-8 flex-1 max-w-7xl w-full mx-auto pb-24 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar & Mobile Drawer */}
      <DistributorMobileNav distributorName={distributorName} walletBalance={walletBalance} />
    </div>
  );
}

