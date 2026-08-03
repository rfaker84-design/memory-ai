"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Footer from "../../components/Footer";
import { MemoryTheme as T } from "../lib/design-system/memory-theme";

/** Approved first-release navigation: companion, explicitly confirmed memories, and account. */

const TABS = [
  { key:"companion",label:"相伴",path:"/memory-world",icon:(a:boolean)=>(<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={a?T.colors.primary:T.colors.textFaint} strokeWidth={a?1.8:1.3} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>) },
  { key:"memory",label:"拾忆",path:"/memory",icon:(a:boolean)=>(<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={a?T.colors.primary:T.colors.textFaint} strokeWidth={a?1.8:1.3} strokeLinecap="round" strokeLinejoin="round"><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/><circle cx="12" cy="8" r="4"/></svg>) },
  { key:"account",label:"我的",path:"/continuity",icon:(a:boolean)=>(<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={a?T.colors.primary:T.colors.textFaint} strokeWidth={a?1.8:1.3} strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 01-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>) },
];

export default function MobileAppShell({ children }:{ children:React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // The three-tab shell belongs only to its three root destinations. Creation,
  // encounter, companion chat, playback, and memory-detail routes must stay
  // focused and never inherit a second navigation surface.
  const showsRootNavigation = pathname === "/memory" || pathname === "/continuity";
  if (!showsRootNavigation) {
    return <>{children}</>;
  }

  function active(t:typeof TABS[number]):boolean { return t.path==="/"?pathname==="/":pathname.startsWith(t.path); }

  return (
    <div style={{ display:"flex",flexDirection:"column",minHeight:"100dvh",background:T.colors.bg }}>
      <a className="skip-link" href="#main-content">跳至主要内容</a>
      <main id="main-content" tabIndex={-1} style={{ flex:1,paddingBottom:"calc(var(--nav-height,64px) + env(safe-area-inset-bottom,0px) + 12px)",overflowY:"auto",WebkitOverflowScrolling:"touch" }}>{children}</main>
      <Footer />
      <nav aria-label="主导航" style={{
        position:"fixed",bottom:0,left:0,right:0,zIndex:50,
        display:"flex",justifyContent:"space-around",alignItems:"center",
        height:"calc(var(--nav-height,64px) + env(safe-area-inset-bottom,0px))",
        paddingBottom:"env(safe-area-inset-bottom,0px)",
        background:"rgba(246,241,232,0.94)",
        backdropFilter:"blur(22px) saturate(180%)",
        WebkitBackdropFilter:"blur(22px) saturate(180%)",
        borderTop:`0.5px solid ${T.colors.border}`,
        boxShadow:"0 -1px 8px rgba(0,0,0,0.03)",
      }}>
        {TABS.map(t => {
          const a = active(t);
          return (
            <motion.button key={t.key} type="button" onClick={() => router.push(t.path)} aria-current={a ? "page" : undefined} whileTap={{ scale:0.96 }}
              style={{
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,
                background:"none",border:"none",cursor:"pointer",padding:"6px 10px",minWidth:56,minHeight:44,
                WebkitTapHighlightColor:"transparent",position:"relative",
              }}>
              {a && <div style={{ position:"absolute",top:0,width:20,height:3,borderRadius:2,background:T.colors.primary,opacity:0.7 }}/>}
              {t.icon(a)}
              <span style={{ fontSize:10,letterSpacing:"0.06em",color:a?T.colors.primary:T.colors.textFaint,fontWeight:a?600:400 }}>{t.label}</span>
            </motion.button>
          );
        })}
      </nav>
    </div>
  );
}



