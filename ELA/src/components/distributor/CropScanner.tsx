"use client";

import { useState, useRef, useEffect } from "react";
import { diagnoseCrop } from "@/app/actions/distributor";
import {
  Camera,
  Loader2,
  Leaf,
  AlertCircle,
  ShoppingCart,
  Send,
  Bot,
  User,
  FolderOpen,
  X,
  RotateCcw,
} from "lucide-react";

interface DiagnosisResult {
  diagnosis?: {
    disease_name_ar?: string;
    description_ar?: string;
    confidence_percentage?: number;
  };
  recommendedProduct?: { name_ar?: string; price_to_farmer?: number; image_url?: string | null };
}

type ChatMessage = {
  id: string;
  role: "user" | "model";
  content: string;
  /** Image specifically attached to this message turn (already compressed base64) */
  chatImagePreview?: string;
};

type FailedPayload = {
  message: string;
  history: { role: "user" | "model"; content: string; imageBase64?: string }[];
  imageBase64?: string;
};

export default function CropScanner() {
  const [image, setImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Follow-up chat state - persistent from the start
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "model",
      content: "أهلاً بك يا سفير قريتنا 🌾! يمكنك استخدام هذه الدردشة مباشرة لمناقشة أي استفسار زراعي، أو رفع صورة للمحصول المصاب لفحصه والحصول على التشخيص الفوري.",
    }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  
  // Image attached inside chat
  const [chatAttachedImage, setChatAttachedImage] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatImageGalleryInputRef = useRef<HTMLInputElement>(null);
  const chatImageCameraInputRef = useRef<HTMLInputElement>(null);

  // Stores the last failed request so we can retry it
  const [failedPayload, setFailedPayload] = useState<FailedPayload | null>(null);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isChatLoading]);

  // When result arrives, seed chat with a context message
  useEffect(() => {
    if (!result?.diagnosis) return;
    const productInfo = result.recommendedProduct
      ? ` والدواء المقترح هو "${result.recommendedProduct.name_ar}" بسعر ${result.recommendedProduct.price_to_farmer} جنيهاً`
      : " ولا يوجد دواء مطابق متوفر حالياً";
    
    setChatMessages((prev) => [
      ...prev,
      {
        id: `diag-${Date.now()}`,
        role: "model",
        content: `تم تشخيص المحصول بـ **${result.diagnosis?.disease_name_ar ?? ""}** بنسبة ثقة ${result.diagnosis?.confidence_percentage ?? 0}%${productInfo}. هل تريد مناقشة هذا المرض أو الاستفسار عن تفاصيل العلاج؟`,
      },
    ]);
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setChatAttachedImage(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      setImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!image) return;
    setIsLoading(true);
    setError(null);
    const response = await diagnoseCrop(image);
    if (response.error) {
      setError(response.error as string);
    } else {
      setResult(response as DiagnosisResult);
    }
    setIsLoading(false);
  };

  const handleReset = () => {
    setImage(null);
    setResult(null);
    setError(null);
    setChatAttachedImage(null);
    setFailedPayload(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Compress image helper
  function compressImage(
    dataUrl: string,
    maxWidth = 768,
    quality = 0.65
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        const ratio = Math.min(maxWidth / img.width, maxWidth / img.height, 1);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject("Canvas not supported"); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject("Failed to load image");
      img.src = dataUrl;
    });
  }

  // Handlers for attaching an image inside the chat
  const handleChatImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setChatAttachedImage(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
    if (chatImageGalleryInputRef.current) chatImageGalleryInputRef.current.value = "";
    if (chatImageCameraInputRef.current) chatImageCameraInputRef.current.value = "";
  };

  const removeChatAttachedImage = () => setChatAttachedImage(null);

  // Core API call shared for retry
  const callChatApi = async (payload: FailedPayload) => {
    setIsChatLoading(true);
    setChatError(null);
    setFailedPayload(null);

    try {
      const res = await fetch("/api/crop-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setChatError(data.error || "حدث خطأ، حاول مرة أخرى");
        setFailedPayload(payload);
      } else {
        setChatMessages((prev) => [
          ...prev,
          { id: `m-${Date.now()}`, role: "model", content: data.text },
        ]);
      }
    } catch {
      setChatError("تعذر الاتصال، تأكد من الإنترنت");
      setFailedPayload(payload);
    } finally {
      setIsChatLoading(false);
    }
  };

  // ── Follow-up chat send ─────────────────────────────────────────────────
  const handleChatSend = async (textOverride?: string) => {
    const text = (textOverride ?? chatInput).trim();
    if (!text || isChatLoading) return;

    let compressedImageToSend: string | undefined = undefined;
    if (chatAttachedImage) {
      try {
        compressedImageToSend = await compressImage(chatAttachedImage);
      } catch {
        compressedImageToSend = chatAttachedImage;
      }
    }

    const chatImagePreview = chatAttachedImage || undefined;

    setChatInput("");
    setChatAttachedImage(null);

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      chatImagePreview,
    };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);

    const historyForApi = updatedMessages
      .filter((m) => m.id !== "welcome" && !m.id.startsWith("diag-"))
      .slice(0, -1) // exclude last user msg (sent as `message`)
      .map((m) => ({
        role: m.role,
        content: m.content,
        imageBase64: m.chatImagePreview,
      }));

    const payload: FailedPayload = {
      message: text,
      history: historyForApi,
      imageBase64: compressedImageToSend,
    };

    await callChatApi(payload);
  };

  const handleRetry = () => {
    if (!failedPayload) return;
    callChatApi(failedPayload);
  };

  return (
    <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 lg:p-8 max-w-3xl mx-auto space-y-6">

      {/* ── Diagnostic Camera / Uploader ── */}
      <div className="bg-slate-950/40 border border-slate-850 rounded-2xl p-5">
        <h4 className="text-white font-bold mb-3 flex items-center gap-2">
          🔬 فحص وتشخيص المحاصيل للموزعين
        </h4>
        
        {!image ? (
          <div
            className="border-2 border-dashed border-slate-700 hover:border-emerald-500/50 rounded-2xl p-8 text-center cursor-pointer transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
              <Camera className="w-8 h-8 text-emerald-400" />
            </div>
            <h4 className="text-white font-bold text-base mb-1">التقط أو ارفع صورة للمحصول</h4>
            <p className="text-slate-400 text-xs">
              قم بتصوير ورقة النبات المصابة ودع الذكاء الاصطناعي يقوم بالتشخيص
            </p>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              ref={fileInputRef}
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative w-full h-64 rounded-2xl overflow-hidden border border-slate-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image}
                alt="Crop preview"
                className="w-full h-full object-cover"
              />
              <button
                onClick={handleReset}
                className="absolute top-4 right-4 bg-slate-900/80 text-white p-2 rounded-full hover:bg-red-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!result && (
              <button
                onClick={handleAnalyze}
                disabled={isLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-bold rounded-xl py-4 flex items-center justify-center gap-3 transition-all shadow-lg shadow-emerald-500/20"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span>جاري تحليل الصورة بالذكاء الاصطناعي...</span>
                  </>
                ) : (
                  <>
                    <ScanLine className="w-6 h-6" />
                    <span>بدء التشخيص</span>
                  </>
                )}
              </button>
            )}

            {error && (
              <p className="text-red-400 text-center text-sm">{error}</p>
            )}
          </div>
        )}
      </div>

      {/* ── Diagnosis Results Section ── */}
      {result && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-2xl font-bold text-emerald-400 mb-2">
                {result.diagnosis?.disease_name_ar}
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed max-w-2xl">
                {result.diagnosis?.description_ar}
              </p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full text-emerald-400 text-xs font-bold whitespace-nowrap">
              دقة: {result.diagnosis?.confidence_percentage}%
            </div>
          </div>

          {/* Recommended product */}
          <div className="border-t border-slate-800 pt-4">
            <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
              <Leaf className="w-5 h-5 text-emerald-400" />
              العلاج المقترح
            </h4>

            {result.recommendedProduct ? (
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 flex-shrink-0 flex items-center justify-center">
                  {result.recommendedProduct.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={result.recommendedProduct.image_url}
                      alt={result.recommendedProduct.name_ar}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl">🧪</span>
                  )}
                </div>
                <div className="flex-1 min-w-0 text-center sm:text-right">
                  <p className="text-white font-bold text-lg">
                    {result.recommendedProduct.name_ar}
                  </p>
                  <p className="text-emerald-400 font-medium">
                    {result.recommendedProduct.price_to_farmer} ج.م
                  </p>
                </div>
                <button className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-6 py-3 rounded-xl flex items-center justify-center gap-2 transition-colors flex-shrink-0">
                  <ShoppingCart className="w-5 h-5" />
                  أضف إلى الطلب الفوري
                </button>
              </div>
            ) : (
              <p className="text-slate-400 text-sm">
                لا يوجد منتج مطابق في قاعدة البيانات حالياً.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Follow-up Chat directly underneath ── */}
      <div className="border border-slate-800 rounded-2xl overflow-hidden shadow-lg bg-slate-950/20">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-900 border-b border-slate-800">
          <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Bot className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-white text-sm font-bold">الدردشة والمساندة الذكية</p>
            <p className="text-slate-550 text-xs">اسأل المرشد واستفسر عن أي مرض بالصور</p>
          </div>
        </div>

        {/* Messages */}
        <div className="max-h-80 overflow-y-auto p-4 space-y-4 bg-slate-950/40 min-h-[160px]">
          {chatMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center ${
                  msg.role === "model"
                    ? "bg-emerald-500/10 border border-emerald-500/20"
                    : "bg-slate-700"
                }`}
              >
                {msg.role === "model" ? (
                  <Bot className="w-4 h-4 text-emerald-400" />
                ) : (
                  <User className="w-4 h-4 text-slate-300" />
                )}
              </div>
              <div className={`max-w-[80%] flex flex-col gap-1.5 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                {msg.chatImagePreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={msg.chatImagePreview}
                    alt="صورة مرفقة"
                    className="w-40 h-28 object-cover rounded-xl border border-slate-700 shadow-sm"
                  />
                )}
                <div
                  className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "model"
                      ? "bg-slate-800 text-slate-200 rounded-tl-sm"
                      : "bg-emerald-600 text-white rounded-tr-sm"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isChatLoading && (
            <div className="flex gap-2.5">
              <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Bot className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-sm">
                <div className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          {chatError && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-red-400 text-xs text-center bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">
                {chatError}
              </p>
              {failedPayload && (
                <button
                  onClick={handleRetry}
                  className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 px-4 py-2 rounded-xl transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  إعادة الإرسال
                </button>
              )}
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Chat-attached image preview */}
        {chatAttachedImage && (
          <div className="px-4 py-2 flex items-center gap-2 bg-slate-900 border-t border-slate-800">
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={chatAttachedImage}
                alt="صورة مرفقة"
                className="w-16 h-12 object-cover rounded-xl border border-emerald-500/40"
              />
              <button
                onClick={removeChatAttachedImage}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <span className="text-slate-400 text-xs">صورة مرفقة جاهزة للإرسال</span>
          </div>
        )}

        {/* Input bar */}
        <div className="border-t border-slate-800 p-3 flex gap-2 items-center bg-slate-900">
          {/* Action Button 1: Camera capture */}
          <button
            type="button"
            onClick={() => chatImageCameraInputRef.current?.click()}
            disabled={isChatLoading}
            className="flex-shrink-0 text-slate-400 hover:text-emerald-400 disabled:opacity-40 transition-colors p-2 bg-slate-850 rounded-xl"
            title="التقاط صورة فورا بالكاميرا"
          >
            <Camera className="w-5 h-5" />
          </button>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={chatImageCameraInputRef}
            onChange={handleChatImageSelect}
            className="hidden"
          />

          {/* Action Button 2: Upload from gallery */}
          <button
            type="button"
            onClick={() => chatImageGalleryInputRef.current?.click()}
            disabled={isChatLoading}
            className="flex-shrink-0 text-slate-400 hover:text-emerald-400 disabled:opacity-40 transition-colors p-2 bg-slate-850 rounded-xl"
            title="إرفاق صورة من الهاتف"
          >
            <FolderOpen className="w-5 h-5" />
          </button>
          <input
            type="file"
            accept="image/*"
            ref={chatImageGalleryInputRef}
            onChange={handleChatImageSelect}
            className="hidden"
          />

          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleChatSend();
              }
            }}
            placeholder="اسأل عن المرض أو طريقة العلاج..."
            disabled={isChatLoading}
            className="flex-1 bg-slate-800 text-white text-sm rounded-xl px-3 py-2.5 border border-slate-700 focus:border-emerald-500 outline-none placeholder:text-slate-655 disabled:opacity-50"
          />
          <button
            onClick={() => handleChatSend()}
            disabled={isChatLoading || (!chatInput.trim() && !chatAttachedImage)}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white p-2.5 rounded-xl transition-colors flex-shrink-0"
            aria-label="إرسال"
          >
            {isChatLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Inline SVG icon to keep imports minimal
function ScanLine(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <line x1="7" x2="17" y1="12" y2="12" />
    </svg>
  );
}
