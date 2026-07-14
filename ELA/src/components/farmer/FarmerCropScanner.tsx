"use client";

import { useState, useRef, useEffect } from "react";
import {
  X,
  Send,
  Bot,
  User,
  Loader2,
  Camera,
  FolderOpen,
  RotateCcw,
  Mic,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  useAudioRecorder,
  speakArabic,
  isTtsSupported,
  stopSpeaking,
} from "@/utils/speech";

type ChatMessage = {
  id: string;
  role: "user" | "model";
  content: string;
  /** Image specifically attached to this message turn (base64 preview) */
  chatImagePreview?: string;
};

type FailedPayload = {
  message: string;
  history: { role: "user" | "model"; content: string; imageBase64?: string }[];
  imageBase64?: string;
};

export default function FarmerCropScanner() {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "model",
      content:
        "أهلاً بك يا فلاحنا العزيز 🌾! يمكنك سؤالي عن أي شيء بخصوص المحاصيل والأمراض والري والتسميد، أو إرفاق صورة للمحصول المشتبه به وأنا هشوفه وأشخصه لك حالاً.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatAttachedImage, setChatAttachedImage] = useState<string | null>(null);
  const [activeSpeechId, setActiveSpeechId] = useState<string | null>(null);
  
  // Stores the last failed request so we can retry it
  const [failedPayload, setFailedPayload] = useState<FailedPayload | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const {
    isRecording,
    transcribing,
    error: recorderError,
    hasMic,
    startRecording,
    stopRecording,
  } = useAudioRecorder();

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isChatLoading]);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  // Image compression helper
  function compressImage(dataUrl: string, maxWidth = 768, quality = 0.65): Promise<string> {
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

  // Handle image selection (camera or gallery)
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setChatAttachedImage(ev.target?.result as string);
    reader.readAsDataURL(file);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  };

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
        const newMsgId = `m-${Date.now()}`;
        setChatMessages((prev) => [
          ...prev,
          { id: newMsgId, role: "model", content: data.text },
        ]);

        // Auto-play the AI response if TTS is supported
        if (isTtsSupported()) {
          handleSpeak(data.text, newMsgId);
        }
      }
    } catch {
      setChatError("تعذر الاتصال، تأكد من الإنترنت");
      setFailedPayload(payload);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleChatSend = async () => {
    const text = chatInput.trim();
    if ((!text && !chatAttachedImage) || isChatLoading) return;

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
      content: text || "📷",
      chatImagePreview,
    };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);

    const historyForApi = updatedMessages
      .filter((m) => m.id !== "welcome")
      .slice(0, -1)
      .map((m) => ({
        role: m.role,
        content: m.content,
        imageBase64: m.chatImagePreview,
      }));

    await callChatApi({
      message: text || "انظر إلى الصورة المرفقة وأخبرني بما تراه من إصابات أو أمراض",
      history: historyForApi,
      imageBase64: compressedImageToSend,
    });
  };

  const handleRetry = () => {
    if (!failedPayload) return;
    callChatApi(failedPayload);
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

  const handleSpeak = (text: string, msgId: string) => {
    if (activeSpeechId === msgId) {
      stopSpeaking();
      setActiveSpeechId(null);
    } else {
      setActiveSpeechId(msgId);
      speakArabic(
        text,
        () => setActiveSpeechId(msgId),
        () => setActiveSpeechId(null)
      );
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-3xl overflow-hidden shadow-xl flex flex-col" style={{ minHeight: "70vh" }}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-slate-800 bg-slate-900/80 shrink-0">
        <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <Bot className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <p className="text-white font-bold">المرشد الزراعي الذكي</p>
          <p className="text-slate-500 text-xs flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            يمكنك سؤاله والتحدث معه وإرفاق صور المحاصيل
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
        {chatMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
          >
            {/* Avatar */}
            <div
              className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${
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
            <div className={`max-w-[82%] flex flex-col gap-1.5 ${msg.role === "user" ? "items-end" : "items-start"}`}>
              {/* Attached image */}
              {msg.chatImagePreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={msg.chatImagePreview}
                  alt="صورة مرفقة"
                  className="w-52 h-40 object-cover rounded-2xl border border-slate-700 shadow-md"
                />
              )}
              {/* Text content — hide if it's just the placeholder emoji */}
              {msg.content && msg.content !== "📷" && (
                <div
                  className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed relative ${
                    msg.role === "model"
                      ? "bg-slate-800 text-slate-200 rounded-tl-sm"
                      : "bg-emerald-600 text-white rounded-tr-sm"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {/* TTS Speaker icon for model replies */}
                  {msg.role === "model" && isTtsSupported() && (
                    <button
                      onClick={() => handleSpeak(msg.content, msg.id)}
                      className={`absolute -bottom-3 -left-3 p-1.5 rounded-full border shadow-md transition-colors ${activeSpeechId === msg.id
                        ? "bg-emerald-500 text-white border-emerald-400"
                        : "bg-slate-800 text-slate-400 hover:text-white border-slate-700 hover:bg-slate-700"
                        }`}
                      title={activeSpeechId === msg.id ? "إيقاف الصوت" : "قراءة الرسالة بصوت عالي"}
                    >
                      {activeSpeechId === msg.id ? (
                        <VolumeX className="w-4 h-4" />
                      ) : (
                        <Volume2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isChatLoading && (
          <div className="flex gap-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
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

        {/* Audio transcribing indicator */}
        {transcribing && (
          <div className="flex gap-2.5 mr-auto flex-row-reverse">
            <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-slate-700">
              <User className="w-4 h-4 text-slate-300" />
            </div>
            <div className="bg-slate-800 px-4 py-3 rounded-2xl rounded-tr-sm">
              <div className="flex gap-2 items-center text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                <span>جاري ترجمة صوتك لنص...</span>
              </div>
            </div>
          </div>
        )}

        {/* Errors display */}
        {(chatError || recorderError) && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-red-400 text-xs text-center bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">
              {chatError || recorderError}
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

      {/* Image preview before send */}
      {chatAttachedImage && (
        <div className="px-4 py-2 flex items-center gap-3 bg-slate-950/60 border-t border-slate-800 shrink-0">
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={chatAttachedImage}
              alt="معاينة الصورة"
              className="w-16 h-12 object-cover rounded-xl border border-emerald-500/40"
            />
            <button
              onClick={() => setChatAttachedImage(null)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white shadow-sm"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <span className="text-slate-400 text-xs">صورة جاهزة للإرسال — يمكنك إضافة سؤال أو الإرسال مباشرة</span>
        </div>
      )}

      {/* Input bar */}
      <div className="border-t border-slate-800 p-3.5 flex gap-2 items-center bg-slate-900/60 shrink-0">
        {/* Camera: instant capture */}
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={isChatLoading || transcribing}
          className="flex-shrink-0 p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/40 disabled:opacity-40 transition-colors"
          title="تصوير فوري بالكاميرا"
        >
          <Camera className="w-5 h-5" />
        </button>
        <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} onChange={handleImageSelect} className="hidden" />

        {/* Gallery: pick from device */}
        <button
          type="button"
          onClick={() => galleryInputRef.current?.click()}
          disabled={isChatLoading || transcribing}
          className="flex-shrink-0 p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/40 disabled:opacity-40 transition-colors"
          title="اختر صورة من الجهاز"
        >
          <FolderOpen className="w-5 h-5" />
        </button>
        <input type="file" accept="image/*" ref={galleryInputRef} onChange={handleImageSelect} className="hidden" />

        {/* Microphone button (Speech-to-Text via Groq Whisper) */}
        {hasMic && (
          <button
            type="button"
            onClick={handleMicClick}
            disabled={isChatLoading || transcribing}
            className={`flex-shrink-0 p-2.5 rounded-xl border transition-all duration-300 ${isRecording
                ? "bg-red-500 text-white border-red-400 animate-pulse scale-105"
                : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
              }`}
            title={isRecording ? "إيقاف التسجيل" : "تحدث بالصوت"}
          >
            {isRecording ? (
              <Square className="w-5 h-5 fill-current" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </button>
        )}

        {/* Text input */}
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
          placeholder={
            isRecording
              ? "جاري تسجيل صوتك... انقر للتوقف والكتابة"
              : transcribing
              ? "جاري ترجمة صوتك لنص..."
              : chatAttachedImage
              ? "اكتب سؤالك عن الصورة (اختياري)..."
              : "اسأل المرشد أو أرفق صورة..."
          }
          disabled={isChatLoading || transcribing}
          className="flex-1 bg-slate-800 text-white text-sm rounded-xl px-3 py-2.5 border border-slate-700 focus:border-emerald-500 outline-none placeholder:text-slate-500 disabled:opacity-50"
        />

        {/* Send */}
        <button
          onClick={handleChatSend}
          disabled={isChatLoading || transcribing || (!chatInput.trim() && !chatAttachedImage)}
          className="flex-shrink-0 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white p-2.5 rounded-xl transition-colors"
          aria-label="إرسال"
        >
          {isChatLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  );
}
