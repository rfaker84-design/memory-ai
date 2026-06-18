"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MobileAppShell from "../../src/components/MobileAppShell";
import { palette } from "../../styles/app-store-theme";
import { FEATURES } from "../../src/lib/feature-flags";

/* =========================================================================
   Production MemoriesPage — Mock-first · Supabase fallback · Resilient
   ========================================================================= */

type Memory = { id:string; name:string; relationship:string|null; life_story:string|null };

const MOCK_MEMORIES: Memory[] = [
  { id:"m1", name:"母亲", relationship:"家人", life_story:"温柔善良，一辈子为家庭付出。" },
  { id:"m2", name:"父亲", relationship:"家人", life_story:"沉默寡言，却用行动爱着每一个人。" },
  { id:"m3", name:"外婆", relationship:"祖辈", life_story:"会讲很多故事，家里永远有热汤。" },
  { id:"m4", name:"挚友", relationship:"朋友", life_story:"一起走过青春，笑声从未停过。" },
];

export default function MemoriesPage() {
  const router = useRouter();
  const [memories, setMemories] = useState<Memory[]>(MOCK_MEMORIES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!FEATURES.supabaseMemories) return;
    let c = false;
    setLoading(true);
    async function load(){
      try{
        const p=localStorage.getItem("yj_phone")||localStorage.getItem("yijian_phone")||"";
        const r=await fetch("/api/memories-mvp?phone="+encodeURIComponent(p));
        if(!r.ok)throw new Error("API error");
        if(!c){const d=await r.json();if(Array.isArray(d)&&d.length>0)setMemories(d);}
      }catch{if(!c)setError(true)}finally{if(!c)setLoading(false)}
    }
    load(); return ()=>{c=true};
  },[]);

  return (
    <MobileAppShell>
      <div style={{padding:"clamp(20px,5vw,32px) clamp(16px,4vw,24px)",minHeight:"calc(100dvh - 64px - env(safe-area-inset-bottom,0px) - 16px)"}}>
        <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:20}}>
          <div>
            <h2 style={{fontSize:"clamp(20px,5vw,26px)",fontWeight:700,color:palette.textPrimary,margin:0}}>记忆体</h2>
            <p style={{fontSize:12,color:palette.textMuted,marginTop:3}}>{memories.length} 个记忆</p>
          </div>
        </div>

        {loading && <div style={{display:"flex",justifyContent:"center",paddingTop:80}}><div style={{width:26,height:26,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.06)",borderTopColor:palette.primary,animation:"spin-ring 0.7s linear infinite"}}/></div>}

        {!loading && error && <div style={{textAlign:"center",paddingTop:80}}>
          <p style={{fontSize:14,color:palette.textMuted,marginBottom:8}}>使用本地数据</p>
          <p style={{fontSize:12,color:palette.textMuted}}>网络连接异常，已切换到离线模式</p>
        </div>}

        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {memories.map(m=>(
            <div key={m.id} onClick={()=>router.push("/chat?id="+m.id)} style={{borderRadius:18,border:"0.5px solid rgba(255,255,255,0.06)",background:palette.surface,boxShadow:"0 4px 16px rgba(0,0,0,0.3)",padding:"14px 16px",display:"flex",alignItems:"center",gap:14,cursor:"pointer",backdropFilter:"blur(8px)"}}>
              <div style={{width:42,height:42,borderRadius:"50%",background:"rgba(255,179,124,0.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:700,color:palette.primary,flexShrink:0}}>{m.name.charAt(0)}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:15,fontWeight:600,color:palette.textPrimary,marginBottom:2}}>{m.name}</div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  {m.relationship && <span style={{fontSize:12,color:palette.textMuted}}>{m.relationship}</span>}
                  {m.life_story && <><span style={{color:"rgba(255,255,255,0.06)"}}>·</span><span style={{fontSize:12,color:palette.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:120}}>{m.life_story.slice(0,24)}...</span></>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </MobileAppShell>
  );
}
