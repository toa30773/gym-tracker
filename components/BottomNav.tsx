"use client";

import { usePathname, useRouter } from "next/navigation";
import { requestNavigation } from "@/lib/nav-guard";

const tabs = [
  { label: "設定", href: "/settings" },
  { label: "メニュー", href: "/main" },
  { label: "重量推移", href: "/weight-history" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  function handleClick(href: string) {
    if (href === pathname) return;
    requestNavigation(() => router.push(href));
  }

  const isSpecActive = pathname === "/spec";

  return (
    <nav
      className="flex items-center justify-around gap-2 px-3 pt-2 bg-white border-t border-gray-200"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
    >
      <button
        type="button"
        onClick={() => handleClick("/spec")}
        aria-label="仕様書"
        title="仕様書 / 使い方"
        className={`w-9 h-9 flex items-center justify-center rounded-full text-xs font-bold transition-colors flex-shrink-0 ${
          isSpecActive
            ? "bg-gray-800 text-white"
            : "bg-gray-300 text-gray-600"
        }`}
      >
        ●
      </button>
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <button
            key={tab.href}
            type="button"
            onClick={() => handleClick(tab.href)}
            className={`flex-1 text-center px-3 py-2.5 rounded-full text-xs font-bold transition-colors ${
              isActive
                ? "bg-gray-800 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
