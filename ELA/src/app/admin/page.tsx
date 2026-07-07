"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { saveProduct } from "@/app/actions/admin-products";
import type { Database } from "@/types/database.types";
import { Package, Plus, Edit2, X, CheckCircle2, TrendingUp, Loader2, Image as ImageIcon } from "lucide-react";

type Product = Database["public"]["Tables"]["products"]["Row"];

const PRODUCT_TYPES = [
  { value: "مبيدات", label: "🧪 مبيدات" },
  { value: "مغذيات", label: "🌿 مغذيات" },
  { value: "أسمدة", label: "🌱 أسمدة" },
];

const CROPS = [
  { value: "القمح", label: "🌾 القمح" },
  { value: "الأرز", label: "🍚 الأرز" },
  { value: "البطاطس", label: "🥔 البطاطس" },
  { value: "الموالح", label: "🍊 الموالح (البرتقال والليمون)" },
  { value: "البصل", label: "🧅 البصل" },
  { value: "الطماطم", label: "🍅 الطماطم" },
  { value: "بنجر السكر", label: "🌰 بنجر السكر" },
  { value: "الذرة الصفراء", label: "🌽 الذرة الصفراء" },
  { value: "القطن", label: "☁️ القطن" },
  { value: "الثوم", label: "🧄 الثوم" },
];

const TYPE_COLORS: Record<string, string> = {
  "مبيدات": "bg-red-50 text-red-700 border-red-200",
  "مغذيات": "bg-blue-50 text-blue-700 border-blue-200",
  "أسمدة": "bg-green-50 text-green-700 border-green-200",
};


export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [formData, setFormData] = useState({
    name_ar: "",
    active_ingredient: "",
    wholesale_cost: 0,
    price_to_farmer: 0,
    agent_commission: 0,
    stock_status: true,
    image_url: "",
    product_type: [] as string[],
    target_crops: [] as string[],
  });

  const supabase = createClient();

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    setLoading(true);
    const { data, error } = await supabase.from("products").select("*").order("name_ar");
    if (!error && data) {
      setProducts(data);
    }
    setLoading(false);
  }

  function toggleArrayValue(arr: string[], value: string): string[] {
    return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
  }

  function openNewProduct() {
    setEditingId(null);
    setFormData({
      name_ar: "",
      active_ingredient: "",
      wholesale_cost: 0,
      price_to_farmer: 0,
      agent_commission: 0,
      stock_status: true,
      image_url: "",
      product_type: [],
      target_crops: [],
    });
    setImageFile(null);
    setIsModalOpen(true);
  }

  function openEditProduct(product: Product) {
    setEditingId(product.id);
    setFormData({
      name_ar: product.name_ar,
      active_ingredient: product.active_ingredient || "",
      wholesale_cost: product.wholesale_cost,
      price_to_farmer: product.price_to_farmer,
      agent_commission: product.agent_commission,
      stock_status: product.stock_status,
      image_url: product.image_url || "",
      product_type: product.product_type || [],
      target_crops: product.target_crops || [],
    });
    setImageFile(null);
    setIsModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setUploadingImage(true);
    let finalImageUrl = formData.image_url;

    // Handle image upload if a new file is selected
    if (imageFile) {
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${Math.random()}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, imageFile);

      if (uploadError) {
        alert("فشل رفع الصورة: " + uploadError.message);
        setUploadingImage(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      finalImageUrl = publicUrl;
    }

    const payload = {
      ...formData,
      image_url: finalImageUrl || null
    };

    const res = await saveProduct(payload, editingId || undefined);
    setUploadingImage(false);

    if (res.error) {
      alert(res.error);
    } else {
      setIsModalOpen(false);
      fetchProducts();
    }
  }

  return (
    <div className="space-y-6 relative">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Package className="w-6 h-6 text-green-600" />
          إدارة المنتجات والتسعير
        </h2>
        <button
          onClick={openNewProduct}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          إضافة منتج جديد
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 text-sm">
              <tr>
                <th className="px-6 py-4 font-medium">اسم المنتج</th>
                <th className="px-6 py-4 font-medium">نوع المنتج</th>
                <th className="px-6 py-4 font-medium">المحاصيل المستهدفة</th>
                <th className="px-6 py-4 font-medium">المادة الفعالة</th>
                <th className="px-6 py-4 font-medium">تكلفة الجملة</th>
                <th className="px-6 py-4 font-medium">سعر المزارع</th>
                <th className="px-6 py-4 font-medium">عمولة الموزع</th>
                <th className="px-6 py-4 font-medium text-green-700">الربح الصافي</th>
                <th className="px-6 py-4 font-medium">المخزون</th>
                <th className="px-6 py-4 font-medium">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                  <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-slate-400">
                    جاري التحميل...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-slate-400">
                    لا توجد منتجات مسجلة.
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const netProfit = p.price_to_farmer - p.wholesale_cost - p.agent_commission;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-800">
                        <div className="flex items-center gap-3">
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name_ar} className="w-10 h-10 object-cover rounded-lg border border-slate-200" />
                          ) : (
                            <div className="w-10 h-10 bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400">
                              <ImageIcon className="w-5 h-5" />
                            </div>
                          )}
                          {p.name_ar}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {p.product_type && p.product_type.length > 0 ? p.product_type.map((t) => (
                            <span key={t} className={`text-xs px-2 py-0.5 rounded-full border font-medium ${TYPE_COLORS[t] || "bg-slate-50 text-slate-600 border-slate-200"}`}>
                              {t}
                            </span>
                          )) : <span className="text-slate-400 text-sm">—</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {p.target_crops && p.target_crops.length > 0 ? p.target_crops.map((c) => (
                            <span key={c} className="text-xs px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200 font-medium">
                              {c}
                            </span>
                          )) : <span className="text-slate-400 text-sm">—</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-sm">{p.active_ingredient || "—"}</td>
                      <td className="px-6 py-4 text-slate-600">{p.wholesale_cost} ج.م</td>
                      <td className="px-6 py-4 font-semibold text-blue-600">{p.price_to_farmer} ج.م</td>
                      <td className="px-6 py-4 text-slate-600">{p.agent_commission} ج.م</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-sm font-bold bg-green-50 text-green-700 border border-green-100">
                          <TrendingUp className="w-3.5 h-3.5" />
                          {netProfit} ج.م
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {p.stock_status ? (
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-green-600">
                            <CheckCircle2 className="w-4 h-4" /> متوفر
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-red-500">
                            <X className="w-4 h-4" /> غير متوفر
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => openEditProduct(p)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
              <h3 className="text-xl font-bold text-slate-800">
                {editingId ? "تعديل بيانات المنتج" : "إضافة منتج جديد"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">اسم المنتج</label>
                  <input
                    type="text"
                    required
                    value={formData.name_ar}
                    onChange={(e) => setFormData({ ...formData, name_ar: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white text-slate-800"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">المادة الفعالة (اختياري)</label>
                  <input
                    type="text"
                    value={formData.active_ingredient}
                    onChange={(e) => setFormData({ ...formData, active_ingredient: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">التكلفة (جملة)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.wholesale_cost || ""}
                    onChange={(e) => setFormData({ ...formData, wholesale_cost: Number(e.target.value) })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">سعر البيع للمزارع</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.price_to_farmer || ""}
                    onChange={(e) => setFormData({ ...formData, price_to_farmer: Number(e.target.value) })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">عمولة السفير (الموزع)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.agent_commission || ""}
                    onChange={(e) => setFormData({ ...formData, agent_commission: Number(e.target.value) })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white text-slate-800"
                  />
                </div>
                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.stock_status}
                      onChange={(e) => setFormData({ ...formData, stock_status: e.target.checked })}
                      className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
                    />
                    <span className="font-medium text-slate-700">متوفر في المخزن</span>
                  </label>
                </div>

              </div>

              {/* Product Type Multi-Select */}
              <div className="mb-4 border border-slate-200 rounded-xl p-4 bg-slate-50">
                <label className="block text-sm font-bold text-slate-700 mb-3">
                  🏷️ نوع المنتج <span className="text-slate-400 font-normal text-xs">(يمكن اختيار أكثر من نوع)</span>
                </label>
                <div className="flex flex-wrap gap-3">
                  {PRODUCT_TYPES.map((pt) => {
                    const selected = formData.product_type.includes(pt.value);
                    return (
                      <button
                        key={pt.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, product_type: toggleArrayValue(formData.product_type, pt.value) })}
                        className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all select-none ${
                          selected
                            ? "border-green-500 bg-green-50 text-green-700"
                            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                        }`}
                      >
                        {selected && <span className="ml-1">✓</span>}
                        {pt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Target Crops Multi-Select */}
              <div className="mb-4 border border-slate-200 rounded-xl p-4 bg-slate-50">
                <label className="block text-sm font-bold text-slate-700 mb-3">
                  🌾 المحاصيل المستهدفة <span className="text-slate-400 font-normal text-xs">(يمكن اختيار أكثر من محصول)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {CROPS.map((crop) => {
                    const selected = formData.target_crops.includes(crop.value);
                    return (
                      <button
                        key={crop.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, target_crops: toggleArrayValue(formData.target_crops, crop.value) })}
                        className={`px-3 py-1.5 rounded-lg border-2 text-sm font-medium transition-all select-none ${
                          selected
                            ? "border-amber-500 bg-amber-50 text-amber-700"
                            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                        }`}
                      >
                        {selected && <span className="ml-1">✓</span>}
                        {crop.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Image Upload */}
              <div className="mb-4 border border-slate-200 rounded-xl p-4 bg-slate-50">
                <label className="block text-sm font-bold text-slate-700 mb-2">📷 صورة المنتج</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setImageFile(e.target.files[0]);
                    }
                  }}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none bg-white"
                />
                {formData.image_url && !imageFile && (
                  <div className="mt-2 flex items-center gap-2">
                    <img src={formData.image_url} alt="Current Preview" className="w-12 h-12 rounded object-cover border border-slate-200" />
                    <span className="text-sm text-slate-500">الصورة الحالية المرفوعة</span>
                  </div>
                )}
                {imageFile && (
                  <div className="mt-2 text-sm text-green-600 font-medium">
                    تم اختيار صورة جديدة: {imageFile.name}
                  </div>
                )}
              </div>

              {/* Profit Preview */}
              <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-100 flex justify-between items-center">
                <span className="text-blue-800 font-medium">الربح الصافي المتوقع:</span>
                <span className="text-xl font-bold text-blue-700">
                  {formData.price_to_farmer - formData.wholesale_cost - formData.agent_commission} ج.م
                </span>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={uploadingImage}
                  className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={uploadingImage}
                  className="px-5 py-2.5 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors shadow-sm flex items-center gap-2 disabled:bg-green-800"
                >
                  {uploadingImage ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      جاري الحفظ والرفع...
                    </>
                  ) : (
                    "حفظ البيانات"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
