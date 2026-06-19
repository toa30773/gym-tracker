"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "設定", href: "/settings" },
  { label: "メニュー", href: "/main" },
  { label: "重量更新頻度", href: "/weight-history" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center justify-center gap-2 py-1 px-4">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-3 py-1 rounded-full text-[10px] font-bold transition-colors ${
              isActive
                ? "bg-white border border-gray-300 text-black shadow-sm"
                : "bg-gray-300 text-black"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
