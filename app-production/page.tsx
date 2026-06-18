"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MobileAppShell from "../src/components/MobileAppShell";
import { palette } from "../styles/app-store-theme";
import { FEATURES } from "../src/lib/feature-flags";

/* =========================================================================
   Production HomePage — Stable · Zero AI · Warm theme
   ========================================================================= */

type Memory = { id:string; name:string; relationship:string|null };

const MOCK_MEMORIES: Memory[] = [
  { id:"mock-1", name:"母亲", relationship:"家人" },
  { id:"mock-2", name:"父亲", relationship:"家人" },
  { id:"mock-3", name:"外婆", relationship:"祖辈" },
];

export default function HomePage() {
  const router = useRouter();
  const [memories, setMemories] = useState<Memory[]>(MOCK_MEMORIES);

  /* Try Supabase in background, fallback to mock silently */
  useEffect(() => {
    if (!FEATURES.supabaseMemories) return;
    let c = false;
    async function load() {
      try {
        const p = localStorage.getItem("yj_phone") || localStorage.getItem("yijian_phone") || "";
        const r = await fetch("/api/memories-mvp?phone=" + encodeURIComponent(p));
        if (r.ok && !c) {
          const data = await r.json();
          if (Array.isArray(data) && data.length > 0) setMemories(data.slice(0, 3));
        }
      } catch { /* keep mock data */ }
    }
    load();
    return () => { c = true; };
  }, []);

  return (
    <MobileAppShell>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"calc(100dvh - 64px - env(safe-area-inset-bottom,0px) - 16px)",padding:"clamp(20px,5vw,36px) clamp(20px,5vw,28px)",textAlign:"center"}}>
        <div style={{position:"absolute",top:"28%",left:"50%",transform:"translate(-50%,-50%)",width:220,height:220,borderRadius:"50%",background:"radial-gradient(ellipse at 50% 35%, rgba(255,179,124,0.06) 0%, transparent 60%)",filter:"blur(60px)",opacity:0.45}}/>

        <div style={{marginBottom:"clamp(24px,5vh,38px)",position:"relative"}}>
          <h1 style={{fontSize:"clamp(38px,11vw,54px)",fontWeight:800,color:palette.textPrimary,letterSpacing:"0.06em",lineHeight:1.15,margin:0,textShadow:"0 0 45px rgba(255,179,124,0.1)"}}>忆见</h1>
          <p style={{fontSize:"clamp(13px,3.5vw,15px)",color:palette.textMuted,letterSpacing:"0.1em",marginTop:6}}>让思念，被温柔记录</p>
        </div>

        {/* Warm Halo */}
        <div style={{width:"min(110px,26vw)",height:"min(110px,26vw)",borderRadius:"50%",border:"1.5px solid rgba(255,179,124,0.22)",background:"radial-gradient(circle,rgba(255,179,124,0.1) 0%,transparent 70%)",boxShadow:"0 0 50px rgba(255,179,124,0.08)",marginBottom:"clamp(28px,6vh,44px)",animation:"breathe 8s ease-in-out infinite"}}/>

        {/* CTA Buttons */}
        <div style={{width:"100%",maxWidth:280,marginBottom:12}}>
          <button onClick={()=>router.push("/create-memory")} style={{width:"100%",minHeight:50,borderRadius:14,border:"0.5px solid rgba(255,179,124,0.22)",background:"rgba(255,179,124,0.12)",color:palette.primary,fontSize:15,fontWeight:600,letterSpacing:"0.04em",cursor:"pointer",boxShadow:"0 0 30px rgba(255,179,124,0.06)"}}>创建记忆</button>
        </div>
        <div style={{width:"100%",maxWidth:280,marginBottom:"clamp(24px,5vh,36px)"}}>
          <button onClick={()=>router.push("/chat")} style={{width:"100%",minHeight:50,borderRadius:14,border:"0.5px solid rgba(255,255,255,0.06)",background:"rgba(255,255,255,0.025)",color:palette.textSecondary,fontSize:15,fontWeight:500,letterSpacing:"0.03em",cursor:"pointer"}}>进入聊天</button>
        </div>

        {/* Recent memories */}
        <div style={{width:"100%",maxWidth:320}}>
          <p style={{fontSize:11,color:palette.textMuted,letterSpacing:"0.08em",marginBottom:8,textAlign:"left",paddingLeft:4}}>最近记忆</p>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {memories.map(m=>(
              <div key={m.id} onClick={()=>router.push("/chat?id="+m.id)} style={{borderRadius:18,border:"0.5px solid rgba(255,255,255,0.06)",background:palette.surface,boxShadow:"0 4px 16px rgba(0,0,0,0.3)",padding:"14px 16px",display:"flex",alignItems:"center",gap:12,cursor:"pointer",backdropFilter:"blur(8px)"}}>
                <div style={{width:34,height:34,borderRadius:"50%",background:"rgba(255,179,124,0.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:palette.primary,flexShrink:0}}>{m.name.charAt(0)}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:600,color:palette.textPrimary}}>{m.name}</div>
                  {m.relationship && <div style={{fontSize:11,color:palette.textMuted,marginTop:1}}>{m.relationship}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
        <p style={{marginTop:"clamp(18px,4vh,28px)",fontSize:11,color:palette.textMuted,letterSpacing:"0.06em"}}>手机号即身份 · 无需注册</p>
      </div>
    </MobileAppShell>
  );
}
