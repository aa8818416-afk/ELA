"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// Minimal Web Speech API typings (not in standard TS lib)
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult:
    | ((e: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor })
      .SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor })
      .webkitSpeechRecognition ||
    null
  );
}

/**
 * Reusable speech-to-text hook (Arabic, ar-EG) with full error handling.
 * Returns a clear Arabic error message when the mic permission is denied
 * or when the browser doesn't support speech recognition.
 */
export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onTranscriptRef = useRef<((text: string) => void) | null>(null);

  useEffect(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setSupported(false);
      return;
    }
    setSupported(true);
    const rec = new Ctor();
    rec.lang = "ar-EG";
    rec.continuous = false;
    rec.interimResults = false;

    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      if (onTranscriptRef.current) onTranscriptRef.current(transcript);
    };
    rec.onerror = (e) => {
      let msg = "تعذر التعرف على الصوت";
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        msg =
          "تم رفض إذن الميكروفون. فعّل الميكروفون من إعدادات المتصفح (أيقونة الكاميرا بجانب الرابط) ثم حاول مرة أخرى.";
      } else if (e.error === "no-speech") {
        msg = "لم أسمع أي كلام. اضغط الميكروفون وتحدث بوضوح.";
      } else if (e.error === "audio-capture") {
        msg = "تعذّر الوصول إلى الميكروفون. تأكد أنه متصل.";
      } else if (e.error === "network") {
        msg = "مشكلة في الشبكة أثناء التعرف على الصوت.";
      }
      setError(msg);
      setIsListening(false);
    };
    rec.onend = () => {
      setIsListening(false);
    };
    recognitionRef.current = rec;

    return () => {
      try {
        rec.abort();
      } catch {
        /* noop */
      }
    };
  }, []);

  const startListening = useCallback(
    (onTranscript: (text: string) => void) => {
      setError(null);
      const rec = recognitionRef.current;
      if (!rec) {
        setError("متصفحك لا يدعم الإدخال الصوتي. استخدم Chrome أو Edge.");
        return;
      }
      onTranscriptRef.current = onTranscript;
      // Check mic permission explicitly first (clearer error than silent failure)
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions
          .query({ name: "microphone" as PermissionName })
          .then((result) => {
            if (result.state === "denied") {
              setError(
                "تم رفض إذن الميكروفون من قبل. فعّله من إعدادات المتصفح (أيقونة الكاميرا/القفل بجانب الرابط) ثم أعد المحاولة."
              );
              return;
            }
            try {
              rec.start();
              setIsListening(true);
            } catch {
              // already started — stop first then start
              try {
                rec.abort();
              } catch {
                /* noop */
              }
            }
          })
          .catch(() => {
            // permissions API not available — just try to start
            try {
              rec.start();
              setIsListening(true);
            } catch {
              /* noop */
            }
          });
      } else {
        try {
          rec.start();
          setIsListening(true);
        } catch {
          /* noop */
        }
      }
    },
    []
  );

  const stopListening = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    }
    setIsListening(false);
  }, []);

  return {
    isListening,
    supported,
    error,
    startListening,
    stopListening,
    clearError: () => setError(null),
  };
}

/** Speak Arabic text using the Web Speech API (text-to-speech). */
export function speakArabic(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ar-EG";
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

export function isTtsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
