"use client";

import { useState, useMemo } from "react";
import { Package, Clock, CheckCircle2, ChevronDown, X } from "lucide-react";
import { ZoomableImage } from "@/components/ui/ImageModal";
import SearchableSelect from "@/components/ui/SearchableSelect";

const statusMap: Record<string, { label: string; color: string; icon: string }> = {
  pending: {
    label: "قيد الانتظار",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    icon: "🟡",
  },
  in_transit: {
    label: "قيد التوصيل",
    color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    icon: "🚚",
  },
  delivered: {
    label: "تم التسليم",
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    icon: "✅",
  },
  cancelled: {
    label: "ملغي",
    color: "text-red-400 bg-red-500/10 border-red-500/20",
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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
          <Package className="w-6 h-6 text-emerald-400" />
          طلباتي
        </h1>
        <p className="text-slate-400 text-sm">تابع طلباتك النشطة والسابقة</p>
      </div>

      {/* Distributor Contact Pill */}
      {distProfile && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-lg">
            👨‍🌾
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-300 text-xs">سفير قريتك</p>
            <p className="text-white font-bold text-sm truncate">
              {distProfile.full_name || "السفير"}
            </p>
          </div>
          {distProfile.phone && (
            <a
              href={`tel:${distProfile.phone}`}
              className="text-emerald-400 text-sm font-bold border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 rounded-xl"
            >
              📞 اتصل
            </a>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-slate-900/70 border border-slate-800 rounded-2xl w-full sm:w-fit">
        <button
          onClick={() => handleTabChange("pending")}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
            activeTab === "pending"
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-lg shadow-amber-500/10"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Clock className="w-4 h-4" />
          الصفقات المعلقة
          {pendingOrders.length > 0 && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                activeTab === "pending"
                  ? "bg-amber-500/30 text-amber-300"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {pendingOrders.length}
            </span>
          )}
        </button>

        <button
          onClick={() => handleTabChange("completed")}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${
            activeTab === "completed"
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-500/10"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          الصفقات المكتملة
          {completedOrders.length > 0 && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                activeTab === "completed"
                  ? "bg-emerald-500/30 text-emerald-300"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {completedOrders.length}
            </span>
          )}
        </button>
      </div>

      {/* Filter */}
      {currentProductOptions.length > 0 && (
        <div className="flex items-center gap-3">
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
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2.5 rounded-xl transition-all"
            >
              <X className="w-3.5 h-3.5" />
              مسح
            </button>
          )}
        </div>
      )}

      {/* Content */}
      {activeTab === "pending" ? (
        <div className="space-y-4">
          {filteredPending.length === 0 ? (
            <EmptyState
              icon={filterProduct ? "🔍" : "🎉"}
              title={filterProduct ? `لا توجد طلبات تحتوي على "${filterProduct}"` : "لا توجد طلبات معلقة"}
              desc={filterProduct ? "جرب البحث بمنتج مختلف" : "ستظهر هنا طلباتك النشطة."}
            />
          ) : (
            filteredPending.map((order) => <OrderCard key={order.id} order={order} />)
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCompleted.length === 0 ? (
            <EmptyState
              icon={filterProduct ? "🔍" : "📭"}
              title={filterProduct ? `لا توجد طلبات تحتوي على "${filterProduct}"` : "لا توجد صفقات مكتملة بعد"}
              desc={filterProduct ? "جرب البحث بمنتج مختلف" : "ستظهر هنا طلباتك المكتملة والملغاة."}
            />
          ) : (
            <>
              {paginatedCompleted.map((order) => <OrderCard key={order.id} order={order} />)}

              {hasMoreCompleted && (
                <div className="flex justify-center pt-2">
                  <button
                    onClick={() => setCompletedPage((p) => p + 1)}
                    className="flex items-center gap-2 text-sm font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/40 px-6 py-3 rounded-2xl transition-all"
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
      className={`bg-slate-900/70 border rounded-3xl overflow-hidden transition-opacity ${
        isCompleted ? "border-slate-800 opacity-80 hover:opacity-100" : "border-slate-800"
      }`}
    >
      {/* Order Header */}
      <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-slate-500 text-xs mb-1">{orderDate}</p>
          <p className="text-emerald-400 font-bold text-xl">
            {order.total_price?.toLocaleString()} ج.م
          </p>
        </div>
        <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${status.color}`}>
          {status.icon} {status.label}
        </span>
      </div>

      {/* Products */}
      {items.length > 0 && (
        <div className="border-t border-slate-800 px-5 py-3 space-y-2">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-2.5">
                {item.products?.image_url ? (
                  <ZoomableImage
                    src={item.products.image_url}
                    alt={item.products.name_ar || "منتج"}
                    className="w-8 h-8 rounded-lg object-cover bg-slate-800 border border-slate-800"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-800 flex items-center justify-center text-xs">
                    📦
                  </div>
                )}
                <span className="text-slate-300 font-medium">
                  {item.products?.name_ar || "منتج"}
                </span>
              </div>
              <span className="text-slate-500 font-semibold">× {item.quantity}</span>
            </div>
          ))}
        </div>
      )}

      {/* Payment Status */}
      <div className="border-t border-slate-800 px-5 py-3 flex items-center justify-between">
        <span className="text-slate-500 text-xs">حالة الدفع</span>
        <span
          className={`text-xs font-bold ${
            order.payment_status === "paid" ? "text-emerald-400" : "text-amber-400"
          }`}
        >
          {order.payment_status === "paid" ? "✅ مدفوع" : "⏳ غير مدفوع"}
        </span>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-10 text-center">
      <p className="text-4xl mb-3">{icon}</p>
      <h3 className="text-white font-bold text-lg mb-2">{title}</h3>
      <p className="text-slate-400 text-sm">{desc}</p>
    </div>
  );
}
