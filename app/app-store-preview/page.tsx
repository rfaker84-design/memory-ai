import { notFound } from "next/navigation";
import AppStoreShowcase from "../../src/components/app-store/AppStoreShowcase";
import AppIconGuide from "../../src/components/app-store/AppIconGuide";
import { palette } from "../../styles/pixel-theme";

/* =========================================================================
   /app-store-preview — Warm theme App Store preview
   ========================================================================= */

export default function AppStorePreviewPage() {
  // Store artwork is an internal review asset.  It is not a public product
  // surface and must never expose its historical copy in a deployed runtime.
  if (process.env.NODE_ENV === "production" || process.env.APP_STORE_PREVIEW_MODE !== "true") notFound();

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
