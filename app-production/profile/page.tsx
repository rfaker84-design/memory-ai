"use client";

import MobileAppShell from "../../src/components/MobileAppShell";
import { palette } from "../../styles/app-store-theme";

/* =========================================================================
   Production ProfilePage — Static · Pure UI · V1 Production Safe
   ========================================================================= */

const STATUS = [
  { name:"记忆系统", ok:true },
  { name:"AI 聊天", ok:true },
  { name:"语音系统", ok:false },
  { name:"数字人系统", ok:false },
];

export default function ProfilePage() {
  function clearCache(){
    try{Object.keys(localStorage).filter(k=>k.startsWith("yj_")||k.startsWith("yijian_")).forEach(k=>localStorage.removeItem(k));alert("缓存已清理");}catch{alert("清理失败");}
  }

  return (
    <MobileAppShell>
      <div style={{padding:"clamp(20px,5vw,32px) clamp(16px,4vw,24px)",minHeight:"calc(100dvh - 64px - env(safe-area-inset-bottom,0px) - 16px)"}}>
        <h2 style={{fontSize:"clamp(20px,5vw,26px)",fontWeight:700,color:palette.textPrimary,letterSpacing:"-0.01em",marginBottom:4}}>我的</h2>
        <p style={{fontSize:11,color:palette.textMuted,letterSpacing:"0.06em",marginBottom:26}}>V1 Production Safe</p>

        {/* Status */}
        <p style={{fontSize:11,color:palette.textMuted,letterSpacing:"0.08em",marginBottom:8,paddingLeft:4}}>系统状态</p>
        <div style={{borderRadius:18,border:"0.5px solid rgba(255,255,255,0.06)",background:palette.surface,boxShadow:"0 4px 16px rgba(0,0,0,0.3)",padding:"2px 0",marginBottom:20}}>
          {STATUS.map((s,i)=>(
            <div key={s.name} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",borderBottom:i<STATUS.length-1?"0.5px solid rgba(255,255,255,0.04)":"none"}}>
              <span style={{fontSize:14,color:palette.textSecondary}}>{s.name}</span>
              <span style={{fontSize:11,fontWeight:500,color:s.ok?"#7BC67E":palette.textMuted}}>{s.ok?"已接入":"待接入"}</span>
            </div>
          ))}
        </div>

        {/* Settings */}
        <p style={{fontSize:11,color:palette.textMuted,letterSpacing:"0.08em",marginBottom:8,paddingLeft:4}}>设置</p>
        <div style={{borderRadius:18,border:"0.5px solid rgba(255,255,255,0.06)",background:palette.surface,boxShadow:"0 4px 16px rgba(0,0,0,0.3)",padding:"2px 0"}}>
          {[
            {label:"清理缓存",onClick:clearCache},
            {label:"关于",onClick:()=>{}},
            {label:"隐私协议",onClick:()=>{}},
          ].map((item,i)=>(
            <div key={item.label} onClick={item.onClick} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",borderBottom:i<2?"0.5px solid rgba(255,255,255,0.04)":"none",cursor:"pointer"}}>
              <span style={{fontSize:14,color:palette.textSecondary}}>{item.label}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={palette.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          ))}
        </div>

        <div style={{marginTop:36,textAlign:"center",fontSize:11,color:"rgba(168,158,144,0.18)",letterSpacing:"0.07em",lineHeight:1.8}}>
          忆见 MemoryAI<br/>V1 Production Safe
        </div>
      </div>
    </MobileAppShell>
  );
}
