"use client";

import { useState, useEffect, useRef } from "react";

type Mode = "countdown" | "stopwatch";

const PRESETS = [30, 60, 90, 120, 180];

export default function TimerPanel() {
  const [mode, setMode] = useState<Mode>("countdown");
  const [seconds, setSeconds] = useState(60);
  const [initial, setInitial] = useState(60);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setSeconds((s) => {
        if (mode === "countdown") {
          if (s <= 1) {
            setRunning(false);
            return 0;
          }
          return s - 1;
        }
        return s + 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, mode]);

  function switchMode(newMode: Mode) {
    setRunning(false);
    setMode(newMode);
    if (newMode === "countdown") {
      setSeconds(initial);
    } else {
      setSeconds(0);
    }
  }

  function reset() {
    setRunning(false);
    setSeconds(mode === "countdown" ? initial : 0);
  }

  function selectPreset(sec: number) {
    setInitial(sec);
    setSeconds(sec);
    setRunning(false);
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="bg-gray-100 border-t border-gray-200 px-4 py-3">
      {/* モード切替 */}
      <div className="flex justify-center gap-2 mb-2">
        <button
          onClick={() => switchMode("countdown")}
          className={`px-3 py-1 rounded-full text-xs font-bold ${
            mode === "countdown" ? "bg-gray-800 text-white" : "bg-white border border-gray-300"
          }`}
        >
          カウントダウン
        </button>
        <button
          onClick={() => switchMode("stopwatch")}
          className={`px-3 py-1 rounded-full text-xs font-bold ${
            mode === "stopwatch" ? "bg-gray-800 text-white" : "bg-white border border-gray-300"
          }`}
        >
          ストップウォッチ
        </button>
      </div>

      {/* 表示 */}
      <p className="text-3xl font-bold text-center tabular-nums mb-2">
        {mm}:{ss}
      </p>

      {/* プリセット（カウントダウン時のみ） */}
      {mode === "countdown" && (
        <div className="flex justify-center gap-1.5 mb-2">
          {PRESETS.map((sec) => (
            <button
              key={sec}
              onClick={() => selectPreset(sec)}
              className={`px-2.5 py-1 rounded-full text-xs ${
                initial === sec ? "bg-gray-800 text-white" : "bg-white border border-gray-300"
              }`}
            >
              {sec < 60 ? `${sec}秒` : `${sec / 60}分`}
            </button>
          ))}
        </div>
      )}

      {/* スタート/リセット */}
      <div className="flex justify-center gap-3">
        <button
          onClick={() => setRunning((r) => !r)}
          className="px-6 py-2 rounded-full bg-gray-800 text-white text-sm font-bold min-w-[100px]"
        >
          {running ? "一時停止" : "スタート"}
        </button>
        <button
          onClick={reset}
          className="px-6 py-2 rounded-full bg-white border border-gray-400 text-sm font-bold min-w-[80px]"
        >
          リセット
        </button>
      </div>
    </div>
  );
}
