import type { Metadata } from "next";
import Sidebar from "@/components/distributor/Sidebar";
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.full_name) {
      distributorName = profile.full_name;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dist } = await (supabase as any)
      .from("distributors")
      .select("wallet_balance")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (dist?.wallet_balance) {
      walletBalance = Number(dist.wallet_balance) || 0;
    }
  }

  return (
    <div className="flex min-h-screen bg-[#f8faf9] text-slate-900 font-sans antialiased" dir="rtl">
      {/* Sidebar - fixed on the right in RTL */}
      <div className="fixed top-0 bottom-0 right-0 z-50">
        <Sidebar distributorName={distributorName} walletBalance={walletBalance} />
      </div>
      
      {/* Main Content Area - padded to account for the 64 (16rem / 256px) sidebar */}
      <div className="flex-1 pr-64 flex flex-col min-h-screen">
        {/* Topbar */}
        <header className="h-16 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl flex items-center justify-between px-8 sticky top-0 z-40 shadow-xs">
          <div className="flex items-center gap-3">
            <h1 className="text-slate-900 font-bold text-base">بوابة سفير القرية</h1>
            <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
              ELA (ال اي)
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-left">
              <p className="text-slate-900 text-xs font-bold">مرحباً بك،</p>
              <p className="text-slate-500 text-xs">{distributorName}</p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800 font-bold text-sm shadow-xs">
              🌾
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-6 md:p-8 flex-1 max-w-7xl w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
