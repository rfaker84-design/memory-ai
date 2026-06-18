"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { MemoryTheme as T, WarmMotion as M } from "../../../src/lib/design-system/memory-theme";

type Memory = { id:string; name:string; relationship:string|null; life_story:string|null; created_at?:string };

export default function MemoryPage() {
  const router = useRouter();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(()=>{let c=false;async function load(){try{const p=localStorage.getItem("yj_phone")||localStorage.getItem("yijian_phone")||"";const u=p?"/api/memories-mvp?phone="+encodeURIComponent(p):"/api/memories-mvp";const r=await fetch(u);if(!r.ok)throw new Error(""+r.status);if(!c)setMemories((await r.json())||[]);}catch{if(!c)setError(true)}finally{if(!c)setLoading(false)}}load();return()=>{c=true};},[]);

  return (
    <motion.div {...M.enter} style={{minHeight:"calc(100dvh - var(--nav-height,64px) - env(safe-area-inset-bottom,0px) - 16px)",padding:"clamp(20px,5vw,32px) clamp(16px,4vw,24px)",background:T.colors.bg}}>
      <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:20}}><div><h2 style={{fontSize:"clamp(20px,5vw,26px)",fontWeight:700,color:T.colors.text,margin:0}}>回忆</h2>{memories.length>0&&<p style={{fontSize:11,color:T.colors.textFaint,margin:"3px 0 0"}}>{memories.length} 段记忆</p>}</div></div>
      {loading&&<div style={{display:"flex",justifyContent:"center",paddingTop:60}}><div style={{width:26,height:26,borderRadius:"50%",border:"2px solid "+T.colors.border,borderTopColor:T.colors.primary,animation:"spin-ring 0.7s linear infinite"}}/></div>}
      {!loading&&error&&<div style={{textAlign:"center",paddingTop:60}}><p style={{fontSize:14,color:T.colors.textFaint,marginBottom:16}}>暂时无法加载</p><button onClick={()=>{setLoading(true);setError(false);window.location.reload()}} style={{minHeight:46,padding:"0 24px",borderRadius:T.radius.lg,border:"0.5px solid "+T.colors.border,background:T.colors.card,color:T.colors.textMuted,fontSize:14,cursor:"pointer"}}>重试</button></div>}
      {!loading&&!error&&memories.length===0&&<div style={{textAlign:"center",paddingTop:60}}><p style={{fontSize:15,color:T.colors.textMuted,marginBottom:12}}>还没有回忆</p><button onClick={()=>router.push("/bond")} style={{minHeight:46,padding:"0 24px",borderRadius:T.radius.lg,border:"none",background:T.colors.primary,color:"#FFF",fontSize:14,fontWeight:600,cursor:"pointer"}}>去建立连接</button></div>}
      {!loading&&!error&&memories.length>0&&(<div style={{display:"flex",flexDirection:"column",gap:12}} className="stagger">{memories.map(m=>(<div key={m.id} onClick={()=>router.push("/dialogue?id="+m.id)} style={{borderRadius:T.radius.lg,border:`0.5px solid ${T.colors.border}`,background:T.colors.card,boxShadow:T.shadow.card,padding:16,cursor:"pointer",display:"flex",alignItems:"center",gap:14}}><div style={{width:46,height:46,borderRadius:"50%",background:T.colors.primarySoft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,fontWeight:700,color:T.colors.primary,flexShrink:0,boxShadow:T.glow.soft}}>{m.name.charAt(0)}</div><div style={{flex:1,minWidth:0}}><div style={{fontSize:15,fontWeight:600,color:T.colors.text,marginBottom:3}}>{m.name}</div><div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>{m.relationship&&<span style={{fontSize:12,color:T.colors.textMuted}}>{m.relationship}</span>}</div></div><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.colors.textFaint} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></div>))}</div>)}
    </motion.div>
  );
}