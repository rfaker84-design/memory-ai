"use client";

import React from "react";
import { palette, shadow, typography, radius } from "../../../styles/pixel-theme";

/* =========================================================================
   AppIconGuide — Warm golden icon specifications
   ========================================================================= */

const iconBox: React.CSSProperties = {
  width:220,height:220,borderRadius:28,background:palette.background,
  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
  position:"relative",overflow:"hidden",boxShadow:shadow.icon,
};

function PrimaryAppIcon() {
  return (
    <div style={iconBox}>
      <div style={{position:"absolute",width:130,height:130,borderRadius:"50%",border:`1.5px solid ${palette.borderPrimary}`,opacity:0.5}}/>
      <div style={{position:"absolute",width:70,height:70,borderRadius:"50%",background:`radial-gradient(circle,${palette.primaryGlow} 0%,transparent 60%)`,filter:"blur(8px)"}}/>
      <div style={{position:"relative",width:16,height:16,borderRadius:"50%",background:palette.primary,boxShadow:`0 0 24px ${palette.primary}`}}/>
    </div>
  );
}

function LightAppIcon() {
  return (
    <div style={{...iconBox,background:"#F5F2EE"}}>
      <div style={{position:"absolute",width:130,height:130,borderRadius:"50%",border:`1.5px solid rgba(255,179,124,0.3)`,opacity:0.5}}/>
      <div style={{position:"absolute",width:70,height:70,borderRadius:"50%",background:"radial-gradient(circle,rgba(255,179,124,0.12) 0%,transparent 60%)",filter:"blur(8px)"}}/>
      <div style={{position:"relative",width:16,height:16,borderRadius:"50%",background:"#FFB37C",boxShadow:"0 0 20px rgba(255,179,124,0.5)"}}/>
    </div>
  );
}

function MarketingIcon() {
  return (
    <div style={{...iconBox,width:280,height:280}}>
      <div style={{position:"absolute",width:170,height:170,borderRadius:"50%",border:`2px solid ${palette.borderPrimary}`,opacity:0.4}}/>
      <div style={{position:"absolute",width:110,height:110,borderRadius:"50%",border:`1px solid rgba(255,210,166,0.25)`}}/>
      <div style={{position:"absolute",width:55,height:55,borderRadius:"50%",background:`radial-gradient(circle,rgba(255,210,166,0.2) 0%,transparent 60%)`,filter:"blur(6px)"}}/>
      <div style={{position:"relative",width:20,height:20,borderRadius:"50%",background:palette.primary,boxShadow:`0 0 30px ${palette.primary}, 0 0 60px rgba(255,179,124,0.4)`}}/>
      <p style={{position:"absolute",bottom:18,fontSize:10,color:palette.textMuted,letterSpacing:"0.12em",fontWeight:600}}>忆见</p>
    </div>
  );
}

export default function AppIconGuide() {
  return (
    <div style={{padding:32,background:palette.background,minHeight:"100vh",fontFamily:typography.fontFamily}}>
      <h2 style={{...typography.title,color:palette.textPrimary,marginBottom:6}}>App Icon Guide</h2>
      <p style={{fontSize:12,color:palette.textMuted,marginBottom:28}}>三种图标 · 暖金色 · 1024×1024 @ App Store</p>
      <div style={{display:"flex",flexWrap:"wrap",gap:32}}>
        <div style={{textAlign:"center"}}><PrimaryAppIcon/><p style={{fontSize:12,color:palette.textSecondary,marginTop:10}}>主图标 · 暗色</p></div>
        <div style={{textAlign:"center"}}><LightAppIcon/><p style={{fontSize:12,color:palette.textSecondary,marginTop:10}}>备用 · 浅色</p></div>
        <div style={{textAlign:"center"}}><MarketingIcon/><p style={{fontSize:12,color:palette.textSecondary,marginTop:10}}>营销 · Hero</p></div>
      </div>
      <div style={{marginTop:36,padding:18,borderRadius:radius.card,border:`0.5px solid ${palette.border}`,background:palette.surface}}>
        <h3 style={{fontSize:14,fontWeight:600,color:palette.textPrimary,marginBottom:8}}>设计规范</h3>
        <ul style={{fontSize:12,color:palette.textSecondary,lineHeight:1.8,paddingLeft:16,margin:0}}>
          <li>背景：暖暗底 (#0B0A08)，不用冷色调</li>
          <li>图形：暖金光环 + 中心柔光点</li>
          <li>禁用：人脸、文字、3D、复杂图形</li>
          <li>圆角：28px（App Store 标准）</li>
          <li>尺寸：1024×1024px</li>
        </ul>
      </div>
    </div>
  );
}
