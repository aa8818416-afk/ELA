"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { Image as ImageIcon, Filter, X } from "lucide-react";

type Product = {
  id: string;
  name_ar: string;
  active_ingredient: string | null;
  price_to_farmer: number;
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

export default function FarmerProductsPage() {
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
      .select("id, name_ar, active_ingredient, price_to_farmer, stock_status, image_url, product_type, target_crops")
      .eq("stock_status", true)
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
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">المنتجات المتاحة</h1>
          <p className="text-slate-400 text-sm mt-0.5">تصفح جميع المنتجات والمبيدات</p>
        </div>
        <button
          onClick={() => setShowFilter(!showFilter)}
          className={`relative flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
            showFilter || activeFiltersCount > 0
              ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
              : "bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-600"
          }`}
        >
          <Filter className="w-4 h-4" />
          فلتر
          {activeFiltersCount > 0 && (
            <span className="absolute -top-1.5 -left-1.5 w-5 h-5 bg-emerald-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
              {activeFiltersCount}
            </span>
          )}
        </button>
      </div>

      {/* Filter Panel */}
      {showFilter && (
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/60 rounded-2xl p-5 space-y-5">
          {/* Product Type Filter */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-200">نوع المنتج</h3>
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
                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                        : "bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600"
                    }`}
                  >
                    {active && "✓ "}{t}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-700/50" />

          {/* Crops Filter */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-200">نوع المحصول</h3>
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
                        ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                        : "bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600"
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
              className="w-full flex items-center justify-center gap-2 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-xl transition-colors border border-red-500/20"
            >
              <X className="w-4 h-4" />
              مسح جميع الفلاتر
            </button>
          )}
        </div>
      )}

      {/* Results Count */}
      <p className="text-slate-500 text-xs">
        {loading ? "جاري التحميل..." : `${filteredProducts.length} منتج`}
        {activeFiltersCount > 0 && ` (مفلتر من ${products.length})`}
      </p>

      {/* Products Grid */}
      {loading ? (
        <div className="text-center py-16 text-slate-400">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          جاري التحميل...
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">🔍</div>
          <p className="text-slate-300 font-medium">لا توجد منتجات مطابقة</p>
          <p className="text-slate-500 text-sm mt-1">جرب تعديل الفلاتر المختارة</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredProducts.map((p) => (
            <div
              key={p.id}
              className="bg-slate-900/60 backdrop-blur-sm border border-slate-800/60 rounded-2xl p-4 flex gap-4 hover:border-emerald-500/30 transition-all"
            >
              {/* Image */}
              <div className="shrink-0">
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.name_ar}
                    className="w-16 h-16 rounded-xl object-cover border border-slate-700"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500">
                    <ImageIcon className="w-7 h-7" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-white text-base leading-tight">{p.name_ar}</h3>
                  <div className="text-right shrink-0">
                    <span className="text-lg font-bold text-emerald-400">{p.price_to_farmer}</span>
                    <span className="text-slate-500 text-xs mr-1">ج.م</span>
                  </div>
                </div>

                {p.active_ingredient && (
                  <p className="text-slate-400 text-xs mt-0.5">{p.active_ingredient}</p>
                )}

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {p.product_type?.map((t) => (
                    <span
                      key={t}
                      className={`text-xs px-2 py-0.5 rounded-full border font-medium ${TYPE_COLORS[t] || "bg-slate-700 text-slate-300 border-slate-600"}`}
                    >
                      {t}
                    </span>
                  ))}
                  {p.target_crops?.slice(0, 3).map((c) => (
                    <span key={c} className="text-xs px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/20 font-medium">
                      {c}
                    </span>
                  ))}
                  {(p.target_crops?.length ?? 0) > 3 && (
                    <span className="text-xs px-2 py-0.5 rounded-full border bg-slate-800 text-slate-400 border-slate-700">
                      +{(p.target_crops?.length ?? 0) - 3}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
