"use client";

import React from "react";
import { motion } from "framer-motion";
import { palette, typography, radius, shadow, motion as m } from "../../../styles/app-store-design-system";

/* =========================================================================
   AppStoreScreens — 6 static screenshot layout components
   Each designed at 390×844 (iPhone 14 Pro viewport) — capture at 3× scale
   ========================================================================= */

const VP = { width: 390, height: 844 };

const wrapperStyle: React.CSSProperties = {
  width: VP.width, height: VP.height,
  background: palette.background,
  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
  textAlign:"center",padding:"40px 28px",
  position:"relative",overflow:"hidden",
  fontFamily: typography.fontFamily,
};

/* ── Memory Halo (reusable) ─────────────────────────────── */
function MemoryHalo({ size=100, opacity=0.7 }: { size?:number; opacity?:number }) {
  return (
    <motion.div
      animate={{ opacity:[opacity,1,opacity], scale:[1,1.03,1] }}
      transition={{ duration:7, repeat:Infinity, ease:"easeInOut" }}
      style={{
        width:size,height:size,borderRadius:"50%",
        border:`1.5px solid ${palette.borderPrimary}`,
        background:`radial-gradient(circle,${palette.primaryGlow} 0%,transparent 70%)`,
        boxShadow:`0 0 50px ${palette.primaryGlow},inset 0 0 40px rgba(109,124,255,0.02)`,
      }}
    />
  );
}

/* ── Brand logo text ────────────────────────────────────── */
function BrandLogo({ size="hero" }: { size?:"hero"|"small" }) {
  const s = size==="hero"?typography.hero:{fontSize:24,fontWeight:700,letterSpacing:"0.06em",lineHeight:1.2};
  return <h1 style={{...s,color:palette.textPrimary,margin:0,textShadow:`0 0 40px ${palette.primaryGlow}`}}>忆见</h1>;
}

/* ========================================================================
   Screen 1 — Emotion Hook
   ======================================================================== */
export function Screen1EmotionHook() {
  return (
    <div style={wrapperStyle}>
      <div style={{position:"absolute",top:"30%",left:"50%",transform:"translate(-50%,-50%)",width:200,height:200,borderRadius:"50%",background:`radial-gradient(circle,${palette.primaryGlow} 0%,transparent 60%)`,filter:"blur(40px)",opacity:0.5}}/>
      <MemoryHalo size={90} opacity={0.55}/>
      <div style={{marginTop:36}}>
        <p style={{...typography.screenshotEmotion,color:palette.textPrimary,maxWidth:300,lineHeight:1.45}}>
          有些人离开了，
        </p>
        <p style={{...typography.screenshotEmotion,color:palette.textSecondary,maxWidth:300,lineHeight:1.45,marginTop:8}}>
          但你从未真正放下
        </p>
      </div>
      <BrandLogo size="small"/>
      <p style={{fontSize:12,color:palette.textMuted,marginTop:6,letterSpacing:"0.1em"}}>让思念，被温柔记录</p>
    </div>
  );
}

/* ========================================================================
   Screen 2 — Product Core
   ======================================================================== */
export function Screen2ProductCore() {
  return (
    <div style={wrapperStyle}>
      <div style={{marginBottom:24}}>
        <BrandLogo size="hero"/>
        <p style={{fontSize:"clamp(13px,3vw,15px)",color:palette.textMuted,letterSpacing:"0.1em",marginTop:6}}>让思念，被温柔记录</p>
      </div>
      <MemoryHalo size={100} opacity={0.7}/>
      <div style={{marginTop:30,width:"100%",maxWidth:280}}>
        <div style={{width:"100%",height:48,borderRadius:radius.button,border:`0.5px solid ${palette.borderPrimary}`,background:palette.primarySoft,color:palette.primary,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:600,marginBottom:10}}>创建记忆</div>
        <div style={{width:"100%",height:48,borderRadius:radius.button,border:`0.5px solid ${palette.border}`,background:"rgba(255,255,255,0.025)",color:palette.textSecondary,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:500}}>进入聊天</div>
      </div>
      <p style={{fontSize:11,color:palette.textMuted,marginTop:20,letterSpacing:"0.06em"}}>手机号即身份 · 无需注册</p>
    </div>
  );
}

/* ========================================================================
   Screen 3 — AI Chat
   ======================================================================== */
export function Screen3AIChat() {
  return (
    <div style={{...wrapperStyle,justifyContent:"flex-end",padding:"0",gap:0}}>
      {/* Chat header */}
      <div style={{width:"100%",padding:"12px 16px",borderBottom:`0.5px solid ${palette.border}`,display:"flex",alignItems:"center",gap:10,background:"rgba(10,12,16,0.88)",backdropFilter:"blur(14px)"}}>
        <div style={{width:30,height:30,borderRadius:"50%",background:palette.primarySoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:palette.primary}}>M</div>
        <span style={{fontSize:15,fontWeight:600,color:palette.textPrimary}}>母亲</span>
      </div>
      {/* Messages */}
      <div style={{flex:1,width:"100%",padding:"16px 14px",display:"flex",flexDirection:"column",gap:10,overflow:"hidden"}}>
        <div style={{alignSelf:"flex-start",maxWidth:"78%",padding:"11px 15px",borderRadius:"18px 18px 18px 4px",background:palette.surface,border:`0.5px solid ${palette.border}`,fontSize:14,color:palette.textSecondary,lineHeight:1.65}}>这是 AI 纪念陪伴内容；想念时可以慢慢说。</div>
        <div style={{alignSelf:"flex-end",maxWidth:"78%",padding:"11px 15px",borderRadius:"18px 18px 4px 18px",background:palette.primarySoft,border:`0.5px solid ${palette.borderPrimary}`,fontSize:14,color:palette.primary,lineHeight:1.65}}>妈，我想你了。</div>
      </div>
      {/* Input */}
      <div style={{width:"100%",padding:"10px 14px",borderTop:`0.5px solid ${palette.border}`}}>
        <div style={{width:"100%",height:42,borderRadius:21,border:`0.5px solid ${palette.border}`,background:palette.surface,display:"flex",alignItems:"center",padding:"0 16px",fontSize:14,color:palette.textMuted}}>输入消息...</div>
      </div>
      {/* Footer text */}
      <p style={{position:"absolute",bottom:20,fontSize:14,color:palette.primary,fontWeight:600,letterSpacing:"0.03em"}}>AI生成 · 基于已确认资料</p>
    </div>
  );
}

/* ========================================================================
   Screen 4 — Memory System
   ======================================================================== */
export function Screen4MemorySystem() {
  const cards = [
    { name:"母亲", rel:"家人", initial:"M" },
    { name:"父亲", rel:"家人", initial:"F" },
    { name:"爷爷", rel:"祖辈", initial:"Y" },
  ];
  return (
    <div style={wrapperStyle}>
      <div style={{width:"100%",textAlign:"left",marginBottom:16}}>
        <h2 style={{...typography.title,color:palette.textPrimary,margin:0}}>记忆体</h2>
        <p style={{fontSize:12,color:palette.textMuted,marginTop:4}}>3 个记忆</p>
      </div>
      <div style={{width:"100%",display:"flex",flexDirection:"column",gap:10}}>
        {cards.map((c,i)=>(
          <div key={i} style={{borderRadius:radius.card,border:`0.5px solid ${palette.border}`,background:palette.surface,boxShadow:shadow.card,padding:"14px 16px",display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:40,height:40,borderRadius:"50%",background:palette.primarySoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:palette.primary,flexShrink:0}}>{c.initial}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:15,fontWeight:600,color:palette.textPrimary}}>{c.name}</div>
              <div style={{fontSize:12,color:palette.textMuted}}>{c.rel}</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={palette.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        ))}
      </div>
      <p style={{position:"absolute",bottom:28,fontSize:20,color:palette.primary,fontWeight:600,letterSpacing:"0.02em"}}>每一段关系，都被保存</p>
    </div>
  );
}

/* ========================================================================
   Screen 5 — Digital Presence
   ======================================================================== */
export function Screen5DigitalPresence() {
  return (
    <div style={wrapperStyle}>
      {/* Soft figure silhouette — abstract rings */}
      <div style={{position:"relative",width:160,height:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
        {/* Head ring */}
        <div style={{position:"absolute",top:20,width:80,height:80,borderRadius:"50%",border:`1px solid ${palette.borderPrimary}`,opacity:0.5}}/>
        {/* Body suggestion */}
        <div style={{position:"absolute",top:90,width:100,height:80,borderRadius:"50% 50% 0 0",border:`1px solid ${palette.border}`,opacity:0.3,borderBottom:"none"}}/>
        {/* Glow behind */}
        <div style={{position:"absolute",width:160,height:160,borderRadius:"50%",background:`radial-gradient(circle,${palette.primaryGlow} 0%,transparent 65%)`,filter:"blur(30px)"}}/>
      </div>
      <div style={{marginTop:24}}>
        <p style={{...typography.screenshotEmotion,color:palette.textPrimary,lineHeight:1.45}}>思念可以被温柔记录</p>
      </div>
      <div style={{marginTop:16,width:60,height:60,borderRadius:"50%",border:`1px solid ${palette.primarySoft}`,background:`radial-gradient(circle,${palette.primaryGlow} 0%,transparent 60%)`}}/>
      <p style={{position:"absolute",bottom:28,fontSize:11,color:palette.textMuted,letterSpacing:"0.08em"}}>AI memorial companionship · Confirmed materials only.</p>
    </div>
  );
}

/* ========================================================================
   Screen 6 — Brand Closing
   ======================================================================== */
export function Screen6BrandClosing() {
  return (
    <div style={{...wrapperStyle,background:"#060810"}}>
      <MemoryHalo size={120} opacity={0.65}/>
      <div style={{marginTop:28}}>
        <BrandLogo size="hero"/>
      </div>
      <p style={{fontSize:"clamp(13px,3.5vw,15px)",color:palette.primary,letterSpacing:"0.08em",marginTop:10,fontWeight:500}}>让思念，被温柔记录</p>
      <p style={{fontSize:11,color:palette.textMuted,marginTop:12,letterSpacing:"0.06em",position:"absolute",bottom:32}}>
        AI memorial companionship<br/>Confirmed materials only.
      </p>
    </div>
  );
}

/* ========================================================================
   Unified Screens Export
   ======================================================================== */
export default function AppStoreScreens() {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:0}}>
      <Screen1EmotionHook/>
      <Screen2ProductCore/>
      <Screen3AIChat/>
      <Screen4MemorySystem/>
      <Screen5DigitalPresence/>
      <Screen6BrandClosing/>
    </div>
  );
}
