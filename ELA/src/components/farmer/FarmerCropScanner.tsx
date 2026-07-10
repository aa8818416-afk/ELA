"use client";

import { useState, useRef, useEffect } from "react";
import {
  Camera,
  Loader2,
  Share2,
  Phone,
  Mic,
  Square,
  Volume2,
  X,
  Send,
  Bot,
  User,
} from "lucide-react";
import {
  useSpeechRecognition,
  speakArabic,
  isTtsSupported,
  stopSpeaking,
} from "@/utils/speech";

type DiagnosisResult = {
  disease_name_ar: string;
  disease_name_en: string;
  description_ar: string;
  confidence_percentage: number;
  recommended_product_id: string | null;
  availability_note?: string | null;
};

type ProductResult = {
  id: string;
  name_ar: string;
  price_to_farmer: number;
  image_url?: string | null;
};

type DistributorContact = {
  name: string;
  phone: string | null;
  village: string | null;
};

type ChatMessage = {
  id: string;
  role: "user" | "model";
  content: string;
};

export default function FarmerCropScanner() {
  const [image, setImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [recommendedProduct, setRecommendedProduct] =
    useState<ProductResult | null>(null);
  const [distributorContact, setDistributorContact] =
    useState<DistributorContact | null>(null);

  // Farmer notes (voice or typing) — before diagnosis
  const [farmerNotes, setFarmerNotes] = useState("");
  const [ttsSupported, setTtsSupported] = useState(false);

  // Follow-up chat — after diagnosis
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  const {
    isListening,
    supported: speechSupported,
    error: speechError,
    startListening,
    stopListening,
  } = useSpeechRecognition();

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening((text) => {
        setFarmerNotes((prev) => (prev ? prev + " " + text : text));
      });
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTtsSupported(isTtsSupported());
  }, []);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isChatLoading]);

  // When diagnosis arrives, seed the chat with a welcome message
  useEffect(() => {
    if (!diagnosis) return;
    const productInfo = recommendedProduct
      ? `والدواء المقترح هو "${recommendedProduct.name_ar}" بسعر ${recommendedProduct.price_to_farmer} جنيهاً`
      : diagnosis.availability_note
      ? `ولا يوجد دواء متوفر حالياً`
      : "";
    setChatMessages([
      {
        id: "seed",
        role: "model",
        content: `تم تشخيص محصولك بـ **${diagnosis.disease_name_ar}** (${diagnosis.disease_name_en}) بنسبة ثقة ${diagnosis.confidence_percentage}%${productInfo ? " " + productInfo : ""}. هل عندك أي سؤال أو تريد معرفة المزيد؟ 🌾`,
      },
    ]);
  }, [diagnosis]); // eslint-disable-line react-hooks/exhaustive-deps

  const speakDiagnosis = () => {
    if (!diagnosis) return;
    const parts = [
      `التشخيص: ${diagnosis.disease_name_ar}`,
      diagnosis.description_ar,
    ];
    if (recommendedProduct) {
      parts.push(
        `العلاج المقترح: ${recommendedProduct.name_ar}، بسعر ${recommendedProduct.price_to_farmer} جنيه.`
      );
    } else if (diagnosis.availability_note) {
      parts.push(diagnosis.availability_note);
    }
    speakArabic(parts.join(" "));
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setDiagnosis(null);
    setChatMessages([]);
    const reader = new FileReader();
    reader.onload = (ev) => setImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  function compressImage(
    dataUrl: string,
    maxWidth = 1024,
    quality = 0.7
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
        if (!ctx) {
          reject("Canvas not supported");
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject("Failed to load image");
      img.src = dataUrl;
    });
  }

  const handleAnalyze = async () => {
    if (!image) return;
    setIsLoading(true);
    setError(null);

    let compressedImage: string;
    try {
      compressedImage = await compressImage(image);
    } catch {
      compressedImage = image;
    }

    const controller = new AbortController();
    const timeoutMs = 120_000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch("/api/crop-doctor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: compressedImage,
          farmerNotes: farmerNotes.trim() || undefined,
        }),
        signal: controller.signal,
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || "فشل التشخيص");
      } else {
        setDiagnosis(data.diagnosis);
        setRecommendedProduct(data.recommendedProduct || null);
        setDistributorContact(data.distributorContact || null);
      }
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      setError(
        aborted
          ? "الخادم لا يستجيب، تأكد من اتصال الإنترنت وحاول مرة أخرى"
          : "تعذر الاتصال بالخادم، تأكد من الإنترنت وحاول مرة أخرى"
      );
    } finally {
      clearTimeout(timeout);
      setIsLoading(false);
    }
  };

  // ── Follow-up chat send ─────────────────────────────────────────────────
  const handleChatSend = async (textOverride?: string) => {
    const text = (textOverride ?? chatInput).trim();
    if (!text || isChatLoading) return;

    setChatInput("");
    setChatError(null);

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setIsChatLoading(true);

    try {
      // Build history excluding the seed message (role=model) — send it as context
      const historyForApi = updatedMessages
        .filter((m) => m.id !== "seed")
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/crop-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: historyForApi.slice(0, -1), // exclude last user msg (sent as message)
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setChatError(data.error || "حدث خطأ، حاول مرة أخرى");
      } else {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `m-${Date.now()}`,
            role: "model",
            content: data.text,
          },
        ]);
      }
    } catch {
      setChatError("تعذر الاتصال، تأكد من الإنترنت");
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleWhatsAppContact = () => {
    if (!distributorContact?.phone) return;
    const diseaseName = diagnosis?.disease_name_ar || "مرض النبات";
    const productName = recommendedProduct?.name_ar || "الدواء الموصى به";
    const price = recommendedProduct?.price_to_farmer || "؟";
    const distName = distributorContact.name;

    const message = `أهلاً يا بشمهندس ${distName} (السفير) 🌾\n\nالذكاء الاصطناعي شخّص زرعي بـ *${diseaseName}* ورشحلي دواء *${productName}* بسعر *${price} جنيهاً*\n\nعاوز أحجز معاك شحنة كاش لو سمحت 🙏`;

    const phone = distributorContact.phone.replace(/\D/g, "");
    const intlPhone = phone.startsWith("0") ? `2${phone}` : phone;
    window.open(
      `https://wa.me/${intlPhone}?text=${encodeURIComponent(message)}`,
      "_blank"
    );
  };

  const resetScanner = () => {
    setImage(null);
    setDiagnosis(null);
    setError(null);
    setRecommendedProduct(null);
    setDistributorContact(null);
    setFarmerNotes("");
    setChatMessages([]);
    setChatInput("");
    setChatError(null);
    stopSpeaking();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ─── SCREEN 1: Image capture ──────────────────────────────────────────
  if (!image) {
    return (
      <div
        className="border-2 border-dashed border-slate-700 hover:border-emerald-500/50 rounded-3xl p-10 text-center cursor-pointer transition-colors active:scale-[0.98]"
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-5">
          <Camera className="w-10 h-10 text-emerald-400" />
        </div>
        <h3 className="text-white font-bold text-xl mb-2">صوّر ورقة المحصول</h3>
        <p className="text-slate-400 text-sm leading-relaxed">
          اضغط هنا لالتقاط صورة من الكاميرا أو اختيار صورة من الجهاز
        </p>
        <div className="mt-6 bg-emerald-600 text-white font-bold py-3 px-6 rounded-2xl inline-block">
          افتح الكاميرا
        </div>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          ref={fileInputRef}
          onChange={handleImageSelect}
          className="hidden"
        />
      </div>
    );
  }

  // ─── SCREEN 2 & 3: Image preview + diagnosis + chat ───────────────────
  return (
    <div className="space-y-5">
      {/* Image preview */}
      <div className="relative rounded-3xl overflow-hidden border border-slate-800 aspect-video">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt="صورة المحصول"
          className="w-full h-full object-cover"
        />
        <button
          onClick={resetScanner}
          className="absolute top-3 right-3 bg-slate-950/80 p-2 rounded-full text-slate-400 hover:text-white"
          aria-label="إزالة الصورة"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Farmer notes — only before diagnosis */}
      {!diagnosis && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-slate-300 text-sm font-medium">
              ملاحظات إضافية (اختياري)
            </label>
            {speechSupported && (
              <button
                type="button"
                onClick={toggleListening}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  isListening
                    ? "bg-red-500 text-white animate-pulse"
                    : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                }`}
              >
                {isListening ? (
                  <>
                    <Square className="w-3 h-3" /> إيقاف
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5" /> تحدث
                  </>
                )}
              </button>
            )}
          </div>
          {speechError && (
            <p className="text-red-400 text-xs mb-2 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
              {speechError}
            </p>
          )}
          {isListening && (
            <p className="text-emerald-400 text-xs mb-2 animate-pulse flex items-center gap-1">
              <Mic className="w-3 h-3" /> جاري الاستماع... تحدث الآن
            </p>
          )}
          <textarea
            value={farmerNotes}
            onChange={(e) => setFarmerNotes(e.target.value)}
            placeholder={
              speechSupported
                ? "اكتب أو تحدث بمعلومات عن المحصول (نوع النبات، العمر، الأعراض)..."
                : "اكتب معلومات عن المحصول (نوع النبات، العمر، الأعراض)..."
            }
            rows={2}
            className="w-full bg-slate-950/50 text-white text-sm rounded-xl p-3 border border-slate-800 focus:border-emerald-500 outline-none resize-none placeholder:text-slate-600"
          />
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-2xl p-4">
          {error}
        </div>
      )}

      {/* Analyze button — hidden once diagnosis exists */}
      {!diagnosis && (
        <button
          onClick={handleAnalyze}
          disabled={isLoading}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold rounded-2xl py-4 flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>جاري التشخيص بالذكاء الاصطناعي...</span>
            </>
          ) : (
            "🔬 بدء التشخيص"
          )}
        </button>
      )}

      {/* ── Diagnosis results ─────────────────────────────────────────── */}
      {diagnosis && (
        <>
          {/* Listen button (TTS) */}
          {ttsSupported && (
            <button
              onClick={speakDiagnosis}
              className="w-full bg-blue-500/10 border border-blue-500/30 text-blue-400 font-bold rounded-2xl py-3 flex items-center justify-center gap-2 hover:bg-blue-500/20 transition-colors"
            >
              <Volume2 className="w-5 h-5" />
              استمع للتشخيص
            </button>
          )}

          {/* Disease Result Card */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-slate-400 text-xs mb-1">التشخيص:</p>
                <h3 className="text-white font-bold text-2xl">
                  {diagnosis.disease_name_ar}
                </h3>
                <p className="text-slate-500 text-sm mt-1">
                  {diagnosis.disease_name_en}
                </p>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full whitespace-nowrap">
                <span className="text-emerald-400 font-bold text-sm">
                  {diagnosis.confidence_percentage}%
                </span>
              </div>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed border-t border-slate-800 pt-4">
              {diagnosis.description_ar}
            </p>
          </div>

          {/* ── Recommended Product — with real image ─────────────────── */}
          {recommendedProduct ? (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-3xl p-5">
              <p className="text-amber-500/70 text-xs font-medium mb-3">
                💊 العلاج المقترح
              </p>
              <div className="flex items-center gap-4">
                {/* Real product image */}
                <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 flex-shrink-0 flex items-center justify-center">
                  {recommendedProduct.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={recommendedProduct.image_url}
                      alt={recommendedProduct.name_ar}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-4xl">🧪</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-lg leading-tight">
                    {recommendedProduct.name_ar}
                  </p>
                  <p className="text-amber-400 font-bold text-2xl mt-1">
                    {recommendedProduct.price_to_farmer}{" "}
                    <span className="text-base font-normal text-amber-500/70">
                      ج.م
                    </span>
                  </p>
                </div>
              </div>
            </div>
          ) : (
            diagnosis.availability_note && (
              <div className="bg-orange-500/5 border border-orange-500/20 rounded-3xl p-5 text-center">
                <span className="text-3xl block mb-2">📦</span>
                <p className="text-orange-300 text-sm font-medium">
                  {diagnosis.availability_note}
                </p>
              </div>
            )
          )}

          {/* Distributor Contact CTA */}
          {distributorContact && (
            <div className="bg-[#25D366]/5 border border-[#25D366]/30 rounded-3xl p-5">
              <p className="text-slate-400 text-xs mb-3">
                احجز الدواء من سفير قريتك
              </p>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xl">
                  👨‍🌾
                </div>
                <div>
                  <p className="text-white font-bold">{distributorContact.name}</p>
                  {distributorContact.village && (
                    <p className="text-slate-400 text-xs">
                      📍 {distributorContact.village}
                    </p>
                  )}
                  {distributorContact.phone && (
                    <p className="text-slate-400 text-xs flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {distributorContact.phone}
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={handleWhatsAppContact}
                disabled={!distributorContact.phone}
                className="w-full bg-[#25D366] hover:bg-[#20ba5a] disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-[#25D366]/20"
              >
                <Share2 className="w-5 h-5" />
                احجز الدواء كاش مع {distributorContact.name} عبر واتساب
              </button>
            </div>
          )}

          {/* ── Follow-up Chat ─────────────────────────────────────────── */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-800 bg-slate-900/80">
              <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Bot className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-white text-sm font-bold">استفسر عن التشخيص</p>
                <p className="text-slate-500 text-xs">
                  اسأل أي سؤال عن المرض أو العلاج
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="max-h-72 overflow-y-auto p-4 space-y-3 scroll-smooth">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2.5 ${
                    msg.role === "user" ? "flex-row-reverse" : ""
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs ${
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
                  {/* Bubble */}
                  <div
                    className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === "model"
                        ? "bg-slate-800 text-slate-200 rounded-tl-sm"
                        : "bg-emerald-600 text-white rounded-tr-sm"
                    }`}
                  >
                    {msg.content}
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
                <p className="text-red-400 text-xs text-center bg-red-500/10 border border-red-500/20 rounded-xl p-2">
                  {chatError}
                </p>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input bar */}
            <div className="border-t border-slate-800 p-3 flex gap-2">
              <input
                ref={chatInputRef}
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
                className="flex-1 bg-slate-800 text-white text-sm rounded-xl px-3 py-2.5 border border-slate-700 focus:border-emerald-500 outline-none placeholder:text-slate-600 disabled:opacity-50"
              />
              <button
                onClick={() => handleChatSend()}
                disabled={isChatLoading || !chatInput.trim()}
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

          {/* Scan Again */}
          <button
            onClick={resetScanner}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 rounded-2xl transition-colors"
          >
            فحص محصول آخر
          </button>
        </>
      )}
    </div>
  );
}
