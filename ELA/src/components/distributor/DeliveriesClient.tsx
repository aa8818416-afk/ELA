"use client";

import { useState, useMemo, useCallback } from "react";
import { CheckSquare, Clock, CheckCircle2, ChevronDown, X, UserCheck, Globe, Calendar, Eye, Sparkles, Filter, Receipt, ArrowUpRight } from "lucide-react";
import DeliveryItem from "@/components/distributor/DeliveryItem";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { ZoomableImage } from "@/components/ui/ImageModal";
import { markOrdersAsSeen } from "@/app/actions/distributor";
import Link from "next/link";

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
  farmer_phone?: string | null;
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

  // Group pending orders by Date
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

  // Build unique filter options for each tab
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

  function handleTabChange(tab: "pending" | "completed") {
    setActiveTab(tab);
    setFilterName("");
    setCompletedPage(1);
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto">
      {/* 1. Header & Reconciliation Link */}
      <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-emerald-700" />
              التسليمات والتحصيل الميداني
            </h2>
            <span className="text-[10px] sm:text-xs bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
              مباشر
            </span>
          </div>
          <p className="text-slate-500 text-[11px] sm:text-xs mt-1">
            سجل تسليم الأوردرات للفلاحين وحصل الدفعات كاش مع التواصل الفوري
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Unseen count action button */}
          {unseenOrderIds.length > 0 && (
            <button
              onClick={handleMarkAllSeen}
              className="flex items-center gap-1.5 text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 px-3 py-2 rounded-xl transition-all shadow-2xs active:scale-95"
            >
              <Eye className="w-3.5 h-3.5 text-rose-600" />
              <span>تعليم كـ مقروء ({unseenOrderIds.length})</span>
            </button>
          )}

          {/* Top Reconciliation Link */}
          <Link
            href="/distributor"
            className="flex items-center gap-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 px-3.5 py-2 rounded-xl transition-all shadow-2xs active:scale-95"
          >
            <Receipt className="w-3.5 h-3.5 text-emerald-700" />
            <span>تصفية الحساب</span>
            <ArrowUpRight className="w-3 h-3 text-slate-500" />
          </Link>
        </div>
      </div>

      {/* 2. Tabs & Source Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-1.5 p-1 bg-white border border-slate-200 rounded-2xl w-full sm:w-fit shadow-2xs">
          <button
            onClick={() => handleTabChange("pending")}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === "pending"
                ? "bg-amber-500 text-slate-950 font-black shadow-xs border border-amber-600"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>الصفقات المعلقة</span>
            {pendingOrders.length > 0 && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  activeTab === "pending"
                    ? "bg-amber-700 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {pendingOrders.length}
              </span>
            )}
          </button>

          <button
            onClick={() => handleTabChange("completed")}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === "completed"
                ? "bg-emerald-600 text-white font-black shadow-xs border border-emerald-700"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>المكتملة</span>
            {completedOrders.length > 0 && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  activeTab === "completed"
                    ? "bg-emerald-800 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {completedOrders.length}
              </span>
            )}
          </button>
        </div>

        {/* Source Filter */}
        <div className="flex items-center justify-between sm:justify-start gap-1.5 bg-white p-1 border border-slate-200 rounded-2xl text-xs shadow-2xs w-full sm:w-auto">
          <span className="text-[11px] font-bold text-slate-500 px-2">المصدر:</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSourceFilter("all")}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all text-xs ${
                sourceFilter === "all"
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              الكل
            </button>
            <button
              onClick={() => setSourceFilter("distributor")}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl font-bold transition-all text-xs ${
                sourceFilter === "distributor"
                  ? "bg-purple-600 text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <UserCheck className="w-3 h-3" />
              الموزع
            </button>
            <button
              onClick={() => setSourceFilter("platform")}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl font-bold transition-all text-xs ${
                sourceFilter === "platform"
                  ? "bg-teal-700 text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Globe className="w-3 h-3" />
              المنصة
            </button>
          </div>
        </div>
      </div>

      {/* 3. Search Filter Box */}
      <div className="flex items-center gap-2 bg-white p-2 border border-slate-200/90 rounded-2xl shadow-xs">
        <div className="flex-1">
          <SearchableSelect
            options={currentFilterOptions}
            value={filterName}
            onChange={(val) => {
              setFilterName(val);
              if (activeTab === "completed") setCompletedPage(1);
            }}
            placeholder="🔍 ابحث باسم الفلاح أو السماد/المبيد..."
            id={`filter-${activeTab}`}
          />
        </div>
        {filterName && (
          <button
            onClick={() => setFilterName("")}
            className="flex items-center gap-1 text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 px-3 py-2 rounded-xl transition-all font-bold"
          >
            <X className="w-3.5 h-3.5" />
            مسح
          </button>
        )}
      </div>

      {/* 4. Orders Grouped by Date */}
      {activeTab === "pending" ? (
        <div className="space-y-6">
          {groupedPending.length === 0 ? (
            <EmptyState
              icon={filterName || sourceFilter !== "all" ? "🔍" : "🎉"}
              title={
                filterName || sourceFilter !== "all"
                  ? "لا توجد صفقات معلقة تطابق خيارات التصفية"
                  : "لا توجد صفقات معلقة حالياً!"
              }
              desc={
                filterName || sourceFilter !== "all"
                  ? "جرب تعديل خيارات التصفية والبحث"
                  : "رائع! لقد قمت بتسليم وتحصيل جميع الطلبات بنجاح."
              }
            />
          ) : (
            groupedPending.map((group, groupIdx) => (
              <div key={groupIdx} className="space-y-3">
                <div className="sticky top-20 z-30 flex justify-center py-1 pointer-events-none">
                  <div className="bg-white/95 backdrop-blur-md border border-slate-200 text-slate-800 text-xs font-bold px-4 py-1 rounded-full shadow-sm flex items-center gap-1.5 pointer-events-auto">
                    <Calendar className="w-3.5 h-3.5 text-emerald-700" />
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
                  ? "جرب تعديل خيارات التصفية والبحث"
                  : "ستظهر هنا كافة الصفقات التي تم تأكيد تسليمها وتحصيلها."
              }
            />
          ) : (
            <>
              {groupedCompleted.map((group, groupIdx) => (
                <div key={groupIdx} className="space-y-3">
                  <div className="sticky top-20 z-30 flex justify-center py-1 pointer-events-none">
                    <div className="bg-white/95 backdrop-blur-md border border-slate-200 text-emerald-900 text-xs font-bold px-4 py-1 rounded-full shadow-sm flex items-center gap-1.5 pointer-events-auto">
                      <Calendar className="w-3.5 h-3.5 text-emerald-700" />
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
                    className="flex items-center gap-2 text-xs font-bold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 px-6 py-2.5 rounded-2xl shadow-xs transition-all active:scale-95"
                  >
                    <ChevronDown className="w-4 h-4" />
                    عرض المزيد ({filteredCompleted.length - groupedCompleted.flatMap((g) => g.orders).length} متبقية)
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

// ─── Completed Order Card (Light Theme) ──────────────────────────────────────
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
    <div className="bg-white border border-slate-200/90 rounded-3xl p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div className="flex gap-3.5 items-start">
          {firstItemWithImage?.image_url ? (
            <ZoomableImage
              src={firstItemWithImage.image_url}
              alt={firstItemWithImage.name_ar}
              className="w-12 h-12 rounded-2xl object-cover border border-slate-200 bg-slate-50 shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          )}

          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h4 className="text-slate-900 font-bold text-sm">{order.farmer_name}</h4>

              {/* Source Badge */}
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[10px] font-bold border ${
                  isByDistributor
                    ? "bg-purple-50 text-purple-800 border-purple-200"
                    : "bg-teal-50 text-teal-800 border-teal-200"
                }`}
              >
                {isByDistributor ? "الموزع" : "المنصة"}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1.5">
              <span className="bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 font-semibold text-slate-700 text-[11px]">
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
                  <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200 text-[10px]">
                    <Clock className="w-3 h-3 text-emerald-600" />
                    {formattedDateTime}
                  </span>
                </>
              )}
            </div>

            {order.items && order.items.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 mt-1">
                {order.items.map((item) => (
                  <span
                    key={item.id}
                    className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg text-[11px] text-slate-700"
                  >
                    {item.name_ar}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="text-right w-full sm:w-auto flex flex-row sm:flex-col justify-between items-center sm:items-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
          <div>
            <p className="text-slate-500 text-[10px] mb-0.5">تم تحصيله</p>
            <p className="text-emerald-800 font-black text-base font-mono">
              {Math.round(order.total_price).toLocaleString("ar-EG")} <span className="text-xs font-normal">ج.م</span>
            </p>
          </div>
          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl">
            <CheckCircle2 className="w-3.5 h-3.5" />
            تم التسليم والتحصيل
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Empty State (Light Theme) ───────────────────────────────────────────────
function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="bg-white border border-slate-200/90 rounded-3xl p-12 text-center shadow-xs">
      <div className="w-14 h-14 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-2xs">
        <span className="text-2xl">{icon}</span>
      </div>
      <h3 className="text-base font-bold text-slate-900 mb-1">{title}</h3>
      <p className="text-xs text-slate-500 max-w-sm mx-auto">{desc}</p>
    </div>
  );
}
