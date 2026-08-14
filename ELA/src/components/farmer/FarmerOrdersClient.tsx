"use client";

import { useState, useMemo } from "react";
import { Package, Clock, CheckCircle2, ChevronDown, X } from "lucide-react";
import { ZoomableImage } from "@/components/ui/ImageModal";
import SearchableSelect from "@/components/ui/SearchableSelect";

const statusMap: Record<string, { label: string; color: string; icon: string }> = {
  pending: {
    label: "قيد الانتظار",
    color: "text-amber-900 bg-amber-50 border-amber-300 font-black",
    icon: "🟡",
  },
  in_transit: {
    label: "قيد التوصيل",
    color: "text-blue-900 bg-blue-50 border-blue-300 font-black",
    icon: "🚚",
  },
  delivered: {
    label: "تم التسليم",
    color: "text-emerald-900 bg-emerald-50 border-emerald-300 font-black",
    icon: "✅",
  },
  cancelled: {
    label: "ملغي",
    color: "text-red-900 bg-red-50 border-red-300 font-black",
    icon: "❌",
  },
};

type OrderItem = {
  quantity: number;
  products?: { name_ar?: string; image_url?: string | null };
};

export type FarmerOrder = {
  id: string;
  created_at: string;
  total_price: number;
  status: string;
  payment_status: string;
  order_items: OrderItem[];
};

interface FarmerOrdersClientProps {
  orders: FarmerOrder[];
  distProfile?: { full_name?: string; phone?: string } | null;
}

const PAGE_SIZE = 30;

export default function FarmerOrdersClient({ orders, distProfile }: FarmerOrdersClientProps) {
  const [activeTab, setActiveTab] = useState<"pending" | "completed">("pending");
  const [filterProduct, setFilterProduct] = useState("");
  const [completedPage, setCompletedPage] = useState(1);

  const pendingOrders = useMemo(
    () => orders.filter((o) => o.status === "pending" || o.status === "in_transit"),
    [orders]
  );

  const completedOrders = useMemo(
    () => orders.filter((o) => o.status === "delivered" || o.status === "cancelled"),
    [orders]
  );

  // Unique product names for filters
  const pendingProductOptions = useMemo(() => {
    const names = [
      ...new Set(
        pendingOrders.flatMap((o) =>
          o.order_items.map((i) => i.products?.name_ar).filter(Boolean) as string[]
        )
      ),
    ];
    return names.sort();
  }, [pendingOrders]);

  const completedProductOptions = useMemo(() => {
    const names = [
      ...new Set(
        completedOrders.flatMap((o) =>
          o.order_items.map((i) => i.products?.name_ar).filter(Boolean) as string[]
        )
      ),
    ];
    return names.sort();
  }, [completedOrders]);

  const filteredPending = useMemo(() => {
    if (!filterProduct) return pendingOrders;
    const q = filterProduct.toLowerCase();
    return pendingOrders.filter((o) =>
      o.order_items.some((i) => i.products?.name_ar?.toLowerCase().includes(q))
    );
  }, [pendingOrders, filterProduct]);

  const filteredCompleted = useMemo(() => {
    if (!filterProduct) return completedOrders;
    const q = filterProduct.toLowerCase();
    return completedOrders.filter((o) =>
      o.order_items.some((i) => i.products?.name_ar?.toLowerCase().includes(q))
    );
  }, [completedOrders, filterProduct]);

  const paginatedCompleted = useMemo(
    () => filteredCompleted.slice(0, completedPage * PAGE_SIZE),
    [filteredCompleted, completedPage]
  );
  const hasMoreCompleted = paginatedCompleted.length < filteredCompleted.length;

  function handleTabChange(tab: "pending" | "completed") {
    setActiveTab(tab);
    setFilterProduct("");
    setCompletedPage(1);
  }

  const currentProductOptions =
    activeTab === "pending" ? pendingProductOptions : completedProductOptions;

  return (
    <div className="space-y-5 text-right font-sans text-slate-900" dir="rtl">
      {/* Header */}
      <div className="bg-white border border-slate-200/80 p-5 rounded-3xl shadow-xs flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-emerald-700" />
            <span>طلباتي وتتبع الشحنات</span>
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">تابع حالة مشترياتك وتواصل مع سفير قريتك</p>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-2xl shadow-xs">
          📦
        </div>
      </div>

      {/* Distributor Contact Pill */}
      {distProfile && (
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-3xl p-4 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-lg shadow-xs">
              👨‍💼
            </div>
            <div className="min-w-0">
              <p className="text-slate-900 font-black text-xs">{distProfile.full_name || "سفير القرية"}</p>
              <p className="text-emerald-800 text-[11px] font-bold">مندوب الاستلام المعتمد بقريتك</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {distProfile.phone && (
              <>
                <a
                  href={`tel:${distProfile.phone}`}
                  className="p-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                  title="اتصال هاتفي"
                >
                  <span className="text-xs">📞</span>
                  <span>اتصال</span>
                </a>
                <a
                  href={`https://wa.me/${distProfile.phone.replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 bg-[#25D366] hover:bg-[#20ba5a] text-white border border-[#1ebc56] rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                  title="محادثة واتساب"
                >
                  <span className="text-xs">💬</span>
                  <span>واتساب</span>
                </a>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shadow-xs">
        <button
          onClick={() => handleTabChange("pending")}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all ${
            activeTab === "pending"
              ? "bg-white text-amber-900 border border-amber-300 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Clock className="w-4 h-4 text-amber-600" />
          <span>الطلبات الجارية</span>
          {pendingOrders.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-900 font-mono">
              {pendingOrders.length}
            </span>
          )}
        </button>

        <button
          onClick={() => handleTabChange("completed")}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all ${
            activeTab === "completed"
              ? "bg-white text-emerald-900 border border-emerald-300 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>الطلبات المكتملة</span>
          {completedOrders.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-900 font-mono">
              {completedOrders.length}
            </span>
          )}
        </button>
      </div>

      {/* Filter */}
      {currentProductOptions.length > 0 && (
        <div className="flex items-center gap-2.5">
          <div className="flex-1">
            <SearchableSelect
              options={currentProductOptions}
              value={filterProduct}
              onChange={(val) => {
                setFilterProduct(val);
                if (activeTab === "completed") setCompletedPage(1);
              }}
              placeholder="🔍 ابحث باسم المنتج..."
              id={`farmer-filter-${activeTab}`}
            />
          </div>
          {filterProduct && (
            <button
              onClick={() => setFilterProduct("")}
              className="flex items-center gap-1.5 text-xs text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 px-3.5 py-2.5 rounded-xl transition-all shadow-xs font-bold"
            >
              <X className="w-3.5 h-3.5" />
              مسح
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {activeTab === "pending" ? (
        <div className="space-y-3.5">
          {filteredPending.length === 0 ? (
            <EmptyState
              icon={filterProduct ? "🔍" : "🎉"}
              title={filterProduct ? `لا توجد طلبات تحتوي على "${filterProduct}"` : "لا توجد طلبات معلقة حالياً"}
              desc={filterProduct ? "جرب البحث بمنتج مختلف" : "ستظهر هنا طلباتك قيد التجهيز والتوصيل."}
            />
          ) : (
            filteredPending.map((order) => <OrderCard key={order.id} order={order} />)
          )}
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredCompleted.length === 0 ? (
            <EmptyState
              icon={filterProduct ? "🔍" : "📭"}
              title={filterProduct ? `لا توجد طلبات تحتوي على "${filterProduct}"` : "لا توجد طلبات مكتملة بعد"}
              desc={filterProduct ? "جرب البحث بمنتج مختلف" : "ستظهر هنا جميع مشترياتك السابقة المسلمة."}
            />
          ) : (
            <>
              {paginatedCompleted.map((order) => <OrderCard key={order.id} order={order} />)}

              {hasMoreCompleted && (
                <div className="flex justify-center pt-2">
                  <button
                    onClick={() => setCompletedPage((p) => p + 1)}
                    className="flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-6 py-2.5 rounded-xl transition-all shadow-xs"
                  >
                    <ChevronDown className="w-4 h-4" />
                    عرض أكثر ({filteredCompleted.length - paginatedCompleted.length} متبقية)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Order Card ───────────────────────────────────────────────────────────────
function OrderCard({ order }: { order: FarmerOrder }) {
  const status = statusMap[order.status] || statusMap.pending;
  const orderDate = new Date(order.created_at).toLocaleString("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const items = order.order_items || [];
  const isCompleted = order.status === "delivered" || order.status === "cancelled";

  return (
    <div
      className={`bg-white border rounded-3xl overflow-hidden transition-all shadow-xs ${
        isCompleted ? "border-slate-200 opacity-90 hover:opacity-100" : "border-slate-200/90 hover:border-emerald-300"
      }`}
    >
      {/* Order Header */}
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-slate-400 text-[11px] mb-0.5">{orderDate}</p>
          <p className="text-slate-900 font-black text-lg font-mono">
            {order.total_price?.toLocaleString()} <span className="text-xs font-bold text-slate-500 font-sans">ج.م</span>
          </p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full border shadow-xs ${status.color}`}>
          {status.icon} {status.label}
        </span>
      </div>

      {/* Products */}
      {items.length > 0 && (
        <div className="border-t border-slate-100 px-5 py-3 space-y-2 bg-[#fbfdfa]">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2.5">
                {item.products?.image_url ? (
                  <ZoomableImage
                    src={item.products.image_url}
                    alt={item.products.name_ar || "منتج"}
                    className="w-8 h-8 rounded-lg object-cover bg-white border border-slate-200 shadow-xs"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-xs text-emerald-700">
                    📦
                  </div>
                )}
                <span className="text-slate-800 font-bold">
                  {item.products?.name_ar || "منتج"}
                </span>
              </div>
              <span className="text-slate-600 font-black font-mono">× {item.quantity}</span>
            </div>
          ))}
        </div>
      )}

      {/* Payment Status */}
      <div className="border-t border-slate-100 px-5 py-2.5 flex items-center justify-between bg-white text-xs">
        <span className="text-slate-500 text-[11px]">حالة السداد:</span>
        <span
          className={`font-bold ${
            order.payment_status === "paid" ? "text-emerald-700" : "text-amber-800"
          }`}
        >
          {order.payment_status === "paid" ? "✅ تم الدفع" : "⏳ دفع عند الاستلام"}
        </span>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="bg-white border border-slate-200/80 rounded-3xl p-10 text-center shadow-xs">
      <p className="text-4xl mb-2">{icon}</p>
      <h3 className="text-slate-900 font-black text-base mb-1">{title}</h3>
      <p className="text-slate-500 text-xs">{desc}</p>
    </div>
  );
}
