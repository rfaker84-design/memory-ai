"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "首页", icon: "⌂" },
  { href: "/companion", label: "陪伴", icon: "✦" },
  { href: "/memories", label: "记忆", icon: "◐" },
  { href: "/profile", label: "我的", icon: "♡" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-[430px] border-t border-white/10 bg-black/55 backdrop-blur-2xl">
      <div className="grid h-[72px] grid-cols-4 px-3 pb-2 pt-2">
        {tabs.map((tab) => {
          const active =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center rounded-2xl transition ${
                active
                  ? "bg-white/10 text-white shadow-[0_0_28px_rgba(255,255,255,0.08)]"
                  : "text-white/45"
              }`}
            >
              <span className="text-[20px] leading-none">{tab.icon}</span>
              <span className="mt-1 text-[11px] tracking-[0.16em]">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
