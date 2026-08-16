"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { createOrder } from "@/app/actions/distributor";
import { ShoppingCart, Loader2, CheckCircle2, ChevronDown, Filter, Search, Zap, User, Package, RotateCcw } from "lucide-react";
import { ZoomableImage } from "@/components/ui/ImageModal";

type Farmer = { profile_id: string; full_name: string };
type Product = {
  id: string;
  name_ar: string;
  price_to_farmer: number;
  image_url?: string | null;
  product_type?: string[] | null;
  target_crops?: string[] | null;
};

const PRODUCT_TYPES = ["مبيدات", "مغذيات", "أسمدة"];
const CROPS = [
  "القمح", "الأرز", "البطاطس", "الموالح",
  "البصل", "الطماطم", "بنجر السكر", "الذرة الصفراء", "القطن", "الثوم",
];

// Helper functions for Arabic normalization and similarity
function normalizeArabic(str: string): string {
  return str
    .replace(/[أإآا]/g, "ا")
    .replace(/[ةه]/g, "ه")
    .replace(/[ىي]/g, "ي")
    .replace(/[\u064B-\u0652]/g, "")
    .trim()
    .toLowerCase();
}

function getLevenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
  }
  return matrix[b.length][a.length];
}

function getSimilarity(s1: string, s2: string): number {
  const n1 = normalizeArabic(s1);
  const n2 = normalizeArabic(s2);
  if (n1 === n2) return 1.0;
  if (n1.includes(n2) || n2.includes(n1)) return 0.85;
  const distance = getLevenshteinDistance(n1, n2);
  const maxLength = Math.max(n1.length, n2.length);
  return maxLength === 0 ? 1.0 : 1.0 - distance / maxLength;
}

export default function OrderForm({
  farmers,
  products,
}: {
  farmers: Farmer[];
  products: Product[];
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Farmers selection states
  const [farmerSearch, setFarmerSearch] = useState("");
  const [selectedFarmerId, setSelectedFarmerId] = useState("");
  const [showFarmerDropdown, setShowFarmerDropdown] = useState(false);

  // Products selection states
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  // Product Filters
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedCrops, setSelectedCrops] = useState<string[]>([]);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);

  const [quantity, setQuantity] = useState<number>(1);
  const [mode, setMode] = useState<"quick" | "catalog">("quick");

  const farmerRef = useRef<HTMLDivElement>(null);
  const productRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (farmerRef.current && !farmerRef.current.contains(event.target as Node)) setShowFarmerDropdown(false);
      if (productRef.current && !productRef.current.contains(event.target as Node)) setShowProductDropdown(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredFarmers = useMemo(() => {
    if (!farmerSearch.trim()) return farmers;
    return farmers
      .map((f) => ({ farmer: f, score: getSimilarity(f.full_name, farmerSearch) }))
      .filter(({ score }) => score > 0.3)
      .sort((a, b) => b.score - a.score)
      .map(({ farmer }) => farmer);
  }, [farmers, farmerSearch]);

  const filteredProducts = useMemo(() => {
    let result = products;
    if (selectedTypes.length > 0) result = result.filter((p) => p.product_type?.some((t) => selectedTypes.includes(t)));
    if (selectedCrops.length > 0) result = result.filter((p) => p.target_crops?.some((c) => selectedCrops.includes(c)));
    if (productSearch.trim()) {
      result = result
        .map((p) => ({ product: p, score: getSimilarity(p.name_ar, productSearch) }))
        .filter(({ score }) => score > 0.3)
        .sort((a, b) => b.score - a.score)
        .map(({ product }) => product);
    }
    return result;
  }, [products, productSearch, selectedTypes, selectedCrops]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const selectedFarmer = farmers.find((f) => f.profile_id === selectedFarmerId);

  const totalPrice = selectedProduct ? selectedProduct.price_to_farmer * quantity : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFarmerId || !selectedProductId || quantity < 1) {
      setError("يرجى اختيار الفلاح والمنتج وتحديد الكمية بشكل صحيح");
      return;
    }
    setIsLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append("farmerId", selectedFarmerId);
    formData.append("productId", selectedProductId);
    formData.append("quantity", quantity.toString());
    formData.append("totalPrice", totalPrice.toString());
    const result = await createOrder(formData);
    if (result.error) {
      setError(result.error);
      setIsLoading(false);
    } else {
      setSuccess(true);
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedFarmerId("");
    setSelectedProductId("");
    setFarmerSearch("");
    setProductSearch("");
    setQuantity(1);
    setSuccess(false);
    setError(null);
  };

  if (success) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-emerald-200 text-center shadow-xs space-y-5 animate-in fade-in zoom-in-95 duration-200">
        <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto border border-emerald-200 shadow-2xs">
          <CheckCircle2 className="w-10 h-10 text-emerald-600" />
        </div>
        <div>
          <h3 className="text-xl font-black text-slate-900">تم تسجيل الطلب بنجاح! 🎉</h3>
          <p className="text-slate-500 text-xs mt-1">تم تسجيل طلب {selectedProduct?.name_ar} للمزارع {selectedFarmer?.full_name} وإدراجه ضمن تسليمات القرية.</p>
        </div>
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 max-w-sm mx-auto text-xs space-y-2">
          <div className="flex justify-between">
            <span className="text-slate-500">المزارع:</span>
            <span className="font-bold text-slate-900">{selectedFarmer?.full_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">المركب:</span>
            <span className="font-bold text-slate-900">{selectedProduct?.name_ar}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">الكمية:</span>
            <span className="font-bold text-slate-900">{quantity} عبوة/شيكارة</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-slate-200">
            <span className="text-slate-700 font-bold">المبلغ المطلوب:</span>
            <span className="font-black font-mono text-emerald-800">{totalPrice.toLocaleString()} ج.م</span>
          </div>
        </div>
        <button onClick={handleReset} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-6 py-2.5 rounded-xl border border-emerald-700 shadow-xs transition-all active:scale-95 flex items-center gap-1.5 mx-auto">
          <RotateCcw className="w-3.5 h-3.5" /> تسجيل طلب آخر
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl p-4 sm:p-8 border border-slate-200/90 shadow-xs">
      {/* Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-slate-100">
        <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setMode("quick")}
            className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all border ${
              mode === "quick"
                ? "bg-emerald-600 text-white border-emerald-700 shadow-xs"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>طلب سريع</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("catalog")}
            className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all border ${
              mode === "catalog"
                ? "bg-emerald-600 text-white border-emerald-700 shadow-xs"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>تصفح الكتالوج</span>
          </button>
        </div>

        <span className="text-[11px] sm:text-xs text-slate-500 font-medium text-left">
          {farmers.length} مزارع متاح
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
        {/* Step 1: Farmer Selector */}
        <div ref={farmerRef} className="relative">
          <label className="block text-xs font-bold text-slate-900 mb-1.5 flex items-center gap-1">
            <User className="w-3.5 h-3.5 text-emerald-700" />
            <span>1. اختيار الفلاح المستفيد</span>
            <span className="text-red-500">*</span>
          </label>
          <div
            onClick={() => setShowFarmerDropdown(true)}
            className="w-full bg-slate-50 border border-slate-300 hover:border-emerald-500 rounded-2xl px-4 py-3 text-xs text-slate-900 font-medium flex items-center justify-between cursor-pointer transition-all shadow-2xs"
          >
            <span className="truncate">{selectedFarmer ? selectedFarmer.full_name : "اضغط للبحث واختيار الفلاح..."}</span>
            <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
          </div>

          {showFarmerDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-3 space-y-2 max-h-64 overflow-y-auto">
              <div className="relative">
                <input
                  type="text"
                  value={farmerSearch}
                  onChange={(e) => setFarmerSearch(e.target.value)}
                  placeholder="اكتب اسم الفلاح للبحث..."
                  autoFocus
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-medium pl-8 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
              </div>

              <div className="divide-y divide-slate-100">
                {filteredFarmers.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-3">لا يوجد فلاح بهذا الاسم</p>
                ) : (
                  filteredFarmers.map((f) => (
                    <div
                      key={f.profile_id}
                      onClick={() => {
                        setSelectedFarmerId(f.profile_id);
                        setShowFarmerDropdown(false);
                      }}
                      className={`p-3 rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center justify-between ${
                        selectedFarmerId === f.profile_id
                          ? "bg-emerald-50 text-emerald-800 font-bold"
                          : "hover:bg-slate-50 text-slate-800"
                      }`}
                    >
                      <span>{f.full_name}</span>
                      {selectedFarmerId === f.profile_id && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Product Selector */}
        <div ref={productRef} className="relative">
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold text-slate-900 flex items-center gap-1">
              <Package className="w-3.5 h-3.5 text-emerald-700" />
              <span>2. تحديد المنتج الزراعي</span>
              <span className="text-red-500">*</span>
            </label>
            {mode === "catalog" && (
              <button
                type="button"
                onClick={() => setShowFiltersPanel(!showFiltersPanel)}
                className="text-emerald-700 hover:text-emerald-800 text-[11px] font-bold flex items-center gap-1"
              >
                <Filter className="w-3 h-3" /> فلترة
              </button>
            )}
          </div>

          {/* Filter Panel in Catalog mode */}
          {mode === "catalog" && showFiltersPanel && (
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 mb-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">نوع المركب:</span>
                {(selectedTypes.length > 0 || selectedCrops.length > 0) && (
                  <button
                    type="button"
                    onClick={() => { setSelectedTypes([]); setSelectedCrops([]); }}
                    className="text-red-600 text-[10px] font-bold"
                  >
                    مسح الكل
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PRODUCT_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      setSelectedTypes((prev) =>
                        prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
                      )
                    }
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                      selectedTypes.includes(t)
                        ? "bg-emerald-600 text-white border-emerald-700"
                        : "bg-white text-slate-700 border-slate-300"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div
            onClick={() => setShowProductDropdown(true)}
            className="w-full bg-slate-50 border border-slate-300 hover:border-emerald-500 rounded-2xl px-4 py-3 text-xs text-slate-900 font-medium flex items-center justify-between cursor-pointer transition-all shadow-2xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              {selectedProduct?.image_url && (
                <ZoomableImage
                  src={selectedProduct.image_url}
                  alt={selectedProduct.name_ar}
                  className="w-6 h-6 rounded-md object-cover flex-shrink-0"
                />
              )}
              <span className="truncate">
                {selectedProduct
                  ? `${selectedProduct.name_ar} (${selectedProduct.price_to_farmer} ج.م)`
                  : "اضغط للبحث واختيار المنتج..."}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
          </div>

          {showProductDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-3 space-y-2 max-h-72 overflow-y-auto">
              <div className="relative">
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="ابحث باسم السماد أو المبيد..."
                  autoFocus
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-medium pl-8 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
              </div>

              <div className="divide-y divide-slate-100">
                {filteredProducts.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-3">لا توجد منتجات مطابقة</p>
                ) : (
                  filteredProducts.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => {
                        setSelectedProductId(p.id);
                        setShowProductDropdown(false);
                      }}
                      className={`p-2.5 rounded-xl text-xs cursor-pointer transition-all flex items-center justify-between ${
                        selectedProductId === p.id
                          ? "bg-emerald-50 text-emerald-900 font-bold"
                          : "hover:bg-slate-50 text-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {p.image_url ? (
                          <ZoomableImage
                            src={p.image_url}
                            alt={p.name_ar}
                            className="w-7 h-7 rounded-md object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-7 h-7 bg-slate-100 rounded-md flex items-center justify-center text-slate-400 flex-shrink-0">
                            📦
                          </div>
                        )}
                        <span className="font-bold truncate">{p.name_ar}</span>
                      </div>
                      <span className="font-bold font-mono text-emerald-800 flex-shrink-0 mr-2">
                        {Math.round(p.price_to_farmer).toLocaleString("ar-EG")} ج.م
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Step 3: Quantity Selector */}
        <div>
          <label className="block text-xs font-bold text-slate-900 mb-1.5">3. تحديد الكمية المطلوبة</label>
          <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
            <span className="text-xs text-slate-700 font-medium">الكمية (بالعبوة):</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-10 h-10 rounded-xl bg-white border border-slate-300 text-slate-700 font-black text-base flex items-center justify-center hover:bg-slate-100 active:scale-90 transition-all shadow-2xs"
              >
                -
              </button>
              <span className="w-10 text-center font-black text-base font-mono text-slate-900">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                className="w-10 h-10 rounded-xl bg-emerald-600 border border-emerald-700 text-white font-black text-base flex items-center justify-center hover:bg-emerald-700 active:scale-90 transition-all shadow-2xs"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Total Price & Error */}
        {selectedProduct && (
          <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-emerald-800 font-bold">إجمالي سعر الفلاح</p>
              <p className="text-lg font-black text-emerald-950 font-mono">
                {Math.round(totalPrice).toLocaleString("ar-EG")} <span className="text-xs font-normal">ج.م</span>
              </p>
            </div>
            <span className="text-xs bg-emerald-100 text-emerald-900 font-bold px-2.5 py-1 rounded-xl border border-emerald-300">
              تجميع للخصم الجماعي 🏆
            </span>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
            ⚠️ {error}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading || !selectedFarmerId || !selectedProductId}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:border-slate-300 text-white font-bold text-sm rounded-2xl py-3.5 px-4 shadow-xs border border-emerald-700 transition-all flex items-center justify-center gap-2 active:scale-95"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>جاري إصدار الطلب...</span>
            </>
          ) : (
            <>
              <ShoppingCart className="w-4 h-4" />
              <span>تأكيد وإصدار الطلب للفلاح</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}

