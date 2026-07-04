"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Package, Truck, Users, KeySquare, Network, Menu, X } from "lucide-react";

const navItems = [
  { href: "/admin", label: "المنتجات والتسعير", icon: Package },
  { href: "/admin/aggregator", label: "مجمع الطلبات", icon: Network },
  { href: "/admin/trips", label: "الشحن والرحلات", icon: Truck },
  { href: "/admin/distributors", label: "الموزعين والعمولات", icon: Users },
  { href: "/admin/api-keys", label: "مفاتيح API", icon: KeySquare },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      {/* Mobile Top Bar (only on small screens) */}
      <div className="md:hidden sticky top-0 z-30 flex items-center justify-between bg-slate-900 text-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-green-400 font-bold text-lg">ELA</span>
          <span className="text-slate-400 text-sm">لوحة الإدارة</span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
          aria-label="فتح القائمة"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`
            fixed md:static inset-y-0 right-0 z-40 w-64 bg-slate-900 text-white flex-shrink-0
            transform transition-transform duration-200 ease-in-out
            ${mobileOpen ? "translate-x-0" : "translate-x-full"} md:translate-x-0
          `}
        >
          <div className="p-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-green-400">
                لوحة الإدارة
              </h1>
              <p className="text-slate-400 text-sm mt-1">منصة ELA</p>
            </div>
            {/* Close button (mobile only) */}
            <button
              onClick={() => setMobileOpen(false)}
              className="md:hidden p-2 rounded-lg hover:bg-slate-800"
              aria-label="إغلاق القائمة"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="mt-6 flex flex-col gap-1 px-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    active
                      ? "bg-slate-800 text-white"
                      : "text-slate-300 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Overlay (mobile only — click to close) */}
        {mobileOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black/50 z-30"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Main Content Area */}
        <main className="flex-1 p-4 md:p-10 overflow-y-auto min-w-0">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
