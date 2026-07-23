"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Search, X } from "lucide-react";

type Option = string;

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  label?: string;
  required?: boolean;
}

/**
 * قائمة منسدلة مع دعم البحث التقريبي - المستخدم ملزم بالاختيار من القائمة فقط
 */
export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "اختر من القائمة...",
  disabled = false,
  id,
  label,
  required,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // فلترة الخيارات بناءً على البحث
  const filtered = options.filter((opt) =>
    opt.toLowerCase().includes(search.toLowerCase()) ||
    opt.includes(search)
  );

  // إغلاق القائمة عند النقر خارجها
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
      setIsOpen(false);
      setSearch("");
    }
  }, []);

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClickOutside]);

  // فتح القائمة والتركيز على حقل البحث
  function handleOpen() {
    if (disabled) return;
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleSelect(option: string) {
    onChange(option);
    setIsOpen(false);
    setSearch("");
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
    setSearch("");
  }

  return (
    <div className="relative" ref={wrapperRef}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-slate-300 mb-1.5">
          {label}
          {required && <span className="text-red-400 mr-1">*</span>}
        </label>
      )}

      {/* زر فتح القائمة */}
      <button
        type="button"
        id={id}
        onClick={handleOpen}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`
          w-full flex items-center justify-between gap-2
          bg-white/5 border rounded-xl px-4 py-3 text-sm text-right
          transition-all duration-200
          ${disabled ? "opacity-50 cursor-not-allowed border-slate-700" : "cursor-pointer border-slate-600 hover:border-green-500/60"}
          ${isOpen ? "border-green-500 ring-2 ring-green-500/30" : ""}
          ${value ? "text-white" : "text-slate-400"}
        `}
      >
        <span className="flex-1 text-right truncate">{value || placeholder}</span>
        <div className="flex items-center gap-1 shrink-0">
          {value && !disabled && (
            <span
              onClick={handleClear}
              className="text-slate-400 hover:text-white transition-colors p-0.5 rounded cursor-pointer"
              title="مسح الاختيار"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {/* القائمة المنسدلة */}
      {isOpen && (
        <div
          role="listbox"
          className="absolute z-50 mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden"
          style={{ maxHeight: "280px" }}
        >
          {/* حقل البحث */}
          <div className="p-2 border-b border-slate-800 sticky top-0 bg-slate-900">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pr-9 pl-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/30"
                dir="rtl"
              />
            </div>
          </div>

          {/* النتائج */}
          <div className="overflow-y-auto" style={{ maxHeight: "220px" }}>
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-slate-500 text-sm">
                لا توجد نتائج لـ &ldquo;{search}&rdquo;
              </div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  role="option"
                  aria-selected={opt === value}
                  onClick={() => handleSelect(opt)}
                  className={`
                    w-full text-right px-4 py-2.5 text-sm transition-colors block
                    ${opt === value
                      ? "bg-green-600/20 text-green-400 font-medium"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    }
                  `}
                >
                  {opt}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
