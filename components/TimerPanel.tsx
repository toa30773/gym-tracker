"use client";

import { useState, useEffect, useRef } from "react";

export default function TimerPanel() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="bg-gray-300 flex flex-col items-center justify-center gap-2 py-3" style={{ minHeight: 99 }}>
      <p className="text-lg font-bold">{mm}:{ss}</p>
      <div className="flex gap-3">
        <button
          onClick={() => setRunning((r) => !r)}
          className="px-4 py-1 rounded-full bg-white border border-gray-400 text-xs font-bold"
        >
          {running ? "一時停止" : "スタート"}
        </button>
        <button
          onClick={() => { setRunning(false); setSeconds(0); }}
          className="px-4 py-1 rounded-full bg-white border border-gray-400 text-xs font-bold"
        >
          リセット
        </button>
      </div>
    </div>
  );
}
