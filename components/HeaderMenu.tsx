"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { requestNavigation } from "@/lib/nav-guard";

const tabs = [
  { label: "設定", href: "/settings" },
  { label: "メニュー", href: "/main" },
  { label: "重量推移", href: "/weight-history" },
];

export default function HeaderMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // 別ページに遷移したら必ず閉じる（戻ってきた時に開いたまま、を防ぐ）
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function handleNav(href: string) {
    setOpen(false);
    if (href === pathname) return;
    requestNavigation(() => router.push(href));
  }

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-label="メニューを開く"
        aria-expanded={open}
        className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-200 text-gray-700 active:bg-gray-300"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <rect x="2" y="3.5" width="14" height="2" rx="1" fill="currentColor" />
          <rect x="2" y="8" width="14" height="2" rx="1" fill="currentColor" />
          <rect x="2" y="12.5" width="14" height="2" rx="1" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 z-50 w-40 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
          >
            {tabs.map((tab) => {
              const isActive = pathname === tab.href;
              return (
                <button
                  key={tab.href}
                  type="button"
                  role="menuitem"
                  onClick={() => handleNav(tab.href)}
                  className={`w-full text-left px-4 py-2.5 text-sm font-bold transition-colors ${
                    isActive
                      ? "bg-gray-800 text-white"
                      : "bg-white text-gray-700 active:bg-gray-100"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
            <div className="h-px bg-gray-200" />
            <button
              type="button"
              role="menuitem"
              onClick={() => handleNav("/spec")}
              className={`w-full text-left px-4 py-2.5 text-sm font-bold transition-colors ${
                pathname === "/spec"
                  ? "bg-gray-800 text-white"
                  : "bg-white text-gray-700 active:bg-gray-100"
              }`}
            >
              ? 仕様書
            </button>
          </div>
        </>
      )}
    </div>
  );
}
