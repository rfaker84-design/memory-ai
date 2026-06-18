"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { MemoryTheme as T, WarmMotion as M } from "../../../src/lib/design-system/memory-theme";

type Memory = { id:string; name:string; relationship:string|null; life_story:string|null };

export default function BondPage() {
  const router = useRouter();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let c=false;
    async function load(){
      try{
        const p=localStorage.getItem("yj_phone")||localStorage.getItem("yijian_phone")||"";
        const r=await fetch("/api/memories-mvp?phone="+encodeURIComponent(p));
        if(r.ok&&!c)setMemories((await r.json())||[]);
      }catch{}finally{if(!c)setLoading(false);}
    }
    load();return()=>{c=true};
  },[]);

  return (
    <motion.div {...M.enter} style={{minHeight:"calc(100dvh - var(--nav-height,64px) - env(safe-area-inset-bottom,0px) - 16px)",padding:"clamp(20px,5vw,32px) clamp(16px,4vw,24px)",background:T.colors.bg}}>
      <h2 style={{fontSize:"clamp(20px,5vw,26px)",fontWeight:700,color:T.colors.text,margin:"0 0 4px"}}>建立连接</h2>
      <p style={{fontSize:12,color:T.colors.textMuted,letterSpacing:"0.04em",margin:"0 0 20px"}}>创建一个人，记录你珍贵的记忆</p>
      <button onClick={()=>router.push("/create-memory")} style={{width:"100%",minHeight:50,borderRadius:T.radius.lg,border:"none",background:T.colors.primary,color:"#FFF",fontSize:15,fontWeight:600,letterSpacing:"0.04em",cursor:"pointer",boxShadow:T.shadow.button,marginBottom:28}}>+ 创建记忆体</button>
      {loading&&<div style={{display:"flex",justifyContent:"center",paddingTop:32}}><div style={{width:24,height:24,borderRadius:"50%",border:"2px solid "+T.colors.border,borderTopColor:T.colors.primary,animation:"spin-ring 0.7s linear infinite"}}/></div>}
      {!loading&&memories.length===0&&<div style={{textAlign:"center",paddingTop:40}}><p style={{fontSize:15,color:T.colors.textMuted,marginBottom:6}}>还没有记忆体</p><p style={{fontSize:13,color:T.colors.textFaint}}>创建第一个，开始一段温柔的陪伴</p></div>}
      {!loading&&memories.length>0&&(<>
        <p style={{fontSize:11,color:T.colors.textFaint,letterSpacing:"0.08em",marginBottom:10}}>已建立的连接</p>
        <div style={{display:"flex",flexDirection:"column",gap:10}} className="stagger">
          {memories.map(m=>(
            <div key={m.id} onClick={()=>router.push("/dialogue?id="+m.id)} style={{borderRadius:T.radius.lg,border:`0.5px solid ${T.colors.border}`,background:T.colors.card,boxShadow:T.shadow.card,padding:16,cursor:"pointer",display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:42,height:42,borderRadius:"50%",background:T.colors.primarySoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:700,color:T.colors.primary,flexShrink:0}}>{m.name.charAt(0)}</div>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:15,fontWeight:600,color:T.colors.text,marginBottom:2}}>{m.name}</div>{m.relationship&&<div style={{fontSize:12,color:T.colors.textMuted}}>{m.relationship}</div>}</div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.colors.textFaint} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          ))}
        </div>
      </>)}
    </motion.div>
  );
}