"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

// ページ離脱時に割り込むためのコールバック。
// guard を持つページが「移動して良いか確認」した後に proceed() を呼ぶことで実際の遷移が走る。
type Guard = (proceed: () => void) => void;

const Ctx = createContext<{
  registerGuard: (g: Guard | null) => void;
  requestNavigation: (proceed: () => void) => void;
}>({
  registerGuard: () => {},
  requestNavigation: (proceed) => proceed(),
});

export function NavGuardProvider({ children }: { children: ReactNode }) {
  // 現在登録されている guard を ref に持つ。re-render を起こさないため。
  const guardRef = useRef<Guard | null>(null);
  // ガード再登録時の参照同一性確保用
  const [, force] = useState(0);

  const registerGuard = useCallback((g: Guard | null) => {
    guardRef.current = g;
    // 任意の購読者通知用（現状未使用だが安全のため）
    force((n) => n + 1);
  }, []);

  const requestNavigation = useCallback((proceed: () => void) => {
    const g = guardRef.current;
    if (!g) {
      proceed();
      return;
    }
    g(proceed);
  }, []);

  return (
    <Ctx.Provider value={{ registerGuard, requestNavigation }}>
      {children}
    </Ctx.Provider>
  );
}

export function useNavGuard() {
  return useContext(Ctx);
}
