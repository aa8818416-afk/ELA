"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
    WifiOff,
    Globe,
    ExternalLink,
    MessageSquare,
    Plus,
    Trash2,
    Clock,
    Sparkles,
    PanelLeftClose,
    PanelLeftOpen,
} from "lucide-react";
import Link from "next/link";
import {
    useAudioRecorder,
    speakArabic,
    isTtsSupported,
    stopSpeaking,
} from "@/utils/speech";
import ProductRecommendationCard from "@/components/chat/ProductRecommendationCard";
import type { RecommendedProduct } from "@/components/chat/QuickOrderModal";

interface Message {
    id: string;
    session_id?: string;
    role: "user" | "model";
    content: string;
    timestamp: Date;
    /** Image specifically attached to this message (base64 preview) */
    imagePreview?: string;
    recommendedProduct?: RecommendedProduct;
    sources?: Array<{ title: string; url: string }>;
}

interface ChatSession {
    id: string;
    title: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

type FailedPayload = {
    message: string;
    session_id?: string | null;
    history: { role: "user" | "model"; content: string; imageBase64?: string }[];
    imageBase64?: string;
};

const WELCOME_MESSAGE: Message = {
    id: "welcome",
    role: "model",
    content:
        "أهلاً بك يا حاج! أنا مرشدك الزراعي الذكي 🌾. إسألني عن أي حاجة تخص زرعك، الري، التسميد، أو الأمراض اللي بتواجهك وأنا هجاوبك حالاً. يمكنك كمان ترفق صورة من المحصول وأنا هحللها.",
    timestamp: new Date(),
};

export default function FarmerChat() {
    const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    const [inputText, setInputText] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeSpeechId, setActiveSpeechId] = useState<string | null>(null);
    const [loadingSpeechId, setLoadingSpeechId] = useState<string | null>(null);
    const [ttsSupported, setTtsSupported] = useState(false);

    // Image attachment state
    const [attachedImage, setAttachedImage] = useState<string | null>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);

    // Stores the last failed request so we can retry it
    const [failedPayload, setFailedPayload] = useState<FailedPayload | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

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

    // ── Load Sessions List ──────────────────────────────────────────────────
    const loadSessions = useCallback(async () => {
        try {
            const res = await fetch("/api/crop-chat?action=sessions");
            if (res.ok) {
                const data = await res.json();
                if (data.sessions) {
                    setSessions(data.sessions);
                }
            }
        } catch (err) {
            console.warn("Failed to load sessions:", err);
        }
    }, []);

    // ── Load Messages for a specific Session ────────────────────────────────
    const loadSessionMessages = useCallback(async (sessionId?: string | null) => {
        setIsLoadingHistory(true);
        try {
            const url = sessionId ? `/api/crop-chat?session_id=${sessionId}` : "/api/crop-chat";
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data.messages && data.messages.length > 0) {
                    setMessages(data.messages.map((m: any) => ({
                        id: m.id || String(Math.random()),
                        session_id: m.session_id,
                        role: m.role,
                        content: m.content,
                        timestamp: new Date(m.created_at || Date.now()),
                        imagePreview: m.imageBase64,
                    })));
                    if (data.session_id) {
                        setCurrentSessionId(data.session_id);
                    }
                } else if (sessionId) {
                    setMessages([WELCOME_MESSAGE]);
                }
            }
        } catch (err) {
            console.warn("Failed to load messages:", err);
        } finally {
            setIsLoadingHistory(false);
        }
    }, []);

    // Initial Load: Sessions & Latest History
    useEffect(() => {
        loadSessions();
        loadSessionMessages();
    }, [loadSessions, loadSessionMessages]);

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isLoading]);

    // Auto-resize textarea whenever inputText changes
    const autoResize = useCallback(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 144) + "px";
    }, []);

    useEffect(() => {
        autoResize();
    }, [inputText, autoResize]);

    // ── Start New Chat Session ──────────────────────────────────────────────
    const startNewChat = () => {
        setCurrentSessionId(null);
        setMessages([WELCOME_MESSAGE]);
        setIsSidebarOpen(false);
        setError(null);
        setAttachedImage(null);
    };

    // ── Select Past Session ─────────────────────────────────────────────────
    const selectSession = (sessionId: string) => {
        if (sessionId === currentSessionId) {
            setIsSidebarOpen(false);
            return;
        }
        setCurrentSessionId(sessionId);
        loadSessionMessages(sessionId);
        setIsSidebarOpen(false);
    };

    // ── Delete a Session ────────────────────────────────────────────────────
    const deleteSession = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        if (!confirm("هل تريد بالتأكيد حذف هذه المحادثة؟")) return;

        try {
            const res = await fetch(`/api/crop-chat?session_id=${sessionId}`, {
                method: "DELETE",
            });
            if (res.ok) {
                setSessions((prev) => prev.filter((s) => s.id !== sessionId));
                if (currentSessionId === sessionId) {
                    startNewChat();
                }
            }
        } catch (err) {
            console.error("Failed to delete session:", err);
        }
    };

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

    // Handle image file selection
    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            setAttachedImage(ev.target?.result as string);
        };
        reader.readAsDataURL(file);
        if (cameraInputRef.current) cameraInputRef.current.value = "";
        if (galleryInputRef.current) galleryInputRef.current.value = "";
    };

    // Core API call
    const callChatApi = async (payload: FailedPayload) => {
        setIsLoading(true);
        setError(null);
        setFailedPayload(null);

        try {
            const res = await fetch("/api/crop-chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...payload,
                    session_id: currentSessionId,
                }),
            });

            const data = await res.json();

            if (res.status === 401) {
                setError("انتهت جلستك، يرجى تسجيل الدخول مجدداً.");
                setFailedPayload(null);
            } else if (!res.ok || data.error) {
                setError(data.error || "عذراً، حدث خطأ في معالجة طلبك.");
                setFailedPayload(payload);
            } else if (data.success && data.text) {
                if (data.session_id && data.session_id !== currentSessionId) {
                    setCurrentSessionId(data.session_id);
                    loadSessions();
                }

                const modelMsg: Message = {
                    id: `msg-${Date.now()}-model`,
                    session_id: data.session_id || currentSessionId || undefined,
                    role: "model",
                    content: data.text,
                    timestamp: new Date(),
                    recommendedProduct: data.recommendedProduct || undefined,
                    sources: data.sources || undefined,
                };
                setMessages((prev) => [...prev, modelMsg]);

                if (isTtsSupported()) {
                    handleSpeak(modelMsg.content, modelMsg.id);
                }
            }
        } catch (err) {
            const isNetworkError =
                err instanceof TypeError &&
                (err.message.toLowerCase().includes("fetch") ||
                    err.message.toLowerCase().includes("network") ||
                    err.message.toLowerCase().includes("failed to fetch"));

            if (isNetworkError) {
                setError("__network__");
            } else {
                console.error("[chat] error sending message:", err);
                setError("عذراً، حدث خطأ غير متوقع. حاول مرة أخرى.");
            }
            setFailedPayload(payload);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSend = async (textToSend?: string) => {
        const text = (textToSend || inputText).trim();
        if ((!text && !attachedImage) || isLoading) return;

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

        const userMsg: Message = {
            id: `msg-${Date.now()}-user`,
            session_id: currentSessionId || undefined,
            role: "user",
            content: text || "📷",
            timestamp: new Date(),
            imagePreview,
        };

        const nextMessages = [...messages, userMsg];
        setMessages(nextMessages);

        const historyPayload = nextMessages
            .filter((m) => m.id !== "welcome" && m.id !== userMsg.id)
            .map((m) => ({
                role: m.role,
                content: m.content,
                imageBase64: m.imagePreview,
            }));

        const payload: FailedPayload = {
            message: text || "صف هذه الصورة الزراعية وحللها بدقة وقدم التوصيات المناسبة.",
            session_id: currentSessionId,
            history: historyPayload,
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
        if (activeSpeechId === msgId || loadingSpeechId === msgId) {
            stopSpeaking();
            setActiveSpeechId(null);
            setLoadingSpeechId(null);
            return;
        }

        stopSpeaking();
        setActiveSpeechId(null);
        setLoadingSpeechId(null);
        setLoadingSpeechId(msgId);

        speakArabic(
            text,
            () => {},
            () => {
                setLoadingSpeechId(null);
                setActiveSpeechId(msgId);
            },
            () => {
                setActiveSpeechId(null);
                setLoadingSpeechId(null);
            }
        );
    };

    return (
        <div className="relative w-full max-w-3xl mx-auto">
            {/* ── Sliding Left Sidebar Drawer (على الشمال وتتفتح وتنقفل) ────── */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 transition-opacity"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            <div
                className={`fixed top-0 left-0 h-full w-80 max-w-[85vw] bg-white border-r border-slate-200 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
                    isSidebarOpen ? "translate-x-0" : "-translate-x-full"
                }`}
            >
                {/* Sidebar Header */}
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                    <div className="flex items-center gap-2 text-slate-800">
                        <MessageSquare className="w-5 h-5 text-emerald-600" />
                        <h3 className="font-bold text-sm">محادثاتك السابقة</h3>
                        {sessions.length > 0 && (
                            <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                                {sessions.length}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={() => setIsSidebarOpen(false)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200/60 transition-colors"
                        title="إغلاق القائمة"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* New Chat Button */}
                <div className="p-3 bg-white">
                    <button
                        onClick={startNewChat}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-all shadow-sm active:scale-[0.98]"
                    >
                        <Plus className="w-4 h-4" />
                        <span>محادثة جديدة</span>
                    </button>
                </div>

                {/* Sessions List */}
                <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
                    <p className="text-[11px] font-bold text-slate-400 px-2 pb-1">سجل آخر 7 أيام</p>
                    {sessions.length === 0 ? (
                        <div className="text-center py-12 text-slate-400 text-xs flex flex-col items-center gap-2">
                            <MessageSquare className="w-8 h-8 opacity-30 text-slate-400" />
                            <span>لا توجد محادثات سابقة مسجلة</span>
                            <span className="text-[10px] text-slate-400">ابدأ استشارتك الأولى الآن</span>
                        </div>
                    ) : (
                        sessions.map((sess) => {
                            const isCurrent = sess.id === currentSessionId;
                            return (
                                <div
                                    key={sess.id}
                                    onClick={() => selectSession(sess.id)}
                                    className={`group flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all border ${
                                        isCurrent
                                            ? "bg-emerald-50 border-emerald-300 text-emerald-900 shadow-xs font-bold"
                                            : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200/80 hover:border-slate-300"
                                    }`}
                                >
                                    <div className="flex items-start gap-2.5 flex-1 min-w-0 pr-1 text-right">
                                        <MessageSquare
                                            className={`w-4 h-4 shrink-0 mt-0.5 ${
                                                isCurrent ? "text-emerald-600" : "text-slate-400 group-hover:text-emerald-600"
                                            }`}
                                        />
                                        <div className="truncate flex-1">
                                            <p className="text-xs truncate leading-snug">
                                                {sess.title || "استشارة زراعية"}
                                            </p>
                                            <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-1 font-normal">
                                                <Clock className="w-3 h-3" />
                                                {new Date(sess.updated_at).toLocaleDateString("ar-EG", {
                                                    weekday: "short",
                                                    month: "numeric",
                                                    day: "numeric",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => deleteSession(e, sess.id)}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-all"
                                        title="حذف المحادثة"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* ── Main Chat Box (Centered in Page - Clean White Theme) ─── */}
            <div className="bg-white border border-slate-200/90 rounded-3xl shadow-sm flex flex-col h-[calc(100vh-140px)] min-h-[550px] overflow-hidden">
                {/* Header */}
                <div className="p-4 bg-white border-b border-slate-200/80 flex items-center justify-between z-10 shadow-xs">
                    {/* Right: Title & Back Button */}
                    <div className="flex items-center gap-2.5">
                        <Link
                            href="/farmer"
                            className="p-2 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-full transition-colors"
                            title="العودة للرئيسية"
                        >
                            <ArrowRight className="w-5 h-5" />
                        </Link>
                        <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-xl shadow-xs shrink-0">
                            🌿
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5">
                                <h2 className="text-slate-900 font-black text-base leading-tight">المرشد الزراعي الذكي</h2>
                                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded-md border border-emerald-200">AI</span>
                            </div>
                            <p className="text-emerald-700 text-xs flex items-center gap-1 mt-0.5 font-medium">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                متصل وجاهز للتشخيص الصوتي والكتابي والصور
                            </p>
                        </div>
                    </div>

                    {/* Left: Sidebar Toggle & New Chat Button */}
                    <div className="flex items-center gap-1.5">
                        {/* New Chat Quick Button */}
                        <button
                            onClick={startNewChat}
                            className="flex items-center gap-1 text-xs font-bold py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-all active:scale-95 shadow-xs"
                            title="محادثة جديدة"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">جديد</span>
                        </button>

                        {/* Left Sidebar Toggle Button */}
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            className="flex items-center gap-1.5 text-xs font-bold py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 border border-slate-200 transition-all active:scale-95 shadow-xs"
                            title="عرض المحادثات السابقة على الشمال"
                        >
                            <MessageSquare className="w-4 h-4 text-emerald-600" />
                            <span className="hidden sm:inline">المحادثات</span>
                            {sessions.length > 0 && (
                                <span className="text-[10px] bg-emerald-600 text-white font-bold px-1.5 py-0.2 rounded-full">
                                    {sessions.length}
                                </span>
                            )}
                        </button>
                    </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4 bg-[#f8faf9]/60 scrollbar-thin scrollbar-thumb-slate-300">
                    {isLoadingHistory ? (
                        <div className="flex items-center justify-center h-48 text-slate-500 text-sm gap-2">
                            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                            <span>جاري استرجاع المحادثة...</span>
                        </div>
                    ) : (
                        messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex gap-3 max-w-[90%] sm:max-w-[85%] ${
                                    msg.role === "user" ? "mr-auto flex-row-reverse" : "ml-auto text-right"
                                }`}
                            >
                                {/* Avatar */}
                                <div
                                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border shadow-xs ${
                                        msg.role === "user"
                                            ? "bg-emerald-100 border-emerald-200 text-emerald-800"
                                            : "bg-white border-slate-200 text-slate-700"
                                    }`}
                                >
                                    {msg.role === "user" ? (
                                        <User className="w-4 h-4" />
                                    ) : (
                                        <Bot className="w-4 h-4 text-emerald-600" />
                                    )}
                                </div>

                                {/* Bubble */}
                                <div className={`space-y-1.5 flex-1 min-w-0 ${msg.role === "user" ? "items-end flex flex-col" : ""}`}>
                                    {msg.imagePreview && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={msg.imagePreview}
                                            alt="صورة مرفقة"
                                            className="w-52 h-40 object-cover rounded-2xl border border-slate-200 shadow-xs mb-1"
                                        />
                                    )}
                                    <div
                                        className={`rounded-2xl p-4 text-sm leading-relaxed relative shadow-xs ${
                                            msg.role === "user"
                                                ? "bg-emerald-600 text-white rounded-tr-none"
                                                : "bg-white border border-slate-200/90 text-slate-800 rounded-tl-none whitespace-pre-line"
                                        }${!msg.content || msg.content === "📷" ? " italic opacity-80" : ""}`}
                                    >
                                        {msg.content && msg.content !== "📷" && (
                                            <p>{msg.content}</p>
                                        )}

                                        {/* Product Recommendation Card */}
                                        {msg.role === "model" && msg.recommendedProduct && (
                                            <ProductRecommendationCard product={msg.recommendedProduct} userRole="farmer" />
                                        )}

                                        {/* Web Search Grounding Sources */}
                                        {msg.role === "model" && msg.sources && msg.sources.length > 0 && (
                                            <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs">
                                                <div className="flex items-center gap-1 text-emerald-700 font-bold mb-1.5">
                                                    <Globe className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                                    <span>المصادر ومراجع البحث من الويب:</span>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {msg.sources.map((source, idx) => (
                                                        <a
                                                            key={idx}
                                                            href={source.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-slate-600 hover:text-emerald-800 text-[11px] px-2.5 py-1 rounded-lg transition-colors max-w-full truncate"
                                                            title={source.url}
                                                        >
                                                            <span className="truncate max-w-[180px]">{source.title}</span>
                                                            <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
                                                        </a>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* TTS Speaker icon for model replies */}
                                        {msg.role === "model" && ttsSupported && (
                                            <button
                                                type="button"
                                                onClick={() => handleSpeak(msg.content, msg.id)}
                                                className={`absolute -bottom-2.5 -left-2.5 p-1.5 rounded-full border shadow-xs transition-colors ${
                                                    loadingSpeechId === msg.id || activeSpeechId === msg.id
                                                        ? "bg-emerald-600 text-white border-emerald-500"
                                                        : "bg-white text-slate-500 hover:text-emerald-700 border-slate-200 hover:bg-slate-50"
                                                }`}
                                                title={
                                                    loadingSpeechId === msg.id
                                                        ? "جاري تحميل الصوت... (إيقاف)"
                                                        : activeSpeechId === msg.id
                                                        ? "إيقاف الصوت"
                                                        : "قراءة الرسالة بصوت عالي"
                                                }
                                            >
                                                {loadingSpeechId === msg.id ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : activeSpeechId === msg.id ? (
                                                    <VolumeX className="w-3.5 h-3.5" />
                                                ) : (
                                                    <Volume2 className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                        )}
                                    </div>
                                    <span className="text-[10px] text-slate-400 block px-1">
                                        {msg.timestamp.toLocaleTimeString("ar-EG", {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}

                    {/* Loading / Writing Indicator */}
                    {isLoading && (
                        <div className="flex gap-3 max-w-[85%] ml-auto text-right">
                            <div className="w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                                <Bot className="w-4 h-4 text-emerald-600" />
                            </div>
                            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none p-3.5 text-sm text-slate-600 flex items-center gap-2 shadow-xs">
                                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                                <span>جاري فحص السؤال وتحضير الإجابة...</span>
                            </div>
                        </div>
                    )}

                    {/* Audio transcribing indicator */}
                    {transcribing && (
                        <div className="flex gap-3 max-w-[85%] mr-auto flex-row-reverse text-right">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                                <User className="w-4 h-4" />
                            </div>
                            <div className="bg-white border border-slate-200 rounded-2xl rounded-tr-none p-3.5 text-sm text-slate-600 flex items-center gap-2 shadow-xs">
                                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                                <span>جاري تحويل صوتك لنص...</span>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Errors or Mic Alerts */}
                {(error || recorderError) && (
                    <div className="px-4 mb-2">
                        <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex flex-col items-center gap-2 text-red-600 text-xs">
                            <div className="flex items-start gap-2.5 w-full">
                                {error === "__network__" ? (
                                    <WifiOff className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                                ) : (
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                )}
                                <p className="leading-relaxed flex-1">
                                    {error === "__network__"
                                        ? "⚠️ هناك مشكلة في الاتصال بالإنترنت، يرجى المحاولة لاحقاً"
                                        : (error || recorderError)}
                                </p>
                            </div>
                            {failedPayload && error !== "انتهت جلستك، يرجى تسجيل الدخول مجدداً." && (
                                <button
                                    onClick={handleRetry}
                                    className="flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-xl transition-colors"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    إعادة الإرسال
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Attached Image Preview Bar */}
                {attachedImage && (
                    <div className="px-4 mb-2">
                        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-2">
                            <div className="relative flex-shrink-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={attachedImage}
                                    alt="معاينة الصورة"
                                    className="w-14 h-12 object-cover rounded-xl border border-emerald-500 shadow-xs"
                                />
                                <button
                                    onClick={() => setAttachedImage(null)}
                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-xs"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                            <span className="text-slate-600 text-xs flex-1 font-medium">
                                صورة المحصول جاهزة للفحص والتحليل الزراعي
                            </span>
                        </div>
                    </div>
                )}

                {/* Footer Input Area */}
                <div className="p-3 sm:p-4 bg-white border-t border-slate-200/80 space-y-2">
                    {/* Row 1: Textarea + Send */}
                    <div className="flex items-end gap-2">
                        <textarea
                            ref={textareaRef}
                            rows={1}
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            disabled={isLoading || transcribing}
                            placeholder={
                                isRecording
                                    ? "🎙️ جاري تسجيل صوتك..."
                                    : transcribing
                                    ? "⏳ جاري ترجمة صوتك..."
                                    : attachedImage
                                    ? "اكتب سؤالك عن الصورة (اختياري)..."
                                    : "اكتب استشارتك الزراعية هنا..."
                            }
                            className="flex-1 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-emerald-500 focus:bg-white text-slate-900 placeholder-slate-400 rounded-2xl py-3 px-4 text-sm outline-none transition-all disabled:opacity-50 resize-none overflow-y-auto leading-relaxed"
                            style={{ minHeight: "46px", maxHeight: "144px" }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
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
                            className="p-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-2xl transition-all active:scale-95 shadow-xs flex items-center justify-center shrink-0 self-end"
                            title="إرسال"
                            aria-label="إرسال الرسالة"
                        >
                            <Send className="w-5 h-5 rotate-180" />
                        </button>
                    </div>

                    {/* Row 2: Camera / Gallery / Mic icons */}
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => cameraInputRef.current?.click()}
                            disabled={isLoading || transcribing}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 disabled:opacity-50 transition-colors text-xs font-bold"
                            title="تصوير فوري بالكاميرا"
                        >
                            <Camera className="w-4 h-4 text-emerald-600" />
                            <span>كاميرا</span>
                        </button>
                        <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            ref={cameraInputRef}
                            onChange={handleImageSelect}
                            className="hidden"
                        />

                        <button
                            type="button"
                            onClick={() => galleryInputRef.current?.click()}
                            disabled={isLoading || transcribing}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 disabled:opacity-50 transition-colors text-xs font-bold"
                            title="اختر صورة من الهاتف"
                        >
                            <FolderOpen className="w-4 h-4 text-emerald-600" />
                            <span>المعرض</span>
                        </button>
                        <input
                            type="file"
                            accept="image/*"
                            ref={galleryInputRef}
                            onChange={handleImageSelect}
                            className="hidden"
                        />

                        {hasMic && (
                            <button
                                type="button"
                                onClick={handleMicClick}
                                disabled={isLoading || transcribing}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border transition-all text-xs font-bold ${
                                    isRecording
                                        ? "bg-red-500 text-white border-red-400 animate-pulse shadow-sm"
                                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                                }`}
                                title={isRecording ? "إيقاف التسجيل" : "تحدث بالصوت"}
                            >
                                {isRecording ? (
                                    <><Square className="w-4 h-4 fill-current" /><span>إيقاف</span></>
                                ) : (
                                    <><Mic className="w-4 h-4 text-emerald-600" /><span>تسجيل صوتي</span></>
                                )}
                            </button>
                        )}
                    </div>

                    {isRecording && (
                        <p className="text-center text-[11px] text-red-500 animate-pulse font-medium">
                            الميكروفون نشط الآن — انقر «إيقاف» عند الانتهاء
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
