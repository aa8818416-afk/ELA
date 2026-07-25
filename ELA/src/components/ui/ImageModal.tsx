"use client";

import React, { useEffect } from "react";
import { X, ZoomIn } from "lucide-react";

interface ImageModalProps {
  isOpen: boolean;
  imageUrl: string | null;
  altText?: string;
  onClose: () => void;
}

export function ImageModal({ isOpen, imageUrl, altText = "صورة المنتج", onClose }: ImageModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "auto";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative max-w-3xl max-h-[80vh] w-full flex items-center justify-center m-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Scaled Image Container centered strictly */}
        <div className="relative overflow-hidden max-h-[75vh] max-w-full rounded-2xl border border-slate-700/80 bg-slate-900/95 shadow-2xl flex items-center justify-center group my-auto">
          {/* Close Button Inside Container (Top-Right) */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-20 p-2.5 rounded-full bg-slate-950/90 hover:bg-red-600 text-white backdrop-blur-md transition-all border border-white/20 shadow-xl"
            title="إغلاق والتصفح"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Optional Alt Text Badge (Top-Left) */}
          {altText && (
            <div className="absolute top-3 left-3 z-10 text-xs font-medium bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-slate-200 pointer-events-none">
              {altText}
            </div>
          )}

          <img
            src={imageUrl}
            alt={altText}
            className="object-contain max-h-[75vh] w-auto max-w-full hover:scale-105 transition-transform duration-300 p-1"
          />
        </div>
      </div>
    </div>
  );
}

interface ZoomableImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  containerClassName?: string;
}

export function ZoomableImage({ src, alt, className = "", containerClassName = "", ...props }: ZoomableImageProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <>
      <div
        className={`relative group cursor-pointer shrink-0 overflow-hidden ${containerClassName}`}
        onClick={() => setIsOpen(true)}
        title="انقر لتكبير الصورة"
      >
        <img src={src} alt={alt} className={className} {...props} />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-[inherit]">
          <ZoomIn className="w-5 h-5 text-white drop-shadow-md" />
        </div>
      </div>

      <ImageModal isOpen={isOpen} imageUrl={src} altText={alt} onClose={() => setIsOpen(false)} />
    </>
  );
}
