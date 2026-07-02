import Link from "next/link";
import { Package, Truck, Users, KeySquare, Network } from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row rtl:flex-row-reverse" dir="rtl">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-900 text-white flex-shrink-0">
        <div className="p-6">
          <h1 className="text-2xl font-bold tracking-tight text-green-400">
            لوحة الإدارة
          </h1>
          <p className="text-slate-400 text-sm mt-1">منصة ELA</p>
        </div>

        <nav className="mt-6 flex flex-col gap-1 px-4">
          <Link
            href="/admin"
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Package className="w-5 h-5" />
            <span className="font-medium">المنتجات والتسعير</span>
          </Link>
          <Link
            href="/admin/aggregator"
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Network className="w-5 h-5" />
            <span className="font-medium">مجمع الطلبات</span>
          </Link>
          <Link
            href="/admin/trips"
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Truck className="w-5 h-5" />
            <span className="font-medium">الشحن والرحلات</span>
          </Link>
          <Link
            href="/admin/distributors"
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Users className="w-5 h-5" />
            <span className="font-medium">الموزعين والعمولات</span>
          </Link>
          <Link
            href="/admin/api-keys"
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <KeySquare className="w-5 h-5" />
            <span className="font-medium">مفاتيح API</span>
          </Link>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        <div className="max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
