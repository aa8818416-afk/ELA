"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { createOrder } from "@/app/actions/distributor";
import { ShoppingCart, Loader2, CheckCircle2, ChevronDown, Filter, X, Search } from "lucide-react";

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
    .replace(/[\u064B-\u0652]/g, "") // remove tashkeel
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
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
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
  if (maxLength === 0) return 1.0;
  return 1.0 - distance / maxLength;
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

  // Refs for clicking outside
  const farmerRef = useRef<HTMLDivElement>(null);
  const productRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (farmerRef.current && !farmerRef.current.contains(event.target as Node)) {
        setShowFarmerDropdown(false);
      }
      if (productRef.current && !productRef.current.contains(event.target as Node)) {
        setShowProductDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter & rank Farmers by search input
  const filteredFarmers = useMemo(() => {
    if (!farmerSearch.trim()) return farmers;
    return farmers
      .map((f) => ({
        ...f,
        similarity: getSimilarity(f.full_name, farmerSearch),
      }))
      .filter((item) => item.similarity > 0.35)
      .sort((a, b) => b.similarity - a.similarity);
  }, [farmers, farmerSearch]);

  // Filter & rank Products by selected category, crop type and search input
  const filteredProducts = useMemo(() => {
    let result = products;

    // Filter by type
    if (selectedTypes.length > 0) {
      result = result.filter((p) =>
        selectedTypes.some((t) => p.product_type?.includes(t))
      );
    }

    // Filter by target crops
    if (selectedCrops.length > 0) {
      result = result.filter((p) =>
        selectedCrops.some((c) => p.target_crops?.includes(c))
      );
    }

    if (!productSearch.trim()) return result;

    return result
      .map((p) => ({
        ...p,
        similarity: getSimilarity(p.name_ar, productSearch),
      }))
      .filter((item) => item.similarity > 0.35)
      .sort((a, b) => b.similarity - a.similarity);
  }, [products, productSearch, selectedTypes, selectedCrops]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId),
    [products, selectedProductId]
  );

  const totalPrice = selectedProduct
    ? selectedProduct.price_to_farmer * quantity
    : 0;

  const toggleTypeFilter = (type: string) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const toggleCropFilter = (crop: string) => {
    setSelectedCrops((prev) =>
      prev.includes(crop) ? prev.filter((c) => c !== crop) : [...prev, crop]
    );
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedFarmerId || !selectedProductId) {
      setError("الرجاء اختيار فلاح ومنتج صحيح من القائمة");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    formData.append("farmerId", selectedFarmerId);
    formData.append("productId", selectedProductId);
    formData.append("quantity", quantity.toString());
    formData.append("totalPrice", totalPrice.toString());

    const result = await createOrder(formData);

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
      // Reset form
      setSelectedProductId("");
      setProductSearch("");
      setSelectedFarmerId("");
      setFarmerSearch("");
      setQuantity(1);
    }
    setIsLoading(false);
  }

  const isProductSearchInvalid = productSearch.trim().length > 0 && filteredProducts.length === 0;
  const isFarmerSearchInvalid = farmerSearch.trim().length > 0 && filteredFarmers.length === 0;

  return (
    <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 lg:p-8 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-white">إنشاء طلب جديد</h3>
        <button
          type="button"
          onClick={() => setShowFiltersPanel(!showFiltersPanel)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
            showFiltersPanel || selectedTypes.length > 0 || selectedCrops.length > 0
              ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
              : "bg-slate-800/40 border-slate-700/60 text-slate-400 hover:text-slate-200"
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          تصفية المنتجات
        </button>
      </div>

      {showFiltersPanel && (
        <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-2xl space-y-4">
          <div>
            <h4 className="text-xs font-bold text-slate-400 mb-2">نوع المنتج:</h4>
            <div className="flex flex-wrap gap-2">
              {PRODUCT_TYPES.map((t) => {
                const active = selectedTypes.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTypeFilter(t)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                      active
                        ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                        : "bg-slate-900/80 border-slate-850 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-slate-400 mb-2">نوع المحصول المستهدف:</h4>
            <div className="flex flex-wrap gap-1.5">
              {CROPS.map((c) => {
                const active = selectedCrops.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleCropFilter(c)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-medium border transition-all ${
                      active
                        ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                        : "bg-slate-900/80 border-slate-850 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-4 rounded-2xl flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6" />
          <p>تم إصدار الطلب بنجاح! سيتم إرسال رسالة تأكيد للمزارع.</p>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-4 rounded-2xl text-sm font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Farmer Dropdown Autocomplete */}
        <div ref={farmerRef} className="relative">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            اختر الفلاح (ابحث باسم الفلاح)
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="اكتب اسم الفلاح للبحث والتحديد..."
              value={farmerSearch}
              onFocus={() => setShowFarmerDropdown(true)}
              onChange={(e) => {
                setFarmerSearch(e.target.value);
                setSelectedFarmerId(""); // Reset selection when user alters search input
                setShowFarmerDropdown(true);
              }}
              className={`w-full bg-slate-950 border text-white rounded-xl pr-10 pl-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 ${
                isFarmerSearchInvalid ? "border-red-500/40" : "border-slate-800"
              }`}
            />
            <Search className="w-4 h-4 text-slate-500 absolute right-3.5 top-3.5" />
            <ChevronDown className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5 cursor-pointer" onClick={() => setShowFarmerDropdown(!showFarmerDropdown)} />
          </div>

          {isFarmerSearchInvalid && (
            <p className="text-red-400 text-xs mt-1.5 font-medium">❌ غير متوفر</p>
          )}

          {showFarmerDropdown && (
            <div className="absolute z-50 w-full mt-1.5 bg-slate-900 border border-slate-800 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-850">
              {filteredFarmers.length === 0 ? (
                <div className="px-4 py-3 text-sm text-slate-500 text-center">لا يوجد فلاح بهذا الاسم</div>
              ) : (
                filteredFarmers.map((f) => (
                  <button
                    key={f.profile_id}
                    type="button"
                    onClick={() => {
                      setFarmerSearch(f.full_name);
                      setSelectedFarmerId(f.profile_id);
                      setShowFarmerDropdown(false);
                    }}
                    className="w-full text-right px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors block"
                  >
                    {f.full_name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Product Dropdown Autocomplete */}
        <div ref={productRef} className="relative">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            المنتج / المبيد (اكتب اسم المنتج)
          </label>
          <div className="flex gap-3 items-center">
            {selectedProduct?.image_url ? (
              <img
                src={selectedProduct.image_url}
                alt={selectedProduct.name_ar}
                className="w-12 h-12 rounded-xl object-cover bg-slate-800 shrink-0 border border-slate-700"
              />
            ) : selectedProduct ? (
              <div className="w-12 h-12 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0 text-slate-400 text-lg">
                📦
              </div>
            ) : null}
            
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="ابحث عن منتج بالاسم (مثال: نترات، نتريت، مبيد)..."
                value={productSearch}
                onFocus={() => setShowProductDropdown(true)}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setSelectedProductId(""); // Reset selection on change
                  setShowProductDropdown(true);
                }}
                className={`w-full bg-slate-950 border text-white rounded-xl pr-10 pl-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 ${
                  isProductSearchInvalid ? "border-red-500/40" : "border-slate-800"
                }`}
              />
              <Search className="w-4 h-4 text-slate-500 absolute right-3.5 top-3.5" />
              <ChevronDown className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5 cursor-pointer" onClick={() => setShowProductDropdown(!showProductDropdown)} />
            </div>
          </div>

          {isProductSearchInvalid && (
            <p className="text-red-400 text-xs mt-1.5 font-medium">❌ غير متوفر</p>
          )}

          {showProductDropdown && (
            <div className="absolute z-50 w-full mt-1.5 bg-slate-900 border border-slate-800 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-850">
              {filteredProducts.length === 0 ? (
                <div className="px-4 py-3 text-sm text-slate-500 text-center">لا توجد منتجات مطابقة</div>
              ) : (
                filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setProductSearch(p.name_ar);
                      setSelectedProductId(p.id);
                      setShowProductDropdown(false);
                    }}
                    className="w-full text-right px-4 py-3 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors flex items-center justify-between"
                  >
                    <span>{p.name_ar}</span>
                    <span className="text-emerald-400 font-bold text-xs">{p.price_to_farmer} ج.م</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              الكمية (عبوة)
            </label>
            <input
              type="number"
              min="1"
              required
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-right"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              الإجمالي (ج.م)
            </label>
            <div className="w-full bg-slate-950/50 border border-slate-850 text-amber-400 font-bold rounded-xl px-4 py-3 text-lg flex items-center justify-between">
              <span>{totalPrice.toLocaleString()}</span>
              <span className="text-sm font-medium text-amber-500/70">ج.م</span>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading || !selectedProductId || !selectedFarmerId}
          className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-amber-950 disabled:text-amber-500/30 disabled:cursor-not-allowed text-slate-950 font-bold rounded-xl py-4 mt-4 flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/10"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <ShoppingCart className="w-5 h-5" />
              تأكيد الطلب
            </>
          )}
        </button>
      </form>
    </div>
  );
}

