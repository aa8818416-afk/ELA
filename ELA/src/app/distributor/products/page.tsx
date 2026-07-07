"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { Image as ImageIcon, Filter, X, TrendingUp } from "lucide-react";

type Product = {
  id: string;
  name_ar: string;
  active_ingredient: string | null;
  price_to_farmer: number;
  wholesale_cost: number;
  agent_commission: number;
  stock_status: boolean;
  image_url: string | null;
  product_type: string[] | null;
  target_crops: string[] | null;
};

const PRODUCT_TYPES = ["مبيدات", "مغذيات", "أسمدة"];
const CROPS = [
  "القمح", "الأرز", "البطاطس", "الموالح",
  "البصل", "الطماطم", "بنجر السكر", "الذرة الصفراء", "القطن", "الثوم",
];

const TYPE_COLORS: Record<string, string> = {
  "مبيدات": "bg-red-500/20 text-red-300 border-red-500/30",
  "مغذيات": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "أسمدة": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
};

export default function DistributorProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedCrops, setSelectedCrops] = useState<string[]>([]);
  const [showFilter, setShowFilter] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("name_ar");
    if (!error && data) {
      setProducts(data as Product[]);
    }
    setLoading(false);
  }

  function toggleFilter(arr: string[], value: string, setter: (v: string[]) => void) {
    setter(arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]);
  }

  const filteredProducts = products.filter((p) => {
    const typeMatch =
      selectedTypes.length === 0 ||
      selectedTypes.some((t) => p.product_type?.includes(t));
    const cropMatch =
      selectedCrops.length === 0 ||
      selectedCrops.some((c) => p.target_crops?.includes(c));
    return typeMatch && cropMatch;
  });

  const activeFiltersCount = selectedTypes.length + selectedCrops.length;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">📦 دليل المنتجات</h1>
          <p className="text-slate-400 text-sm mt-1">تصفح المنتجات المتوفرة، الأسعار، وعمولات التوزيع</p>
        </div>
        <button
          onClick={() => setShowFilter(!showFilter)}
          className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
            showFilter || activeFiltersCount > 0
              ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
              : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
          }`}
        >
          <Filter className="w-4 h-4" />
          تصفية المنتجات
          {activeFiltersCount > 0 && (
            <span className="absolute -top-1.5 -left-1.5 w-5 h-5 bg-amber-500 text-slate-950 text-xs rounded-full flex items-center justify-center font-bold">
              {activeFiltersCount}
            </span>
          )}
        </button>
      </div>

      {/* Filter Panel */}
      {showFilter && (
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 space-y-6">
          {/* Product Type Filter */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-200">🏷️ نوع المنتج</h3>
              {selectedTypes.length > 0 && (
                <button onClick={() => setSelectedTypes([])} className="text-xs text-slate-400 hover:text-red-400 transition-colors">
                  مسح
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {PRODUCT_TYPES.map((t) => {
                const active = selectedTypes.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleFilter(selectedTypes, t, setSelectedTypes)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                      active
                        ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                    }`}
                  >
                    {active && "✓ "}{t}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-800" />

          {/* Crops Filter */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-200">🌾 نوع المحصول المستهدف</h3>
              {selectedCrops.length > 0 && (
                <button onClick={() => setSelectedCrops([])} className="text-xs text-slate-400 hover:text-red-400 transition-colors">
                  مسح
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {CROPS.map((c) => {
                const active = selectedCrops.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => toggleFilter(selectedCrops, c, setSelectedCrops)}
                    className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
                      active
                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                    }`}
                  >
                    {active && "✓ "}{c}
                  </button>
                );
              })}
            </div>
          </div>

          {activeFiltersCount > 0 && (
            <button
              onClick={() => { setSelectedTypes([]); setSelectedCrops([]); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-red-400 hover:bg-red-500/10 rounded-xl transition-colors border border-red-500/20"
            >
              <X className="w-4 h-4" />
              إعادة تعيين كافة الفلاتر
            </button>
          )}
        </div>
      )}

      {/* Results Count */}
      <p className="text-slate-500 text-sm">
        {loading ? "جاري تحميل المنتجات..." : `تم العثور على ${filteredProducts.length} منتج`}
        {activeFiltersCount > 0 && ` (مصفى من إجمالي ${products.length})`}
      </p>

      {/* Products Grid */}
      {loading ? (
        <div className="text-center py-20 text-slate-400">
          <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          جاري تحميل دليل المنتجات...
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-20 bg-slate-900/30 border border-slate-800/50 rounded-3xl">
          <div className="text-6xl mb-4">🔍</div>
          <p className="text-slate-300 font-bold text-lg">لم نعثر على أي منتجات مطابقة</p>
          <p className="text-slate-500 text-sm mt-2">يرجى تعديل خيارات التصفية والبحث</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map((p) => {
            const agentNetProfit = p.agent_commission;
            return (
              <div
                key={p.id}
                className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 flex flex-col justify-between hover:border-amber-500/30 transition-all group"
              >
                <div>
                  {/* Image & Basic Info */}
                  <div className="flex gap-4 items-start mb-4">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name_ar}
                        className="w-20 h-20 rounded-2xl object-cover border border-slate-800 bg-slate-950 shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-600 shrink-0">
                        <ImageIcon className="w-8 h-8" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="font-bold text-white text-lg leading-snug group-hover:text-amber-400 transition-colors">
                        {p.name_ar}
                      </h3>
                      {p.active_ingredient && (
                        <p className="text-slate-400 text-xs mt-1 truncate">{p.active_ingredient}</p>
                      )}
                      <div className="mt-2">
                        {p.stock_status ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            ✓ متوفر في المخزن
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                            ✗ غير متوفر
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {p.product_type?.map((t) => (
                      <span
                        key={t}
                        className={`text-xs px-2.5 py-1 rounded-full border font-medium ${TYPE_COLORS[t] || "bg-slate-800 text-slate-300 border-slate-700"}`}
                      >
                        {t}
                      </span>
                    ))}
                    {p.target_crops?.map((c) => (
                      <span key={c} className="text-xs px-2.5 py-1 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/20 font-medium">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Financial Info */}
                <div className="border-t border-slate-800/80 pt-4 mt-2 space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-400">سعر المزارع:</span>
                    <span className="font-bold text-white text-base">{p.price_to_farmer} ج.م</span>
                  </div>

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-400">عمولتك (الموزع):</span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <TrendingUp className="w-3.5 h-3.5" />
                      +{agentNetProfit} ج.م
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
