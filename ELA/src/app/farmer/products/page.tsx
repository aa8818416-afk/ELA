"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { Image as ImageIcon, Filter, X, ShoppingBag } from "lucide-react";
import { ZoomableImage } from "@/components/ui/ImageModal";
import QuickOrderModal from "@/components/chat/QuickOrderModal";
import type { RecommendedProduct } from "@/components/chat/QuickOrderModal";

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

  // حالة مودال الشراء
  const [orderProduct, setOrderProduct] = useState<RecommendedProduct | null>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

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

  function handleBuyClick(p: Product) {
    setOrderProduct({
      id: p.id,
      name_ar: p.name_ar,
      price_to_farmer: p.price_to_farmer,
      image_url: p.image_url,
      active_ingredient: p.active_ingredient,
    });
    setIsOrderModalOpen(true);
  }

  return (
    <div className="space-y-5 text-right font-sans text-slate-900" dir="rtl">
      {/* Header */}
      <div className="bg-white border border-slate-200/80 p-4 sm:p-5 rounded-3xl shadow-xs flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900">سوق مستلزمات المزرعة</h1>
          <p className="text-slate-500 text-xs mt-0.5">تصفح الأسمدة والمبيدات المعتمدة بأسعار الجملة</p>
        </div>
        <button
          onClick={() => setShowFilter(!showFilter)}
          className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-black transition-all shadow-xs ${
            showFilter || activeFiltersCount > 0
              ? "bg-emerald-50 border-emerald-300 text-emerald-800"
              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          <span>فلترة</span>
          {activeFiltersCount > 0 && (
            <span className="absolute -top-1.5 -left-1.5 w-5 h-5 bg-emerald-600 text-white text-[10px] rounded-full flex items-center justify-center font-bold shadow-xs">
              {activeFiltersCount}
            </span>
          )}
        </button>
      </div>

      {/* Filter Panel */}
      {showFilter && (
        <div className="bg-white border border-slate-200/90 rounded-3xl p-5 space-y-4 shadow-xs">
          {/* Product Type Filter */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-bold text-slate-800">نوع المنتج</h3>
              {selectedTypes.length > 0 && (
                <button onClick={() => setSelectedTypes([])} className="text-[11px] text-slate-400 hover:text-red-600 transition-colors font-medium">
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
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all shadow-xs ${
                      active
                        ? "bg-emerald-600 text-white border-emerald-700"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {active && "✓ "}{t}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-100" />

          {/* Crops Filter */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-bold text-slate-800">نوع المحصول</h3>
              {selectedCrops.length > 0 && (
                <button onClick={() => setSelectedCrops([])} className="text-[11px] text-slate-400 hover:text-red-600 transition-colors font-medium">
                  مسح
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CROPS.map((c) => {
                const active = selectedCrops.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => toggleFilter(selectedCrops, c, setSelectedCrops)}
                    className={`px-3 py-1 rounded-xl text-xs font-medium border transition-all shadow-xs ${
                      active
                        ? "bg-amber-100 border-amber-300 text-amber-900 font-bold"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
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
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition-colors border border-red-200"
            >
              <X className="w-3.5 h-3.5" />
              مسح جميع الفلاتر
            </button>
          )}
        </div>
      )}

      {/* Results Count */}
      <p className="text-slate-500 text-xs font-medium px-1">
        {loading ? "جاري التحميل..." : `المتاح: ${filteredProducts.length} منتج`}
        {activeFiltersCount > 0 && ` (مفلتر من ${products.length})`}
      </p>

      {/* Products Grid */}
      {loading ? (
        <div className="text-center py-16 text-slate-400">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          جاري التحميل...
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 shadow-xs">
          <div className="text-5xl mb-3">🔍</div>
          <p className="text-slate-900 font-black">لا توجد منتجات مطابقة</p>
          <p className="text-slate-500 text-xs mt-1">جرب تعديل الفلاتر المختارة</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {filteredProducts.map((p) => (
            <div
              key={p.id}
              className="bg-white border border-slate-200/90 rounded-3xl p-4 flex flex-col justify-between shadow-xs hover:border-emerald-300 transition-all space-y-3"
            >
              {/* Row: Image + Info */}
              <div className="flex gap-3.5">
                {/* Image */}
                <div className="shrink-0">
                  {p.image_url ? (
                    <ZoomableImage
                      src={p.image_url}
                      alt={p.name_ar}
                      className="w-16 h-16 rounded-2xl object-cover border border-slate-200 bg-slate-50 shadow-xs"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 text-2xl shadow-xs">
                      🧪
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <h3 className="font-bold text-slate-900 text-sm leading-tight truncate">{p.name_ar}</h3>
                    <div className="text-left shrink-0">
                      <span className="text-base font-black text-emerald-700 font-mono">{p.price_to_farmer}</span>
                      <span className="text-slate-500 text-[11px] mr-0.5">ج.م</span>
                    </div>
                  </div>

                  {p.active_ingredient && (
                    <p className="text-slate-500 text-[11px] truncate mt-0.5">{p.active_ingredient}</p>
                  )}

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {p.product_type?.map((t) => (
                      <span
                        key={t}
                        className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${
                          t === "مبيدات"
                            ? "bg-red-50 text-red-700 border-red-200"
                            : t === "مغذيات"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}
                      >
                        {t}
                      </span>
                    ))}
                    {p.target_crops?.slice(0, 2).map((c) => (
                      <span key={c} className="text-[10px] px-2 py-0.5 rounded-full border bg-slate-100 text-slate-600 border-slate-200 font-medium">
                        {c}
                      </span>
                    ))}
                    {(p.target_crops?.length ?? 0) > 2 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-slate-50 text-slate-500 border-slate-200">
                        +{(p.target_crops?.length ?? 0) - 2}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Buy Button */}
              <button
                onClick={() => handleBuyClick(p)}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs font-black rounded-xl transition-all shadow-xs border border-emerald-700"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>طلب سريع 🛒</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Quick Order Modal */}
      <QuickOrderModal
        product={orderProduct}
        isOpen={isOrderModalOpen}
        onClose={() => {
          setIsOrderModalOpen(false);
          setOrderProduct(null);
        }}
      />
    </div>
  );
}
