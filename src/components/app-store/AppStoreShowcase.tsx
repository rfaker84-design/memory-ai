"use client";

import React from "react";
import { motion } from "framer-motion";
import { palette, gradient, typography, radius, shadow, motion as m, screenshot } from "../../../styles/pixel-theme";

/* =========================================================================
   AppStoreShowcase — 6 warm emotional screens for App Store submission
   Each screen: self-contained · 390×844 · capture at 3× for App Store
   ========================================================================= */

const VP = screenshot.iphonePro;

function Screen({ children, style }: { children:React.ReactNode; style?:React.CSSProperties }) {
  return (
    <div style={{
      width:VP.width, height:VP.height, background:palette.background,
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      textAlign:"center",position:"relative",overflow:"hidden",
      fontFamily:typography.fontFamily,padding:"32px 24px",
      ...style,
    }}>{children}</div>
  );
}

/* ── Warm Halo (reusable) ───────────────────────────────── */
function WarmHalo({ size=110, opacity=0.7 }: { size?:number; opacity?:number }) {
  return (
    <motion.div
      animate={{ opacity:[opacity,1,opacity], scale:[1,1.035,1] }}
      transition={{ duration:8, repeat:Infinity, ease:"easeInOut" }}
      style={{
        width:size,height:size,borderRadius:"50%",
        border:`1.5px solid ${palette.borderPrimary}`,
        background:gradient.halo,
        boxShadow:shadow.glow,
      }}
    />
  );
}

/* ── Ambient glow background ────────────────────────────── */
function AmbientGlow() {
  return (
    <div style={{position:"absolute",top:"25%",left:"50%",transform:"translate(-50%,-50%)",width:240,height:240,borderRadius:"50%",background:gradient.ambient,filter:"blur(50px)",opacity:0.5}}/>
  );
}

/* ========================================================================
   Screen 01 — Emotion Hook
   "有些人离开了，但你从未真正放下"
   ======================================================================== */
export function Screen01Emotion() {
  return (
    <Screen>
      <AmbientGlow/>
      <WarmHalo size={100} opacity={0.5}/>
      <motion.div {...m.fadeIn} style={{marginTop:40}}>
        <p style={{...typography.emotion,color:palette.textPrimary,maxWidth:280,lineHeight:1.5}}>
          有些人离开了，
        </p>
        <p style={{...typography.emotion,color:palette.textSecondary,maxWidth:280,lineHeight:1.5,marginTop:12}}>
          但你从未真正放下
        </p>
      </motion.div>
      <div style={{position:"absolute",bottom:48}}>
        <p style={{fontSize:13,color:palette.primary,letterSpacing:"0.12em",fontWeight:600}}>忆见</p>
      </div>
    </Screen>
  );
}

/* ========================================================================
   Screen 02 — Product Core
   "让思念，被温柔记录"
   ======================================================================== */
export function Screen02Product() {
  return (
    <Screen>
      <AmbientGlow/>
      {/* Logo */}
      <div style={{marginBottom:28}}>
        <h1 style={{...typography.hero,color:palette.textPrimary,margin:0,textShadow:`0 0 45px ${palette.primaryGlow}`}}>忆见</h1>
        <p style={{fontSize:"clamp(13px,3.5vw,15px)",color:palette.textMuted,letterSpacing:"0.1em",marginTop:6}}>让思念，被温柔记录</p>
      </div>
      <WarmHalo size={100}/>
      {/* Buttons */}
      <div style={{marginTop:36,width:"100%",maxWidth:270}}>
        <div style={{width:"100%",height:50,borderRadius:radius.button,border:`0.5px solid ${palette.borderPrimary}`,background:palette.primarySoft,color:palette.primary,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:600,marginBottom:10,boxShadow:shadow.glow}}>创建记忆</div>
        <div style={{width:"100%",height:50,borderRadius:radius.button,border:`0.5px solid ${palette.border}`,background:"rgba(255,255,255,0.025)",color:palette.textSecondary,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:500}}>进入聊天</div>
      </div>
      <p style={{fontSize:11,color:palette.textMuted,marginTop:22,letterSpacing:"0.06em"}}>手机号即身份 · 无需注册</p>
    </Screen>
  );
}

/* ========================================================================
   Screen 03 — AI Chat
   "你可以再次和他们对话"
   ======================================================================== */
export function Screen03Chat() {
  return (
    <Screen style={{justifyContent:"flex-end",padding:0,gap:0}}>
      {/* Header */}
      <div style={{width:"100%",padding:"14px 18px",borderBottom:`0.5px solid ${palette.border}`,display:"flex",alignItems:"center",gap:10,background:"rgba(11,10,8,0.90)",backdropFilter:"blur(14px)"}}>
        <div style={{width:32,height:32,borderRadius:"50%",background:palette.primarySoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:palette.primary}}>母</div>
        <span style={{fontSize:15,fontWeight:600,color:palette.textPrimary}}>母亲</span>
      </div>
      {/* Messages */}
      <div style={{flex:1,width:"100%",padding:"18px 14px",display:"flex",flexDirection:"column",gap:12}}>
        <div style={{alignSelf:"flex-start",maxWidth:"78%",padding:"12px 16px",borderRadius:"18px 18px 18px 4px",background:palette.surface,border:`0.5px solid ${palette.border}`,fontSize:14,color:palette.textSecondary,lineHeight:1.7}}>孩子，最近过得好吗？我一直都在你身边。</div>
        <div style={{alignSelf:"flex-end",maxWidth:"78%",padding:"12px 16px",borderRadius:"18px 18px 4px 18px",background:palette.primarySoft,border:`0.5px solid ${palette.borderPrimary}`,fontSize:14,color:palette.primary,lineHeight:1.7}}>妈，今天特别想你</div>
        <div style={{alignSelf:"flex-start",maxWidth:"78%",padding:"12px 16px",borderRadius:"18px 18px 18px 4px",background:palette.surface,border:`0.5px solid ${palette.border}`,fontSize:14,color:palette.textSecondary,lineHeight:1.7}}>我也在想你。你看，窗外的阳光多好。</div>
      </div>
      {/* Static voice waveform */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:3,padding:"4px 0 12px"}}>
        {[3,6,10,8,12,7,9,5,4].map((h,i)=><div key={i} style={{width:3,height:h,background:palette.primarySoft,borderRadius:2}}/>)}
      </div>
      {/* Input */}
      <div style={{width:"100%",padding:"10px 14px",borderTop:`0.5px solid ${palette.border}`}}>
        <div style={{width:"100%",height:44,borderRadius:22,border:`0.5px solid ${palette.border}`,background:palette.surface,display:"flex",alignItems:"center",padding:"0 16px",fontSize:14,color:palette.textMuted}}>输入消息...</div>
      </div>
      <p style={{position:"absolute",top:14,fontSize:18,color:palette.primary,fontWeight:600,letterSpacing:"0.03em"}}>你可以再次和他们对话</p>
    </Screen>
  );
}

/* ========================================================================
   Screen 04 — Memory System
   "每一段关系，都被保存"
   ======================================================================== */
export function Screen04Memories() {
  const cards = [
    { name:"母亲",rel:"家人",initial:"母"},
    { name:"父亲",rel:"家人",initial:"父"},
    { name:"外婆",rel:"祖辈",initial:"婆"},
    { name:"挚友",rel:"朋友",initial:"友"},
  ];
  return (
    <Screen>
      <div style={{width:"100%",textAlign:"left",marginBottom:18}}>
        <h2 style={{...typography.title,color:palette.textPrimary,margin:0}}>记忆体</h2>
        <p style={{fontSize:12,color:palette.textMuted,marginTop:4}}>{cards.length} 个记忆</p>
      </div>
      <div style={{width:"100%",display:"flex",flexDirection:"column",gap:10}}>
        {cards.map((c,i)=>(
          <div key={i} style={{borderRadius:radius.card,border:`0.5px solid ${palette.border}`,background:palette.surface,boxShadow:shadow.card,padding:"14px 16px",display:"flex",alignItems:"center",gap:14,backdropFilter:"blur(8px)"}}>
            <div style={{width:42,height:42,borderRadius:"50%",background:palette.primarySoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:700,color:palette.primary,flexShrink:0}}>{c.initial}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:15,fontWeight:600,color:palette.textPrimary}}>{c.name}</div>
              <div style={{fontSize:12,color:palette.textMuted}}>{c.rel}</div>
            </div>
          </div>
        ))}
      </div>
      <p style={{position:"absolute",bottom:28,fontSize:19,color:palette.primary,fontWeight:600,letterSpacing:"0.02em"}}>每一段关系，都被保存</p>
    </Screen>
  );
}

/* ========================================================================
   Screen 05 — Digital Presence
   "他们从未真正离开"
   ======================================================================== */
export function Screen05Presence() {
  return (
    <Screen>
      <AmbientGlow/>
      {/* Abstract figure — warm rings, no uncanny valley */}
      <div style={{position:"relative",width:170,height:210,display:"flex",alignItems:"center",justifyContent:"center"}}>
        {/* Head — soft ring */}
        <motion.div animate={{opacity:[0.4,0.7,0.4]}} transition={{duration:6,repeat:Infinity}}
          style={{position:"absolute",top:24,width:88,height:88,borderRadius:"50%",border:`1px solid ${palette.borderPrimary}`,opacity:0.5}}/>
        {/* Shoulders — gentle arc */}
        <div style={{position:"absolute",top:100,width:120,height:70,borderRadius:"50% 50% 0 0",border:`1px solid ${palette.border}`,opacity:0.3,borderBottom:"none"}}/>
        {/* Heart glow — center */}
        <motion.div animate={{opacity:[0.3,0.6,0.3]}} transition={{duration:5,repeat:Infinity}}
          style={{position:"absolute",top:55,width:30,height:30,borderRadius:"50%",background:`radial-gradient(circle,${palette.primaryGlow} 0%,transparent 60%)`,filter:"blur(4px)"}}/>
        {/* Ambient behind */}
        <div style={{position:"absolute",width:180,height:180,borderRadius:"50%",background:gradient.ambient,filter:"blur(40px)"}}/>
      </div>
      <motion.p {...m.fadeIn} style={{marginTop:28,...typography.emotion,color:palette.textPrimary,lineHeight:1.5}}>
        他们从未真正离开
      </motion.p>
      <p style={{position:"absolute",bottom:32,fontSize:11,color:palette.textMuted,letterSpacing:"0.08em"}}>
        Memory is not gone.<br/>It is transformed.
      </p>
    </Screen>
  );
}

/* ========================================================================
   Screen 06 — Brand Closing
   "忆见 · Memory is not gone. It is transformed."
   ======================================================================== */
export function Screen06Brand() {
  return (
    <Screen style={{background:"#080706"}}>
      <WarmHalo size={130} opacity={0.6}/>
      <motion.div {...m.fadeIn} style={{marginTop:32}}>
        <h1 style={{...typography.hero,color:palette.textPrimary,margin:0,textShadow:`0 0 50px ${palette.primaryGlow}`}}>忆见</h1>
        <p style={{fontSize:"clamp(13px,3.5vw,15px)",color:palette.accent,letterSpacing:"0.1em",marginTop:12,fontWeight:500}}>让思念，被温柔记录</p>
      </motion.div>
      <p style={{position:"absolute",bottom:36,fontSize:11,color:palette.textMuted,letterSpacing:"0.07em",textAlign:"center",lineHeight:1.8}}>
        Memory is not gone.<br/>It is transformed.
      </p>
      <div style={{position:"absolute",bottom:100,width:40,height:40,borderRadius:"50%",border:`1px solid ${palette.primarySoft}`}}/>
    </Screen>
  );
}

/* ========================================================================
   Export — Full Showcase
   ======================================================================== */
export const AppStoreScreens = [
  Screen01Emotion,
  Screen02Product,
  Screen03Chat,
  Screen04Memories,
  Screen05Presence,
  Screen06Brand,
];

export default function AppStoreShowcase() {
  return (
    <div style={{display:"flex",flexDirection:"column",gap:0,background:palette.background}}>
      <Screen01Emotion/>
      <Screen02Product/>
      <Screen03Chat/>
      <Screen04Memories/>
      <Screen05Presence/>
      <Screen06Brand/>
    </div>
  );
}
