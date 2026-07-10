"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { saveProduct } from "@/app/actions/admin-products";
import { saveGroupBuyOffer, deleteGroupBuyOffer } from "@/app/actions/admin-group-buys";
import type { Database } from "@/types/database.types";
import { Package, Plus, Edit2, X, CheckCircle2, TrendingUp, Loader2, Image as ImageIcon, Trash2, Percent, Calendar } from "lucide-react";

type Product = Database["public"]["Tables"]["products"]["Row"];
type GroupBuyOffer = Database["public"]["Tables"]["group_buy_offers"]["Row"] & {
  products: {
    name_ar: string;
    price_to_farmer: number;
  } | null;
};

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

  // Group Buy States
  const [groupBuys, setGroupBuys] = useState<GroupBuyOffer[]>([]);
  const [gbLoading, setGbLoading] = useState(true);
  const [isGbModalOpen, setIsGbModalOpen] = useState(false);
  const [editingGbId, setEditingGbId] = useState<string | null>(null);
  const [savingGb, setSavingGb] = useState(false);

  const [gbFormData, setGbFormData] = useState({
    product_id: "",
    tier1_qty: 0,
    tier1_discount: 0,
    tier2_qty: "" as number | "" | null,
    tier2_discount: "" as number | "" | null,
    tier3_qty: "" as number | "" | null,
    tier3_discount: "" as number | "" | null,
    active_status: true,
    end_date: "",
  });

  const supabase = createClient();

  useEffect(() => {
    fetchProducts();
    fetchGroupBuys();
  }, []);

  async function fetchGroupBuys() {
    setGbLoading(true);
    const { data, error } = await supabase
      .from("group_buy_offers")
      .select("*, products(name_ar, price_to_farmer)")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setGroupBuys(data as any);
    }
    setGbLoading(false);
  }


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

  function openNewGroupBuy() {
    setEditingGbId(null);
    setGbFormData({
      product_id: products[0]?.id || "",
      tier1_qty: 0,
      tier1_discount: 0,
      tier2_qty: "",
      tier2_discount: "",
      tier3_qty: "",
      tier3_discount: "",
      active_status: true,
      end_date: "",
    });
    setIsGbModalOpen(true);
  }

  function openEditGroupBuy(gb: GroupBuyOffer) {
    setEditingGbId(gb.id);
    setGbFormData({
      product_id: gb.product_id,
      tier1_qty: gb.tier1_qty,
      tier1_discount: gb.tier1_discount,
      tier2_qty: gb.tier2_qty !== null ? gb.tier2_qty : "",
      tier2_discount: gb.tier2_discount !== null ? gb.tier2_discount : "",
      tier3_qty: gb.tier3_qty !== null ? gb.tier3_qty : "",
      tier3_discount: gb.tier3_discount !== null ? gb.tier3_discount : "",
      active_status: gb.active_status,
      end_date: gb.end_date ? gb.end_date.split("T")[0] : "",
    });
    setIsGbModalOpen(true);
  }

  async function handleGbSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSavingGb(true);

    const t1_qty = Number(gbFormData.tier1_qty);
    const t1_disc = Number(gbFormData.tier1_discount);
    const t2_qty = gbFormData.tier2_qty !== "" && gbFormData.tier2_qty !== null ? Number(gbFormData.tier2_qty) : null;
    const t2_disc = gbFormData.tier2_discount !== "" && gbFormData.tier2_discount !== null ? Number(gbFormData.tier2_discount) : null;
    const t3_qty = gbFormData.tier3_qty !== "" && gbFormData.tier3_qty !== null ? Number(gbFormData.tier3_qty) : null;
    const t3_disc = gbFormData.tier3_discount !== "" && gbFormData.tier3_discount !== null ? Number(gbFormData.tier3_discount) : null;

    // Validation
    if (t2_qty !== null) {
      if (t2_qty <= t1_qty) {
        alert("الكمية المطلوبة للخصم الثاني يجب أن تكون أكبر من الكمية للخصم الأول");
        setSavingGb(false);
        return;
      }
      if (t2_disc === null) {
        alert("الرجاء تحديد قيمة الخصم الثاني");
        setSavingGb(false);
        return;
      }
    }

    if (t3_qty !== null) {
      if (t2_qty === null) {
        alert("الرجاء تحديد الخصم الثاني أولاً قبل تحديد الخصم الثالث");
        setSavingGb(false);
        return;
      }
      if (t3_qty <= t2_qty) {
        alert("الكمية المطلوبة للخصم الثالث يجب أن تكون أكبر من الكمية للخصم الثاني");
        setSavingGb(false);
        return;
      }
      if (t3_disc === null) {
        alert("الرجاء تحديد قيمة الخصم الثالث");
        setSavingGb(false);
        return;
      }
    }

    const payload = {
      product_id: gbFormData.product_id,
      tier1_qty: t1_qty,
      tier1_discount: t1_disc,
      tier2_qty: t2_qty,
      tier2_discount: t2_disc,
      tier3_qty: t3_qty,
      tier3_discount: t3_disc,
      active_status: gbFormData.active_status,
      end_date: gbFormData.end_date ? new Date(gbFormData.end_date).toISOString() : null,
    };

    const res = await saveGroupBuyOffer(payload, editingGbId || undefined);
    setSavingGb(false);

    if (res.error) {
      alert(res.error);
    } else {
      setIsGbModalOpen(false);
      fetchGroupBuys();
    }
  }

  async function handleGbDelete(id: string) {
    if (confirm("هل أنت متأكد من حذف هذا العرض تماماً؟")) {
      const res = await deleteGroupBuyOffer(id);
      if (res.error) {
        alert(res.error);
      } else {
        fetchGroupBuys();
      }
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

      {/* Group Buy Offers Section */}
      <div className="flex justify-between items-center pt-8 border-t border-slate-200">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Percent className="w-6 h-6 text-amber-500" />
          عروض الشراء الجماعي
        </h2>
        <button
          onClick={openNewGroupBuy}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white font-bold rounded-lg hover:bg-amber-600 transition-colors"
        >
          <Plus className="w-5 h-5" />
          إضافة عرض شراء جماعي جديد
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 text-sm">
              <tr>
                <th className="px-6 py-4 font-medium">اسم المنتج</th>
                <th className="px-6 py-4 font-medium">الخصم الأول</th>
                <th className="px-6 py-4 font-medium">الخصم الثاني</th>
                <th className="px-6 py-4 font-medium">الخصم الثالث</th>
                <th className="px-6 py-4 font-medium">تاريخ الانتهاء</th>
                <th className="px-6 py-4 font-medium">الحالة</th>
                <th className="px-6 py-4 font-medium">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {gbLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                    جاري التحميل...
                  </td>
                </tr>
              ) : groupBuys.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                    لا توجد عروض شراء جماعي مسجلة.
                  </td>
                </tr>
              ) : (
                groupBuys.map((gb) => (
                  <tr key={gb.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-800">
                      {gb.products?.name_ar || "منتج غير معروف"}
                    </td>
                    <td className="px-6 py-4 text-slate-700">
                      {gb.tier1_qty} عبوة / <span className="font-bold text-green-600">%{gb.tier1_discount}</span>
                    </td>
                    <td className="px-6 py-4 text-slate-700">
                      {gb.tier2_qty ? (
                        <>{gb.tier2_qty} عبوة / <span className="font-bold text-green-600">%{gb.tier2_discount}</span></>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-700">
                      {gb.tier3_qty ? (
                        <>{gb.tier3_qty} عبوة / <span className="font-bold text-green-600">%{gb.tier3_discount}</span></>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-sm">
                      {gb.end_date ? (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          {new Date(gb.end_date).toLocaleDateString("ar-EG")}
                        </span>
                      ) : (
                        "مفتوح"
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {gb.active_status ? (
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-green-600">
                          <CheckCircle2 className="w-4 h-4" /> نشط
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-red-500">
                          <X className="w-4 h-4" /> معطل
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditGroupBuy(gb)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleGbDelete(gb.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Group Buy Modal */}
      {isGbModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10">
              <h3 className="text-xl font-bold text-slate-800">
                {editingGbId ? "تعديل عرض الشراء الجماعي" : "إضافة عرض شراء جماعي جديد"}
              </h3>
              <button onClick={() => setIsGbModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleGbSubmit} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">اختر المنتج</label>
                  <select
                    required
                    value={gbFormData.product_id}
                    onChange={(e) => setGbFormData({ ...gbFormData, product_id: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-slate-800"
                  >
                    <option value="" disabled>اختر منتجاً...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name_ar}</option>
                    ))}
                  </select>
                </div>

                {/* Tier 1 */}
                <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50">
                  <h4 className="font-bold text-slate-700 mb-3 text-sm flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    الخصم الأول (إجباري)
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">الكمية المطلوبة (عبوة)</label>
                      <input
                        type="number"
                        required
                        min="1"
                        value={gbFormData.tier1_qty || ""}
                        onChange={(e) => setGbFormData({ ...gbFormData, tier1_qty: Number(e.target.value) })}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-slate-800 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">قيمة الخصم (%)</label>
                      <input
                        type="number"
                        required
                        min="0"
                        max="100"
                        value={gbFormData.tier1_discount || ""}
                        onChange={(e) => setGbFormData({ ...gbFormData, tier1_discount: Number(e.target.value) })}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-slate-800 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Tier 2 */}
                <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50">
                  <h4 className="font-bold text-slate-700 mb-3 text-sm flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    الخصم الثاني (اختياري)
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">الكمية المطلوبة (عبوة)</label>
                      <input
                        type="number"
                        min="1"
                        value={gbFormData.tier2_qty || ""}
                        onChange={(e) => setGbFormData({ ...gbFormData, tier2_qty: e.target.value ? Number(e.target.value) : "" })}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-slate-800 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">قيمة الخصم (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={gbFormData.tier2_discount || ""}
                        onChange={(e) => setGbFormData({ ...gbFormData, tier2_discount: e.target.value ? Number(e.target.value) : "" })}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-slate-800 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Tier 3 */}
                <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50">
                  <h4 className="font-bold text-slate-700 mb-3 text-sm flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    الخصم الثالث (اختياري)
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">الكمية المطلوبة (عبوة)</label>
                      <input
                        type="number"
                        min="1"
                        value={gbFormData.tier3_qty || ""}
                        onChange={(e) => setGbFormData({ ...gbFormData, tier3_qty: e.target.value ? Number(e.target.value) : "" })}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-slate-800 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">قيمة الخصم (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={gbFormData.tier3_discount || ""}
                        onChange={(e) => setGbFormData({ ...gbFormData, tier3_discount: e.target.value ? Number(e.target.value) : "" })}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-slate-800 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Status and Expiration */}
                <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50 space-y-4">
                  <h4 className="font-bold text-slate-700 text-sm flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    إعدادات إضافية
                  </h4>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">تاريخ انتهاء العرض (اختياري)</label>
                    <input
                      type="date"
                      value={gbFormData.end_date}
                      onChange={(e) => setGbFormData({ ...gbFormData, end_date: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none bg-white text-slate-800 text-sm"
                    />
                  </div>
                  <div className="flex items-center pt-2">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={gbFormData.active_status}
                        onChange={(e) => setGbFormData({ ...gbFormData, active_status: e.target.checked })}
                        className="w-5 h-5 text-amber-500 rounded focus:ring-amber-500"
                      />
                      <span className="font-medium text-slate-700 text-sm">تفعيل العرض ونشره</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsGbModalOpen(false)}
                  disabled={savingGb}
                  className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingGb}
                  className="px-5 py-2.5 bg-amber-500 text-white font-bold rounded-lg hover:bg-amber-600 transition-colors shadow-sm flex items-center gap-2 disabled:bg-amber-700"
                >
                  {savingGb ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      جاري الحفظ...
                    </>
                  ) : (
                    "حفظ بيانات العرض"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
