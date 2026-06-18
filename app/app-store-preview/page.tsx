"use client";

import AppStoreShowcase from "../../src/components/app-store/AppStoreShowcase";
import AppIconGuide from "../../src/components/app-store/AppIconGuide";
import { palette } from "../../styles/pixel-theme";

/* =========================================================================
   /app-store-preview — Warm theme App Store preview
   ========================================================================= */

export default function AppStorePreviewPage() {
  return (
    <div style={{background:palette.background,minHeight:"100vh"}}>
      <div style={{padding:"14px 20px",borderBottom:`0.5px solid ${palette.border}`,background:"rgba(11,10,8,0.92)",backdropFilter:"blur(14px)",position:"sticky",top:0,zIndex:10}}>
        <h1 style={{fontSize:18,fontWeight:700,color:palette.textPrimary,margin:0}}>App Store Preview</h1>
        <p style={{fontSize:12,color:palette.textMuted,margin:"2px 0 0"}}>6 Screenshots · Warm Golden Theme</p>
      </div>
      <AppStoreShowcase/>
      <div style={{padding:"32px 0",background:palette.background}}>
        <AppIconGuide/>
      </div>
    </div>
  );
}
