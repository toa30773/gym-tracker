"use client";

// モジュールレベルのシンプルな未保存ガード。
// React Context を介さないので Provider 配置ミスや SSR/Client 境界の問題に巻き込まれない。
// PWA は実質シングルウィンドウなので、グローバル singleton で十分。

type Guard = (proceed: () => void) => void;

let currentGuard: Guard | null = null;

export function registerGuard(g: Guard | null) {
  currentGuard = g;
}

export function requestNavigation(proceed: () => void) {
  if (currentGuard) {
    currentGuard(proceed);
  } else {
    proceed();
  }
}
