"use client";

import { useState, useRef, useEffect } from "react";
import {
    Send,
    Loader2,
    Mic,
    Square,
    Volume2,
    VolumeX,
    AlertCircle,
    ArrowRight,
    User,
    Bot,
    Camera,
    FolderOpen,
    X,
    RotateCcw,
} from "lucide-react";
import Link from "next/link";
import {
    useAudioRecorder,
    speakArabic,
    isTtsSupported,
    stopSpeaking,
} from "@/utils/speech";

interface Message {
    id: string;
    role: "user" | "model";
    content: string;
    timestamp: Date;
    /** Image specifically attached to this message (base64 preview) */
    imagePreview?: string;
}

type FailedPayload = {
    message: string;
    history: { role: "user" | "model"; content: string; imageBase64?: string }[];
    imageBase64?: string;
};

export default function FarmerChat() {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "welcome",
            role: "model",
            content:
                "أهلاً بك يا حاج! أنا مرشدك الزراعي الذكي 🌾. إسألني عن أي حاجة تخص زرعك، الري، التسميد، أو الأمراض اللي بتواجهك وأنا هجاوبك حالاً. يمكنك كمان ترفق صورة من المحصول وأنا هحللها.",
            timestamp: new Date(),
        },
    ]);
    const [inputText, setInputText] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeSpeechId, setActiveSpeechId] = useState<string | null>(null);
    const [ttsSupported, setTtsSupported] = useState(false);

    // Image attachment state
    const [attachedImage, setAttachedImage] = useState<string | null>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);

    // Stores the last failed request so we can retry it
    const [failedPayload, setFailedPayload] = useState<FailedPayload | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const {
        isRecording,
        transcribing,
        error: recorderError,
        hasMic,
        startRecording,
        stopRecording,
    } = useAudioRecorder();

    useEffect(() => {
        setTtsSupported(isTtsSupported());
        return () => {
            stopSpeaking();
        };
    }, []);

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isLoading]);

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

    // Handle image file selection (from camera or gallery)
    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            setAttachedImage(ev.target?.result as string);
        };
        reader.readAsDataURL(file);
        // Reset so same file can be re-selected
        if (cameraInputRef.current) cameraInputRef.current.value = "";
        if (galleryInputRef.current) galleryInputRef.current.value = "";
    };

    // Core API call shared for retry
    const callChatApi = async (payload: FailedPayload) => {
        setIsLoading(true);
        setError(null);
        setFailedPayload(null);

        try {
            const res = await fetch("/api/crop-chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const data = await res.json();

            if (!res.ok || data.error) {
                setError(data.error || "عذراً، حدث خطأ في معالجة طلبك.");
                setFailedPayload(payload);
            } else if (data.success && data.text) {
                const modelMsg: Message = {
                    id: `msg-${Date.now()}-model`,
                    role: "model",
                    content: data.text,
                    timestamp: new Date(),
                };
                setMessages((prev) => [...prev, modelMsg]);

                // Auto-play the AI response if TTS is supported
                if (isTtsSupported()) {
                    handleSpeak(modelMsg.content, modelMsg.id);
                }
            }
        } catch (err) {
            console.error("[chat] error sending message:", err);
            setError("تعذر الاتصال بالخادم، تأكد من اتصال الإنترنت وحاول مرة أخرى.");
            setFailedPayload(payload);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSend = async (textToSend?: string) => {
        const text = (textToSend || inputText).trim();
        // Allow sending if there's text OR an image attached
        if ((!text && !attachedImage) || isLoading) return;

        // Compress image if present
        let compressedImage: string | undefined = undefined;
        if (attachedImage) {
            try {
                compressedImage = await compressImage(attachedImage);
            } catch {
                compressedImage = attachedImage;
            }
        }

        const imagePreview = attachedImage || undefined;

        setInputText("");
        setAttachedImage(null);

        const displayText = text || (imagePreview ? "📷 تم إرفاق صورة" : "");

        const userMsg: Message = {
            id: `msg-${Date.now()}-user`,
            role: "user",
            content: displayText,
            timestamp: new Date(),
            imagePreview,
        };

        setMessages((prev) => [...prev, userMsg]);

        // Build history with per-message image data
        const chatHistory = messages
            .filter((m) => m.id !== "welcome")
            .map((m) => ({
                role: m.role,
                content: m.content,
                imageBase64: m.imagePreview,
            }));

        const payload: FailedPayload = {
            history: chatHistory,
            message: text || "انظر إلى الصورة المرفقة وأخبرني بما تراه من إصابات أو أمراض",
            imageBase64: compressedImage,
        };

        await callChatApi(payload);
    };

    const handleRetry = () => {
        if (!failedPayload) return;
        callChatApi(failedPayload);
    };

    const handleMicClick = async () => {
        if (isRecording) {
            await stopRecording((transcript) => {
                setInputText((prev) => (prev ? prev + " " + transcript : transcript));
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
        <div className="flex flex-col h-[calc(100vh-120px)] max-w-2xl mx-auto bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 bg-slate-900 border-b border-slate-800">
                <Link
                    href="/farmer"
                    className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-full transition-colors"
                >
                    <ArrowRight className="w-5 h-5" />
                </Link>
                <div>
                    <h2 className="text-white font-bold text-lg">المرشد الزراعي الذكي</h2>
                    <p className="text-emerald-400 text-xs flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        متاح للاستشارة الصوتية والكتابية وبالصور
                    </p>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4 scrollbar-thin scrollbar-thumb-slate-800">
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`flex gap-3 max-w-[85%] ${msg.role === "user" ? "mr-auto flex-row-reverse" : "ml-auto"
                            }`}
                    >
                        {/* Avatar */}
                        <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border ${msg.role === "user"
                                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                    : "bg-slate-800 border-slate-700 text-slate-300"
                                }`}
                        >
                            {msg.role === "user" ? (
                                <User className="w-5 h-5" />
                            ) : (
                                <Bot className="w-5 h-5" />
                            )}
                        </div>

                        {/* Bubble */}
                        <div className={`space-y-1.5 ${msg.role === "user" ? "items-end flex flex-col" : ""}`}>
                            {/* Attached image thumbnail in bubble */}
                            {msg.imagePreview && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={msg.imagePreview}
                                    alt="صورة مرفقة"
                                    className="w-52 h-40 object-cover rounded-2xl border border-slate-700 shadow-md"
                                />
                            )}
                            <div
                                className={`rounded-2xl p-4 text-sm leading-relaxed relative ${msg.role === "user"
                                        ? "bg-emerald-600 text-white rounded-tr-none"
                                        : "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none"
                                    }${!msg.content || msg.content === "📷" ? " italic opacity-70" : ""}`}
                            >
                                {msg.content && msg.content !== "📷" && <p className="whitespace-pre-line">{msg.content}</p>}

                                {/* TTS Speaker icon for model replies */}
                                {msg.role === "model" && ttsSupported && (
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
                            <span className="text-[10px] text-slate-500 block px-1">
                                {msg.timestamp.toLocaleTimeString("ar-EG", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                })}
                            </span>
                        </div>
                    </div>
                ))}

                {/* Loading / Writing Indicator */}
                {isLoading && (
                    <div className="flex gap-3 max-w-[85%] ml-auto">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-slate-800 border border-slate-700 text-slate-300">
                            <Bot className="w-5 h-5" />
                        </div>
                        <div className="bg-slate-900 border border-slate-800 text-slate-400 rounded-2xl rounded-tl-none p-4 text-sm flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                            <span>جاري كتابة الرد الزراعي...</span>
                        </div>
                    </div>
                )}

                {/* Audio transcribing indicator */}
                {transcribing && (
                    <div className="flex gap-3 max-w-[85%] mr-auto flex-row-reverse">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                            <User className="w-5 h-5" />
                        </div>
                        <div className="bg-slate-900 border border-slate-800 text-slate-400 rounded-2xl rounded-tr-none p-4 text-sm flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                            <span>جاري كتابة صوتك بالذكاء الاصطناعي...</span>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Errors or Mic Alerts with Retry Button */}
            {(error || recorderError) && (
                <div className="mx-4 p-3 bg-red-500/10 border border-red-500/20 rounded-2xl flex flex-col items-center gap-2.5 text-red-400 text-xs">
                    <div className="flex items-start gap-2.5 w-full">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <p className="leading-relaxed flex-1">{error || recorderError}</p>
                    </div>
                    {failedPayload && (
                        <button
                            onClick={handleRetry}
                            className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 px-4 py-2 rounded-xl transition-colors self-center"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                            إعادة الإرسال
                        </button>
                    )}
                </div>
            )}

            {/* Attached image preview bar */}
            {attachedImage && (
                <div className="mx-4 mb-1 flex items-center gap-3 bg-slate-900/80 border border-slate-800 rounded-2xl px-3 py-2">
                    <div className="relative flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={attachedImage}
                            alt="معاينة الصورة"
                            className="w-14 h-10 object-cover rounded-xl border border-emerald-500/40"
                        />
                        <button
                            onClick={() => setAttachedImage(null)}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white shadow-sm"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                    <span className="text-slate-400 text-xs flex-1">صورة جاهزة للإرسال — يمكنك كتابة سؤالك أو الضغط إرسال مباشرة</span>
                </div>
            )}

            {/* Footer / Input form */}
            <div className="p-4 bg-slate-900 border-t border-slate-800 space-y-3">
                <div className="flex items-center gap-2">
                    {/* Camera: instant capture */}
                    <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={isLoading || transcribing}
                        className="p-3 rounded-full border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 disabled:opacity-40 transition-colors shrink-0"
                        title="تصوير فوري بالكاميرا"
                    >
                        <Camera className="w-5 h-5" />
                    </button>
                    <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        ref={cameraInputRef}
                        onChange={handleImageSelect}
                        className="hidden"
                    />

                    {/* Gallery: pick from device files */}
                    <button
                        type="button"
                        onClick={() => galleryInputRef.current?.click()}
                        disabled={isLoading || transcribing}
                        className="p-3 rounded-full border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 disabled:opacity-40 transition-colors shrink-0"
                        title="اختر صورة من الهاتف"
                    >
                        <FolderOpen className="w-5 h-5" />
                    </button>
                    <input
                        type="file"
                        accept="image/*"
                        ref={galleryInputRef}
                        onChange={handleImageSelect}
                        className="hidden"
                    />

                    {/* Microphone button (Speech-to-Text via Groq Whisper) */}
                    {hasMic && (
                        <button
                            type="button"
                            onClick={handleMicClick}
                            disabled={isLoading || transcribing}
                            className={`p-3 rounded-full border transition-all duration-300 shrink-0 ${isRecording
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

                    {/* Text Input */}
                    <input
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        disabled={isLoading || transcribing}
                        placeholder={
                            isRecording
                                ? "جاري تسجيل صوتك... انقر للتوقف والكتابة"
                                : transcribing
                                ? "جاري ترجمة صوتك لنص..."
                                : attachedImage
                                ? "اكتب سؤالك عن الصورة (اختياري)..."
                                : "اكتب سؤالك هنا عن الزرع والسماد والأمراض..."
                        }
                        className="flex-1 bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-emerald-500 text-white placeholder-slate-500 rounded-full py-3 px-5 text-sm outline-none transition-colors disabled:opacity-50"
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                    />

                    {/* Send Button */}
                    <button
                        type="button"
                        onClick={() => handleSend()}
                        disabled={isLoading || transcribing || (!inputText.trim() && !attachedImage)}
                        className="p-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-full transition-colors active:scale-95 shadow-md flex items-center justify-center shrink-0"
                        title="إرسال"
                    >
                        <Send className="w-5 h-5 rotate-180" />
                    </button>
                </div>
                {isRecording && (
                    <p className="text-center text-[10px] text-red-400 animate-pulse">
                        الميكروفون نشط الآن. انقر على المربع الأحمر عند الانتهاء لترجمة كلامك إلى نص تلقائياً.
                    </p>
                )}
            </div>
        </div>
    );
}
