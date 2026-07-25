"use client";

import { useState, useMemo, useCallback } from "react";
import { CheckSquare, Clock, CheckCircle2, ChevronDown, X } from "lucide-react";
import DeliveryItem from "@/components/distributor/DeliveryItem";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { ZoomableImage } from "@/components/ui/ImageModal";

type OrderItemData = {
  id: string;
  name_ar: string;
  image_url: string | null;
  quantity?: number;
};

export type OrderData = {
  id: string;
  total_price: number;
  status: string;
  farmer_name: string;
  village: string | null;
  items_count: number;
  items: OrderItemData[];
};

interface DeliveriesClientProps {
  allOrders: OrderData[];
}

const PAGE_SIZE = 30;

export default function DeliveriesClient({ allOrders }: DeliveriesClientProps) {
  const [activeTab, setActiveTab] = useState<"pending" | "completed">("pending");
  const [filterName, setFilterName] = useState("");
  const [completedPage, setCompletedPage] = useState(1);

  // Split orders into pending and completed
  const [orders, setOrders] = useState<OrderData[]>(allOrders);

  // Callback: when a delivery is confirmed, move it from pending → completed immediately
  const handleOrderCompleted = useCallback((orderId: string) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: "delivered" } : o))
    );
  }, []);

  const pendingOrders = useMemo(
    () => orders.filter((o) => o.status === "pending" || o.status === "in_transit"),
    [orders]
  );

  const completedOrders = useMemo(
    () => orders.filter((o) => o.status === "delivered"),
    [orders]
  );

  // Build unique filter options for each tab
  const pendingFilterOptions = useMemo(() => {
    const farmerNames = [...new Set(pendingOrders.map((o) => o.farmer_name).filter(Boolean))];
    const productNames = [
      ...new Set(
        pendingOrders.flatMap((o) => o.items.map((i) => i.name_ar)).filter(Boolean)
      ),
    ];
    return [...farmerNames, ...productNames].sort();
  }, [pendingOrders]);

  const completedFilterOptions = useMemo(() => {
    const farmerNames = [...new Set(completedOrders.map((o) => o.farmer_name).filter(Boolean))];
    const productNames = [
      ...new Set(
        completedOrders.flatMap((o) => o.items.map((i) => i.name_ar)).filter(Boolean)
      ),
    ];
    return [...farmerNames, ...productNames].sort();
  }, [completedOrders]);

  // Filter logic
  const filteredPending = useMemo(() => {
    if (!filterName) return pendingOrders;
    const q = filterName.toLowerCase();
    return pendingOrders.filter(
      (o) =>
        o.farmer_name.toLowerCase().includes(q) ||
        o.items.some((i) => i.name_ar.toLowerCase().includes(q))
    );
  }, [pendingOrders, filterName]);

  const filteredCompleted = useMemo(() => {
    if (!filterName) return completedOrders;
    const q = filterName.toLowerCase();
    return completedOrders.filter(
      (o) =>
        o.farmer_name.toLowerCase().includes(q) ||
        o.items.some((i) => i.name_ar.toLowerCase().includes(q))
    );
  }, [completedOrders, filterName]);

  // Paginated completed orders (show last 30, then load more in chunks of 30)
  const paginatedCompleted = useMemo(
    () => filteredCompleted.slice(0, completedPage * PAGE_SIZE),
    [filteredCompleted, completedPage]
  );
  const hasMoreCompleted = paginatedCompleted.length < filteredCompleted.length;

  // Reset filter and pagination when switching tabs
  function handleTabChange(tab: "pending" | "completed") {
    setActiveTab(tab);
    setFilterName("");
    setCompletedPage(1);
  }

  const currentFilterOptions =
    activeTab === "pending" ? pendingFilterOptions : completedFilterOptions;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-indigo-400" />
            التسليمات والتحصيل
          </h2>
          <p className="text-slate-400 text-sm">
            إدارة صفقاتك المعلقة والمكتملة مع إمكانية البحث والتصفية
          </p>
        </div>
      </div>

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

      {/* Search Filter */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <SearchableSelect
            options={currentFilterOptions}
            value={filterName}
            onChange={(val) => {
              setFilterName(val);
              if (activeTab === "completed") setCompletedPage(1);
            }}
            placeholder="🔍 ابحث باسم الفلاح أو المنتج..."
            id={`filter-${activeTab}`}
          />
        </div>
        {filterName && (
          <button
            onClick={() => setFilterName("")}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2.5 rounded-xl transition-all"
          >
            <X className="w-3.5 h-3.5" />
            مسح
          </button>
        )}
      </div>

      {/* Content */}
      {activeTab === "pending" ? (
        <div className="space-y-4">
          {filteredPending.length === 0 ? (
            <EmptyState
              icon={filterName ? "🔍" : "🎉"}
              title={filterName ? `لا توجد نتائج لـ "${filterName}"` : "لا توجد صفقات معلقة!"}
              desc={filterName ? "جرب البحث بكلمة مختلفة" : "لقد قمت بتسليم جميع الطلبات بنجاح."}
            />
          ) : (
            filteredPending.map((order) => (
              <DeliveryItem
                key={order.id}
                order={order}
                onDelivered={handleOrderCompleted}
              />
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCompleted.length === 0 ? (
            <EmptyState
              icon={filterName ? "🔍" : "📭"}
              title={filterName ? `لا توجد نتائج لـ "${filterName}"` : "لا توجد صفقات مكتملة بعد"}
              desc={filterName ? "جرب البحث بكلمة مختلفة" : "ستظهر هنا الصفقات التي تم تأكيد تسليمها."}
            />
          ) : (
            <>
              {paginatedCompleted.map((order) => (
                <CompletedOrderCard key={order.id} order={order} />
              ))}

              {hasMoreCompleted && (
                <div className="flex justify-center pt-2">
                  <button
                    onClick={() => setCompletedPage((p) => p + 1)}
                    className="flex items-center gap-2 text-sm font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 hover:border-indigo-500/40 px-6 py-3 rounded-2xl transition-all"
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

// ─── Completed Order Card ────────────────────────────────────────────────────
function CompletedOrderCard({ order }: { order: OrderData }) {
  const firstItemWithImage = order.items?.find((item) => item.image_url);

  return (
    <div className="bg-slate-900/40 backdrop-blur-xl border border-emerald-900/30 rounded-3xl p-5 opacity-80 hover:opacity-100 transition-opacity">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div className="flex gap-4 items-start">
          {firstItemWithImage?.image_url ? (
            <ZoomableImage
              src={firstItemWithImage.image_url}
              alt={firstItemWithImage.name_ar}
              className="w-14 h-14 rounded-2xl object-cover border border-slate-700/80 bg-slate-950 shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shrink-0">
              <CheckCircle2 className="w-7 h-7 text-emerald-400" />
            </div>
          )}

          <div>
            <h4 className="text-white font-bold text-lg mb-1">{order.farmer_name}</h4>
            <div className="flex flex-wrap items-center gap-2.5 text-sm text-slate-400 mb-2">
              <span className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-xs font-semibold text-emerald-300">
                {order.items_count} {order.items_count === 1 ? "صنف" : "أصناف"}
              </span>
              <span>•</span>
              <span>{order.village || "قرية غير محددة"}</span>
            </div>

            {order.items && order.items.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {order.items.map((item) => (
                  <span
                    key={item.id}
                    className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 px-2.5 py-1 rounded-xl text-xs text-slate-300"
                  >
                    {item.name_ar}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="text-right w-full sm:w-auto flex flex-row sm:flex-col justify-between items-center sm:items-end gap-3">
          <div>
            <p className="text-slate-400 text-xs mb-1">تم تحصيله</p>
            <p className="text-emerald-400 font-bold text-xl">
              {order.total_price.toLocaleString()} ج.م
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
            <CheckCircle2 className="w-3.5 h-3.5" />
            تم التسليم
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────
function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-12 text-center">
      <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
        <span className="text-2xl">{icon}</span>
      </div>
      <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
      <p className="text-slate-400">{desc}</p>
    </div>
  );
}
