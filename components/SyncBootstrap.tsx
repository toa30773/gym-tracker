"use client";

import { useEffect, useState } from "react";
import { wireSyncEvents, subscribeSync, type SyncState } from "@/lib/sync";

export default function SyncBootstrap() {
  const [state, setState] = useState<SyncState | null>(null);

  useEffect(() => {
    wireSyncEvents();
    return subscribeSync(setState);
  }, []);

  if (!state) return null;
  // ネット復帰直後など、表示が要らない通常状態はバナーを出さない
  if (state.online && state.pending === 0 && !state.syncing && !state.lastError) {
    return null;
  }

  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-40 max-w-[420px] w-[calc(100%-16px)] pointer-events-none">
      <div
        className={`rounded-full px-3 py-1.5 text-[10px] text-center shadow-sm border ${
          !state.online
            ? "bg-gray-800 text-white border-gray-800"
            : state.lastError
            ? "bg-red-50 text-red-700 border-red-200"
            : "bg-white text-gray-700 border-gray-200"
        }`}
      >
        {!state.online && (
          <span>
            オフライン中{state.pending > 0 ? `（未同期 ${state.pending} 件）` : ""}
          </span>
        )}
        {state.online && state.syncing && <span>同期中…</span>}
        {state.online && !state.syncing && state.pending > 0 && (
          <span>未同期 {state.pending} 件 / 自動再送します</span>
        )}
        {state.online && state.lastError && !state.syncing && (
          <span>同期失敗: {state.lastError}</span>
        )}
      </div>
    </div>
  );
}
