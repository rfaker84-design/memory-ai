"use client";

import Link from "next/link";
import { useState } from "react";

const navLinks = [
  { href: "/", label: "首页" },
  { href: "/about", label: "关于我们" },
  { href: "/", label: "进入忆见" },
];

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 right-0 left-0 z-50">
      <nav
        aria-label="主导航"
        className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 lg:px-8"
      >
        <Link
          href="/"
          className="group flex items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-amber-warm to-amber-deep text-sm font-semibold text-warm-white shadow-sm">
            忆
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-base font-semibold tracking-wide text-charcoal">
              忆见
            </span>
            <span className="text-[11px] font-light tracking-[0.2em] text-charcoal-light uppercase">
              MemoryAI
            </span>
          </span>
        </Link>

        <ul className="hidden items-center gap-10 md:flex">
          {navLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-sm font-medium text-charcoal-light transition-colors hover:text-charcoal"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          aria-label={menuOpen ? "关闭菜单" : "打开菜单"}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-charcoal transition-colors hover:bg-cream-dark md:hidden"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            {menuOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </nav>

      {menuOpen && (
        <div
          id="mobile-menu"
          className="border-t border-amber-soft/60 bg-warm-white/95 backdrop-blur-md md:hidden"
        >
          <ul className="flex flex-col px-6 py-4">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="block py-3 text-sm font-medium text-charcoal-light transition-colors hover:text-charcoal"
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}
