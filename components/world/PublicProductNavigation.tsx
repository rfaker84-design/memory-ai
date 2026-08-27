"use client";

import { useRouter } from "next/navigation";

import styles from "./GuestPublicExperience.module.css";

export type PublicProductTab = "home" | "companion" | "memory" | "account";

const TABS: ReadonlyArray<{ key: PublicProductTab; label: string; path: string }> = [
  { key: "home", label: "首页", path: "/" },
  { key: "companion", label: "相伴", path: "/guest/companion" },
  { key: "memory", label: "拾忆", path: "/guest/memories" },
  { key: "account", label: "我的", path: "/guest/account" },
];

export function PublicProductNavigation({ active, overMedia = false }: { active: PublicProductTab | null; overMedia?: boolean }) {
  const router = useRouter();
  return (
    <nav className={`${styles.publicNavigation} ${overMedia ? styles.publicNavigationOverMedia : ""}`} aria-label="主导航">
      {TABS.map((tab) => {
        const selected = tab.key === active;
        return <button key={tab.key} type="button" onClick={() => router.push(tab.path)} aria-current={selected ? "page" : undefined} className={selected ? styles.navigationActive : undefined}>{tab.label}</button>;
      })}
    </nav>
  );
}
