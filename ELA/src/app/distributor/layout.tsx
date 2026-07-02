import type { Metadata } from "next";
import Sidebar from "@/components/distributor/Sidebar";

export const metadata: Metadata = {
  title: "بوابة الموزع | منصة ELA",
  description: "لوحة تحكم الموزع - منصة ELA",
};

export default function DistributorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* Sidebar - fixed on the right in RTL */}
      <div className="fixed top-0 bottom-0 right-0 z-50">
        <Sidebar />
      </div>
      
      {/* Main Content Area - padded to account for the 64 (16rem / 256px) sidebar */}
      <div className="flex-1 pr-64">
        {/* Topbar */}
        <header className="h-16 border-b border-slate-800 bg-slate-950/50 backdrop-blur-xl flex items-center justify-between px-8 sticky top-0 z-40">
          <h1 className="text-slate-200 font-semibold text-lg">نظرة عامة</h1>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-slate-200 text-sm font-medium">مرحباً بك</p>
              <p className="text-slate-500 text-xs">حساب الموزع</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
              👤
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
