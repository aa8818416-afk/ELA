"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Camera,
  Loader2,
  Send,
  Bot,
  User,
  FolderOpen,
  X,
  RotateCcw,
  Mic,
  Square,
  Volume2,
  VolumeX,
  Globe,
  ExternalLink,
  AlertTriangle,
  MapPin,
  Sparkles,
  CheckCircle2,
  ShoppingCart,
  Phone,
  MessageCircle,
  Radio,
  Layers
} from "lucide-react";
import {
  useAudioRecorder,
  speakArabic,
  isTtsSupported,
  stopSpeaking,
} from "@/utils/speech";
import ProductRecommendationCard from "@/components/chat/ProductRecommendationCard";
import type { RecommendedProduct } from "@/components/chat/QuickOrderModal";
import { ZoomableImage } from "@/components/ui/ImageModal";

type ChatMessage = {
  id: string;
  role: "user" | "model";
  content: string;
  chatImagePreview?: string;
  recommendedProduct?: RecommendedProduct;
  sources?: Array<{ title: string; url: string }>;
};

type FarmerOption = {
  id: string;
  name: string;
  phone: string;
};

type OutbreakItem = {
  id: string;
  riskType: string;
  severity: "critical" | "moderate" | "preventive";
  status: string;
  createdAt: string;
  fieldName: string;
  cropType: string;
  farmerName: string;
};

export default function CropScanner({
  farmers = [],
  outbreaks = [],
  distributorId,
}: {
  farmers?: FarmerOption[];
  outbreaks?: OutbreakItem[];
  distributorId?: string;
}) {
  const [selectedFarmerId, setSelectedFarmerId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"scanner" | "outbreaks">("scanner");

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "model",
      content:
        "أهلاً بك يا سفير قريتنا 🌾! يمكنك التقاط صورة للورقة المصابة أو طرح أي استفسار زراعي لتشخيصه بالذكاء الاصطناعي فوراً. كما يمكنك ربط التشخيص بالمزارع لحفظه في ملف أرضه.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [activeSpeechId, setActiveSpeechId] = useState<string | null>(null);

  const [chatAttachedImage, setChatAttachedImage] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const chatImageGalleryInputRef = useRef<HTMLInputElement>(null);
  const chatImageCameraInputRef = useRef<HTMLInputElement>(null);

  const {
    isRecording,
    transcribing,
    error: recorderError,
    hasMic,
    startRecording,
    stopRecording,
  } = useAudioRecorder();

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isChatLoading]);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  const autoResize = useCallback(() => {
    const el = chatInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, []);

  useEffect(() => {
    autoResize();
  }, [chatInput, autoResize]);

  // Handle Image Upload & Compression
  const handleImageFile = (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        const maxDimension = 1024;

        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        const compressed = canvas.toDataURL("image/jpeg", 0.85);
        setChatAttachedImage(compressed);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Send Message / Scan
  const handleSendMessage = async (customMessage?: string) => {
    const text = (customMessage !== undefined ? customMessage : chatInput).trim();
    const imageToSend = chatAttachedImage;

    if (!text && !imageToSend) return;

    const userMessageId = "msg-" + Date.now();
    const newUserMessage: ChatMessage = {
      id: userMessageId,
      role: "user",
      content: text || "قام السفير بإرفاق صورة لفحصها بالذكاء الاصطناعي",
      chatImagePreview: imageToSend || undefined,
    };

    setChatMessages((prev) => [...prev, newUserMessage]);
    setChatInput("");
    setChatAttachedImage(null);
    setIsChatLoading(true);
    setChatError(null);

    const historyForApi = chatMessages
      .filter((m) => m.id !== "welcome")
      .map((m) => ({
        role: m.role,
        content: m.content,
        imageBase64: m.chatImagePreview,
      }));

    try {
      const response = await fetch("/api/crop-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: historyForApi,
          imageBase64: imageToSend || undefined,
          targetFarmerId: selectedFarmerId || undefined,
          userRole: "distributor",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "فشل الاتصال بالذكاء الاصطناعي الزراعي");
      }

      const newBotMessage: ChatMessage = {
        id: "bot-" + Date.now(),
        role: "model",
        content: data.reply || "تم إتمام الفحص والتشخيص بنجاح.",
        recommendedProduct: data.recommendedProduct,
        sources: data.sources,
      };

      setChatMessages((prev) => [...prev, newBotMessage]);
    } catch (err: any) {
      setChatError(err.message || "حدث خطأ أثناء الفحص.");
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleTtsToggle = (msgId: string, text: string) => {
    if (activeSpeechId === msgId) {
      stopSpeaking();
      setActiveSpeechId(null);
    } else {
      speakArabic(text, () => setActiveSpeechId(null));
      setActiveSpeechId(msgId);
    }
  };

  const handleMicClick = async () => {
    if (isRecording) {
      await stopRecording((transcript) => {
        setChatInput((prev) => (prev ? prev + " " + transcript : transcript));
      });
    } else {
      await startRecording();
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-6xl mx-auto" dir="rtl">
      {/* 1. Header & Tabs */}
      <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-2xl w-full sm:w-fit">
          <button
            onClick={() => setActiveTab("scanner")}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
              activeTab === "scanner"
                ? "bg-white text-emerald-900 shadow-xs font-black"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Sparkles className="w-4 h-4 text-emerald-700" />
            <span>طبيب المحاصيل</span>
          </button>

          <button
            onClick={() => setActiveTab("outbreaks")}
            className={`flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
              activeTab === "outbreaks"
                ? "bg-white text-emerald-900 shadow-xs font-black"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>بؤر الآفات</span>
            {outbreaks.length > 0 && (
              <span className="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded-full font-bold">
                {outbreaks.length}
              </span>
            )}
          </button>
        </div>

        {/* Farmer Link Indicator */}
        {selectedFarmerId ? (
          <span className="text-xs bg-emerald-50 text-emerald-800 font-bold px-3 py-2 rounded-xl border border-emerald-200 flex items-center gap-1">
            <User className="w-3.5 h-3.5 text-emerald-600" />
            مرتبط بـ: {farmers.find((f) => f.id === selectedFarmerId)?.name}
          </span>
        ) : (
          <span className="text-xs text-slate-500 font-medium">فحص عام / استشارة فورية</span>
        )}
      </div>

      {/* 2. TAB 1: FAST SCANNER & DIAGNOSTICS */}
      {activeTab === "scanner" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Left Column: Fast Action Upload Card + Farmer Selector */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200/90 shadow-xs space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center justify-center font-bold">
                  🌿
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">فحص عينة ورقة مصابة</h3>
                  <p className="text-[11px] text-slate-500">التقاط أو سحب صورة للتشخيص</p>
                </div>
              </div>

              {/* Farmer Link Selector */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>ربط الفحص بمزارع:</span>
                  {selectedFarmerId && (
                    <button
                      onClick={() => setSelectedFarmerId("")}
                      className="text-[10px] text-red-600 hover:underline"
                    >
                      إلغاء الربط
                    </button>
                  )}
                </label>
                <select
                  value={selectedFarmerId}
                  onChange={(e) => setSelectedFarmerId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-slate-900 font-medium focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- فحص عام (بدون ربط) --</option>
                  {farmers.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} {f.phone ? `(${f.phone})` : ""}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400">
                  عند ربط الفحص، سيتم حفظ التوصية في سجل أرض الفلاح تلقائياً
                </p>
              </div>

              {/* Upload Dropzone */}
              <div className="border-2 border-dashed border-slate-200 hover:border-emerald-500 rounded-2xl p-4 sm:p-6 text-center bg-slate-50/70 transition-all space-y-3">
                {chatAttachedImage ? (
                  <div className="space-y-2">
                    <img
                      src={chatAttachedImage}
                      alt="عينة الفحص"
                      className="w-full h-40 object-cover rounded-xl border border-slate-300"
                    />
                    <button
                      onClick={() => setChatAttachedImage(null)}
                      className="text-xs text-red-600 hover:underline font-bold"
                    >
                      إزالة الصورة
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-300 text-emerald-800 flex items-center justify-center mx-auto shadow-2xs">
                      <Camera className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900">التقط صورة للورقة المصابة</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">يدعم الكاميرا المباشرة أو من المعرض</p>
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => chatImageCameraInputRef.current?.click()}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 px-2.5 rounded-xl border border-emerald-700 shadow-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                  >
                    <Camera className="w-4 h-4" />
                    <span>الكاميرا</span>
                  </button>
                  <button
                    onClick={() => chatImageGalleryInputRef.current?.click()}
                    className="bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs py-3 px-2.5 rounded-xl border border-slate-300 shadow-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                  >
                    <FolderOpen className="w-4 h-4 text-slate-500" />
                    <span>المعرض</span>
                  </button>
                </div>

                <input
                  ref={chatImageCameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleImageFile(e.target.files[0]);
                  }}
                />
                <input
                  ref={chatImageGalleryInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleImageFile(e.target.files[0]);
                  }}
                />
              </div>

              {chatAttachedImage && (
                <button
                  onClick={() => handleSendMessage("يرجى تشخيص المرض الظاهر في هذه الصورة وتحديد خطة العلاج المناسبة")}
                  disabled={isChatLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white font-bold text-xs py-3.5 rounded-xl border border-emerald-700 shadow-xs flex items-center justify-center gap-1.5 active:scale-95"
                >
                  {isChatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "بدء التحليل الفوري 🚀"}
                </button>
              )}
            </div>
          </div>

          {/* Right Column: Interactive Diagnostic Chat & Diagnosis Station */}
          <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200/90 shadow-xs flex flex-col h-[520px] sm:h-[600px] overflow-hidden">
            {/* Chat Messages */}
            <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2.5 sm:gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                      msg.role === "user"
                        ? "bg-slate-900 text-white"
                        : "bg-emerald-100 text-emerald-900 border border-emerald-300"
                    }`}
                  >
                    {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>

                  <div className="max-w-[85%] space-y-2">
                    <div
                      className={`p-3.5 sm:p-4 rounded-2xl text-xs leading-relaxed ${
                        msg.role === "user"
                          ? "bg-slate-900 text-white rounded-tr-none"
                          : "bg-slate-50 border border-slate-200 text-slate-900 rounded-tl-none"
                      }`}
                    >
                      {msg.chatImagePreview && (
                        <div className="mb-2">
                          <img
                            src={msg.chatImagePreview}
                            alt="عينة"
                            className="max-h-48 rounded-xl border border-slate-200 object-cover"
                          />
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">{msg.content}</p>

                      {msg.role === "model" && isTtsSupported() && (
                        <button
                          onClick={() => handleTtsToggle(msg.id, msg.content)}
                          className="mt-2 text-[10px] text-slate-500 hover:text-emerald-700 flex items-center gap-1 font-bold"
                        >
                          {activeSpeechId === msg.id ? (
                            <>
                              <VolumeX className="w-3 h-3 text-red-500" /> إيقاف القراءة
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-3 h-3 text-emerald-600" /> استماع صوتي
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Recommended Product Quick Action */}
                    {msg.recommendedProduct && (
                      <ProductRecommendationCard product={msg.recommendedProduct} />
                    )}
                  </div>
                </div>
              ))}

              {isChatLoading && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-800 w-fit">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                  <span>طبيب المحاصيل يقوم بفحص الصورة وتحليل الأعراض...</span>
                </div>
              )}

              {chatError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
                  ⚠️ {chatError}
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-2.5 sm:p-3 bg-slate-50/80 border-t border-slate-200 flex items-end gap-2">
              <textarea
                ref={chatInputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="اسأل المرشد الزراعي أو صف الأعراض..."
                rows={1}
                className="flex-1 bg-white border border-slate-300 rounded-xl px-3.5 py-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              />

              <button
                type="button"
                onClick={handleMicClick}
                disabled={transcribing}
                className={`p-3 rounded-xl border transition-all flex items-center justify-center active:scale-90 ${
                  isRecording
                    ? "bg-red-600 text-white border-red-700 animate-pulse"
                    : transcribing
                    ? "bg-amber-100 text-amber-800 border-amber-300"
                    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                }`}
                title="تسجيل صوتي"
              >
                {transcribing ? (
                  <Loader2 className="w-4 h-4 animate-spin text-amber-700" />
                ) : isRecording ? (
                  <Square className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={isChatLoading || (!chatInput.trim() && !chatAttachedImage)}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white p-3 rounded-xl border border-emerald-700 shadow-xs transition-all active:scale-90 flex items-center justify-center"
              >
                <Send className="w-4 h-4 rotate-180" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. TAB 2: VILLAGE PEST OUTBREAK HEATMAP & ADVISORIES */}
      {activeTab === "outbreaks" && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200/90 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">سجل بؤر الآفات الزراعية المرصودة بالقرية</h3>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">تتبع انتشار العدوى بين المزارعين لمنع تحولها لوباء</p>
              </div>
              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200 w-fit">
                محدث لحظياً
              </span>
            </div>

            {outbreaks.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="text-4xl mb-2">🌿</div>
                <h4 className="font-bold text-slate-900 text-sm">القرية نظيفة وخالية من بؤر الآفات</h4>
                <p className="text-xs text-slate-500 mt-1">لم يتم تسجيل إصابات حرجة في حقول المزارعين هذا الأسبوع</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {outbreaks.map((outbreak) => (
                  <div
                    key={outbreak.id}
                    className="p-4 sm:p-5 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-3 hover:border-emerald-300 transition-all shadow-2xs"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-300 text-amber-800 flex items-center justify-center font-bold">
                          ⚠️
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm">{outbreak.riskType}</h4>
                          <p className="text-[11px] text-slate-500">🌾 {outbreak.cropType} • {outbreak.fieldName}</p>
                        </div>
                      </div>

                      <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full border border-rose-200">
                        {outbreak.severity === "critical" ? "إصابة حرجة" : "متوسطة"}
                      </span>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs text-slate-700 flex items-center justify-between">
                      <span>المزارع: <strong className="text-slate-900">{outbreak.farmerName}</strong></span>
                      <span className="text-slate-400 text-[10px]">{new Date(outbreak.createdAt).toLocaleDateString("ar-EG")}</span>
                    </div>

                    <div className="pt-1">
                      <button
                        onClick={() => {
                          setActiveTab("scanner");
                          setChatInput(`أريد خطة علاجية عاجلة لبؤرة مرض ${outbreak.riskType} في محصول ${outbreak.cropType}`);
                        }}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 rounded-xl border border-emerald-700 shadow-2xs text-center transition-all active:scale-95"
                      >
                        استشارة الدواء الموصى به
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
