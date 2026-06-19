"use client";

import { useEffect, useRef } from "react";

interface ScrollPickerProps {
  items: (string | number)[];
  value: string | number;
  onChange: (value: string | number) => void;
  itemHeight?: number;
}

export default function ScrollPicker({
  items,
  value,
  onChange,
  itemHeight = 36,
}: ScrollPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrolling = useRef(false);

  const visibleCount = 5;
  const containerHeight = itemHeight * visibleCount;
  const padding = itemHeight * Math.floor(visibleCount / 2);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const idx = items.indexOf(value);
    if (idx >= 0) {
      container.scrollTop = idx * itemHeight;
    }
  }, [value, items, itemHeight]);

  function handleScroll() {
    if (isScrolling.current) return;
    const container = containerRef.current;
    if (!container) return;

    clearTimeout((handleScroll as { timeout?: ReturnType<typeof setTimeout> }).timeout);
    (handleScroll as { timeout?: ReturnType<typeof setTimeout> }).timeout = setTimeout(() => {
      const idx = Math.round(container.scrollTop / itemHeight);
      const clamped = Math.max(0, Math.min(idx, items.length - 1));
      if (items[clamped] !== value) {
        onChange(items[clamped]);
      }
      isScrolling.current = false;
    }, 100);
  }

  return (
    <div
      className="relative overflow-hidden"
      style={{ height: containerHeight }}
    >
      {/* 選択ハイライト */}
      <div
        className="absolute left-0 right-0 border-t border-b border-gray-400 pointer-events-none z-10"
        style={{ top: padding, height: itemHeight }}
      />
      <div
        ref={containerRef}
        className="scroll-picker h-full"
        onScroll={handleScroll}
      >
        <div style={{ paddingTop: padding, paddingBottom: padding }}>
          {items.map((item, i) => (
            <div
              key={i}
              className="scroll-picker-item flex items-center justify-center text-sm font-bold"
              style={{ height: itemHeight }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
