"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { CheckSquare, Clock, CheckCircle2, ChevronDown, X, UserCheck, Globe, Calendar, Eye, Sparkles } from "lucide-react";
import DeliveryItem from "@/components/distributor/DeliveryItem";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { ZoomableImage } from "@/components/ui/ImageModal";
import { markOrdersAsSeen } from "@/app/actions/distributor";

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
  created_at?: string;
  created_by_type?: string;
  is_seen?: boolean;
  items: OrderItemData[];
};

interface DeliveriesClientProps {
  allOrders: OrderData[];
}

const PAGE_SIZE = 30;

function getDateLabel(dateStr?: string): string {
  if (!dateStr) return "تاريخ غير محدد";
  const orderDate = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isToday = orderDate.toDateString() === today.toDateString();
  const isYesterday = orderDate.toDateString() === yesterday.toDateString();

  if (isToday) {
    return "اليوم - " + orderDate.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
  }
  if (isYesterday) {
    return "أمس - " + orderDate.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
  }
  return orderDate.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function DeliveriesClient({ allOrders }: DeliveriesClientProps) {
  const [activeTab, setActiveTab] = useState<"pending" | "completed">("pending");
  const [sourceFilter, setSourceFilter] = useState<"all" | "distributor" | "platform">("all");
  const [filterName, setFilterName] = useState("");
  const [completedPage, setCompletedPage] = useState(1);

  // Split orders into pending and completed
  const [orders, setOrders] = useState<OrderData[]>(allOrders);

  // Unread orders count
  const unseenOrderIds = useMemo(
    () => orders.filter((o) => o.is_seen === false).map((o) => o.id),
    [orders]
  );

  const handleMarkAllSeen = async () => {
    if (unseenOrderIds.length === 0) return;
    setOrders((prev) => prev.map((o) => ({ ...o, is_seen: true })));
    await markOrdersAsSeen(unseenOrderIds);
  };

  const handleMarkSingleSeen = useCallback(async (orderId: string) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, is_seen: true } : o))
    );
    await markOrdersAsSeen([orderId]);
  }, []);

  // Callback: when a delivery is confirmed, move it from pending → completed immediately
  const handleOrderCompleted = useCallback((orderId: string) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: "delivered", is_seen: true } : o))
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

  // Filter logic
  const filteredPending = useMemo(() => {
    let list = pendingOrders;

    if (sourceFilter === "distributor") {
      list = list.filter((o) => o.created_by_type === "distributor");
    } else if (sourceFilter === "platform") {
      list = list.filter((o) => o.created_by_type !== "distributor");
    }

    if (!filterName) return list;
    const q = filterName.toLowerCase();
    return list.filter(
      (o) =>
        o.farmer_name.toLowerCase().includes(q) ||
        o.items.some((i) => i.name_ar.toLowerCase().includes(q))
    );
  }, [pendingOrders, sourceFilter, filterName]);

  const filteredCompleted = useMemo(() => {
    let list = completedOrders;

    if (sourceFilter === "distributor") {
      list = list.filter((o) => o.created_by_type === "distributor");
    } else if (sourceFilter === "platform") {
      list = list.filter((o) => o.created_by_type !== "distributor");
    }

    if (!filterName) return list;
    const q = filterName.toLowerCase();
    return list.filter(
      (o) =>
        o.farmer_name.toLowerCase().includes(q) ||
        o.items.some((i) => i.name_ar.toLowerCase().includes(q))
    );
  }, [completedOrders, sourceFilter, filterName]);

  // Group pending orders by Date for Telegram-style headers
  const groupedPending = useMemo(() => {
    const groups: { dateLabel: string; orders: OrderData[] }[] = [];
    filteredPending.forEach((order) => {
      const label = getDateLabel(order.created_at);
      const existing = groups.find((g) => g.dateLabel === label);
      if (existing) {
        existing.orders.push(order);
      } else {
        groups.push({ dateLabel: label, orders: [order] });
      }
    });
    return groups;
  }, [filteredPending]);

  // Group completed orders by Date
  const groupedCompleted = useMemo(() => {
    const groups: { dateLabel: string; orders: OrderData[] }[] = [];
    filteredCompleted.slice(0, completedPage * PAGE_SIZE).forEach((order) => {
      const label = getDateLabel(order.created_at);
      const existing = groups.find((g) => g.dateLabel === label);
      if (existing) {
        existing.orders.push(order);
      } else {
        groups.push({ dateLabel: label, orders: [order] });
      }
    });
    return groups;
  }, [filteredCompleted, completedPage]);

  const hasMoreCompleted =
    groupedCompleted.flatMap((g) => g.orders).length < filteredCompleted.length;

  // Build unique filter options for each tab based on current list
  const currentTabOrders = activeTab === "pending" ? pendingOrders : completedOrders;
  const currentFilterOptions = useMemo(() => {
    const farmerNames = [...new Set(currentTabOrders.map((o) => o.farmer_name).filter(Boolean))];
    const productNames = [
      ...new Set(
        currentTabOrders.flatMap((o) => o.items.map((i) => i.name_ar)).filter(Boolean)
      ),
    ];
    return [...farmerNames, ...productNames].sort();
  }, [currentTabOrders]);

  // Reset filter and pagination when switching tabs
  function handleTabChange(tab: "pending" | "completed") {
    setActiveTab(tab);
    setFilterName("");
    setCompletedPage(1);
  }

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
            إدارة صفقاتك المعلقة والمكتملة مقسمة بالأيام مع التصفية وحالة المشاهدة
          </p>
        </div>

        {/* Mark as seen action button if there are unseen orders */}
        {unseenOrderIds.length > 0 && (
          <button
            onClick={handleMarkAllSeen}
            className="flex items-center gap-2 text-xs font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 px-4 py-2.5 rounded-xl transition-all shadow-md shadow-rose-500/10 shrink-0 self-start sm:self-auto"
          >
            <Eye className="w-4 h-4 text-rose-400" />
            تعليم الكل كـ مقروء ({unseenOrderIds.length})
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-col gap-3">
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

        {/* Source Filters (الكل | من خلالي | من خلال المنصة) */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-900/40 p-2 border border-slate-800/80 rounded-2xl">
          <span className="text-xs font-semibold text-slate-400 px-2">عرض حسب المصدر:</span>
          <button
            onClick={() => setSourceFilter("all")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              sourceFilter === "all"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            الكل
          </button>
          <button
            onClick={() => setSourceFilter("distributor")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              sourceFilter === "distributor"
                ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            من خلالي (الموزع)
          </button>
          <button
            onClick={() => setSourceFilter("platform")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              sourceFilter === "platform"
                ? "bg-teal-600 text-white shadow-md shadow-teal-600/20"
                : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            من خلال المنصة
          </button>
        </div>
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

      {/* Content grouped by Date with Telegram Sticky Header */}
      {activeTab === "pending" ? (
        <div className="space-y-6">
          {groupedPending.length === 0 ? (
            <EmptyState
              icon={filterName || sourceFilter !== "all" ? "🔍" : "🎉"}
              title={
                filterName || sourceFilter !== "all"
                  ? "لا توجد صفقات معلقة تطابق خيارات التصفية"
                  : "لا توجد صفقات معلقة!"
              }
              desc={
                filterName || sourceFilter !== "all"
                  ? "جرب تغيير خيار التصفية أو البحث"
                  : "لقد قمت بتسليم جميع الطلبات بنجاح."
              }
            />
          ) : (
            groupedPending.map((group, groupIdx) => (
              <div key={groupIdx} className="space-y-3">
                {/* Telegram-style sticky date header */}
                <div className="sticky top-20 z-30 flex justify-center py-2 pointer-events-none">
                  <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 text-amber-300 text-xs font-extrabold px-4 py-1.5 rounded-full shadow-xl shadow-black/50 flex items-center gap-1.5 pointer-events-auto">
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{group.dateLabel}</span>
                  </div>
                </div>

                {group.orders.map((order) => (
                  <DeliveryItem
                    key={order.id}
                    order={order}
                    onDelivered={handleOrderCompleted}
                    onMarkSeen={handleMarkSingleSeen}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {groupedCompleted.length === 0 ? (
            <EmptyState
              icon={filterName || sourceFilter !== "all" ? "🔍" : "📭"}
              title={
                filterName || sourceFilter !== "all"
                  ? "لا توجد صفقات مكتملة تطابق خيارات التصفية"
                  : "لا توجد صفقات مكتملة بعد"
              }
              desc={
                filterName || sourceFilter !== "all"
                  ? "جرب تغيير خيار التصفية أو البحث"
                  : "ستظهر هنا الصفقات التي تم تأكيد تسليمها."
              }
            />
          ) : (
            <>
              {groupedCompleted.map((group, groupIdx) => (
                <div key={groupIdx} className="space-y-3">
                  {/* Telegram-style sticky date header */}
                  <div className="sticky top-20 z-30 flex justify-center py-2 pointer-events-none">
                    <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 text-emerald-300 text-xs font-extrabold px-4 py-1.5 rounded-full shadow-xl shadow-black/50 flex items-center gap-1.5 pointer-events-auto">
                      <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{group.dateLabel}</span>
                    </div>
                  </div>

                  {group.orders.map((order) => (
                    <CompletedOrderCard key={order.id} order={order} />
                  ))}
                </div>
              ))}

              {hasMoreCompleted && (
                <div className="flex justify-center pt-2">
                  <button
                    onClick={() => setCompletedPage((p) => p + 1)}
                    className="flex items-center gap-2 text-sm font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 hover:border-indigo-500/40 px-6 py-3 rounded-2xl transition-all"
                  >
                    <ChevronDown className="w-4 h-4" />
                    عرض أكثر ({filteredCompleted.length - groupedCompleted.flatMap((g) => g.orders).length} متبقية)
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

  const formattedDateTime = order.created_at
    ? new Date(order.created_at).toLocaleString("ar-EG", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const isByDistributor = order.created_by_type === "distributor";

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
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h4 className="text-white font-bold text-lg">{order.farmer_name}</h4>

              {/* Source Badge */}
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  isByDistributor
                    ? "bg-purple-500/10 text-purple-300 border-purple-500/20"
                    : "bg-teal-500/10 text-teal-300 border-teal-500/20"
                }`}
              >
                {isByDistributor ? (
                  <>
                    <UserCheck className="w-3 h-3" />
                    عن طريق الموزع
                  </>
                ) : (
                  <>
                    <Globe className="w-3 h-3" />
                    عن طريق المنصة
                  </>
                )}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-400 mb-2">
              <span className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 font-semibold text-emerald-300">
                {order.items_count} {order.items_count === 1 ? "صنف" : "أصناف"}
              </span>
              {order.village && (
                <>
                  <span>•</span>
                  <span>{order.village}</span>
                </>
              )}
              {formattedDateTime && (
                <>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1 text-slate-400 bg-slate-950/60 px-2 py-0.5 rounded-md border border-slate-800/80">
                    <Clock className="w-3 h-3 text-amber-400/80" />
                    {formattedDateTime}
                  </span>
                </>
              )}
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

