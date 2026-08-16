"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { Image as ImageIcon, Filter, X, TrendingUp, ShoppingCart, Package, Sparkles, Check, Search } from "lucide-react";
import { ZoomableImage } from "@/components/ui/ImageModal";
import Link from "next/link";

type Product = {
  id: string;
  name_ar: string;
  active_ingredient: string | null;
  price_to_farmer: number;
  agent_commission: number;
  stock_status: boolean;
  image_url: string | null;
  product_type: string[] | null;
  target_crops: string[] | null;
};

const PRODUCT_TYPES = ["أسمدة", "مغذيات", "مبيدات"];
const CROPS = [
  "القمح", "الأرز", "البطاطس", "الموالح",
  "البصل", "الطماطم", "بنجر السكر", "الذرة الصفراء", "القطن", "الثوم",
];

const TYPE_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  "مبيدات": { bg: "bg-red-50", text: "text-red-800", border: "border-red-200" },
  "مغذيات": { bg: "bg-blue-50", text: "text-blue-800", border: "border-blue-200" },
  "أسمدة": { bg: "bg-emerald-50", text: "text-emerald-800", border: "border-emerald-200" },
};

export default function DistributorProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedCrops, setSelectedCrops] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAdvanceFilter, setShowAdvanceFilter] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("id, name_ar, active_ingredient, price_to_farmer, agent_commission, stock_status, image_url, product_type, target_crops")
      .order("name_ar");
    if (!error && data) {
      setProducts(data as Product[]);
    }
    setLoading(false);
  }

  function toggleType(t: string) {
    setSelectedTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  }

  function toggleCrop(c: string) {
    setSelectedCrops((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  }

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      !searchQuery.trim() ||
      p.name_ar.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.active_ingredient && p.active_ingredient.toLowerCase().includes(searchQuery.toLowerCase()));

    const typeMatch =
      selectedTypes.length === 0 ||
      selectedTypes.some((t) => p.product_type?.includes(t));

    const cropMatch =
      selectedCrops.length === 0 ||
      selectedCrops.some((c) => p.target_crops?.includes(c));

    return matchesSearch && typeMatch && cropMatch;
  });

  const activeFiltersCount = selectedTypes.length + selectedCrops.length;

  return (
    <div className="space-y-4 sm:space-y-6 max-w-6xl mx-auto" dir="rtl">
      {/* 1. Header */}
      <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <Package className="w-5 h-5 text-emerald-700" />
              دليل وكتالوج المنتجات الزراعية
            </h1>
            <span className="text-[10px] sm:text-xs bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
              أسعار التوزيع
            </span>
          </div>
          <p className="text-slate-500 text-[11px] sm:text-xs mt-1">
            تصفح أسعار البيع للفلاح وهوامش مكسبك المباشر بالجنيه على كل عبوة
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/distributor/orders"
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-3 rounded-xl border border-emerald-700 shadow-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>إصدار طلب جديد</span>
          </Link>
        </div>
      </div>

      {/* 2. Category Filter Bar */}
      <div className="bg-white p-3 sm:p-4 border border-slate-200/90 rounded-3xl shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Quick Categories */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => { setSelectedTypes([]); setSelectedCrops([]); }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                selectedTypes.length === 0 && selectedCrops.length === 0
                  ? "bg-emerald-600 text-white border-emerald-700 shadow-xs"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              كافة المنتجات
            </button>

            {PRODUCT_TYPES.map((type) => {
              const active = selectedTypes.includes(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                    active
                      ? "bg-emerald-600 text-white border-emerald-700 shadow-xs"
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {type}
                </button>
              );
            })}
          </div>

          {/* Search Box & Advanced Filter Toggle */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث باسم المنتج أو المادة..."
                className="w-full sm:w-56 bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-medium pl-8 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
            </div>

            <button
              onClick={() => setShowAdvanceFilter(!showAdvanceFilter)}
              className={`flex items-center gap-1 text-xs font-bold px-3.5 py-2.5 rounded-xl border transition-all flex-shrink-0 ${
                showAdvanceFilter || selectedCrops.length > 0
                  ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>المحاصيل</span>
              {selectedCrops.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
              )}
            </button>
          </div>
        </div>

        {/* Crops Filter Drawer */}
        {showAdvanceFilter && (
          <div className="pt-3 border-t border-slate-100 space-y-2 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-700">المحصول المستهدف:</span>
              {selectedCrops.length > 0 && (
                <button
                  onClick={() => setSelectedCrops([])}
                  className="text-red-600 text-[10px] font-bold hover:underline"
                >
                  مسح فلاتر المحاصيل
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CROPS.map((crop) => {
                const active = selectedCrops.includes(crop);
                return (
                  <button
                    key={crop}
                    onClick={() => toggleCrop(crop)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      active
                        ? "bg-emerald-600 text-white border-emerald-700 shadow-2xs"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {crop}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Results Indicator */}
      <p className="text-slate-500 text-xs font-medium">
        {loading ? "جاري تحميل كتالوج المنتجات..." : `تم العثور على ${filteredProducts.length} منتج`}
        {activeFiltersCount > 0 && ` (مصفى من إجمالي ${products.length})`}
      </p>

      {/* 3. Products Grid */}
      {loading ? (
        <div className="text-center py-20 text-slate-500">
          <div className="w-10 h-10 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          جاري تحميل دليل المنتجات...
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200/90 rounded-3xl shadow-xs">
          <div className="text-5xl mb-3">🔍</div>
          <p className="text-slate-900 font-bold text-base">لم نعثر على أي منتجات مطابقة</p>
          <p className="text-slate-500 text-xs mt-1">يرجى تعديل خيارات التصفية أو البحث</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {filteredProducts.map((p) => {
            const agentCommission = p.agent_commission || 0;
            const formattedPrice = Math.round(p.price_to_farmer || 0).toLocaleString("ar-EG");
            const formattedCommission = Math.round(agentCommission).toLocaleString("ar-EG");

            return (
              <div
                key={p.id}
                className="bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-5 shadow-xs flex flex-col justify-between hover:border-emerald-300 transition-all group"
              >
                <div>
                  {/* Top Image & Name */}
                  <div className="flex gap-3.5 items-start mb-3">
                    {p.image_url ? (
                      <ZoomableImage
                        src={p.image_url}
                        alt={p.name_ar}
                        className="w-18 h-18 sm:w-16 sm:h-16 rounded-2xl object-cover border border-slate-200 bg-slate-50 shrink-0 shadow-2xs"
                      />
                    ) : (
                      <div className="w-18 h-18 sm:w-16 sm:h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0 shadow-2xs text-2xl">
                        🧪
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <h3 className="font-bold text-slate-900 text-sm leading-snug group-hover:text-emerald-700 transition-colors truncate">
                          {p.name_ar}
                        </h3>
                      </div>

                      {p.active_ingredient && (
                        <p className="text-slate-500 text-[11px] truncate">{p.active_ingredient}</p>
                      )}

                      <div className="mt-1.5 flex items-center gap-1.5">
                        {p.stock_status ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            ✓ متوفر بالمخزن
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-800 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                            ✗ غير متوفر
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {p.product_type?.map((t) => {
                      const badge = TYPE_BADGES[t] || { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" };
                      return (
                        <span
                          key={t}
                          className={`text-[10px] px-2 py-0.5 rounded-md border font-bold ${badge.bg} ${badge.text} ${badge.border}`}
                        >
                          {t}
                        </span>
                      );
                    })}
                    {p.target_crops?.slice(0, 3).map((c) => (
                      <span key={c} className="text-[10px] px-2 py-0.5 rounded-md border bg-slate-50 text-slate-600 border-slate-200 font-medium">
                        🌾 {c}
                      </span>
                    ))}
                    {(p.target_crops?.length || 0) > 3 && (
                      <span className="text-[10px] px-1.5 py-0.5 text-slate-400 font-bold">
                        +{p.target_crops!.length - 3}
                      </span>
                    )}
                  </div>
                </div>

                {/* Pricing & Distributor Commission Matrix */}
                <div className="space-y-2.5 pt-3 border-t border-slate-100">
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-500 block">سعر البيع للمزارع:</span>
                      <span className="font-mono font-black text-slate-900 text-base">
                        {formattedPrice} <span className="text-xs font-normal">ج.م</span>
                      </span>
                    </div>
                    <span className="text-[11px] bg-slate-200/60 text-slate-700 px-2 py-0.5 rounded-lg font-bold">
                      السعر الرسمي
                    </span>
                  </div>

                  {/* Agent Commission Badge */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                    <span className="text-emerald-900 font-bold flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-emerald-700" />
                      صافي مكسبك (العمولة):
                    </span>
                    <span className="font-mono font-black text-emerald-950 text-sm">
                      +{formattedCommission} ج.م
                    </span>
                  </div>

                  {/* Action */}
                  <Link
                    href={`/distributor/orders`}
                    className="w-full bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs py-3 px-3 rounded-xl border border-slate-300 shadow-2xs flex items-center justify-center gap-1.5 transition-all active:scale-95"
                  >
                    <ShoppingCart className="w-3.5 h-3.5 text-emerald-700" />
                    <span>إنشاء طلب بهذا المنتج</span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

}
