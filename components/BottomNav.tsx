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

  return (
    <nav
      className="flex items-center justify-around gap-2 px-3 pt-2 bg-white border-t border-gray-200"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
    >
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
