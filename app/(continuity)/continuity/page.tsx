"use client";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { MemoryTheme as T, WarmMotion as M } from "../../../src/lib/design-system/memory-theme";

const FEATURES = [{label:"记忆系统",status:"已接入",done:true},{label:"对话系统",status:"稳定运行",done:true},{label:"声音系统",status:"待接入",done:false},{label:"形象系统",status:"待接入",done:false}];
function clearCache(){try{Object.keys(localStorage).filter(k=>k.startsWith("yj_")||k.startsWith("yijian_")).forEach(k=>localStorage.removeItem(k));alert("已清理");}catch{}}

export default function ContinuityPage() {
  const router = useRouter();
  return (
    <motion.div {...M.enter} style={{minHeight:"calc(100dvh - var(--nav-height,64px) - env(safe-area-inset-bottom,0px) - 16px)",padding:"clamp(20px,5vw,32px) clamp(16px,4vw,24px)",background:T.colors.bg}}>
      <h2 style={{fontSize:"clamp(20px,5vw,26px)",fontWeight:700,color:T.colors.text,margin:"0 0 4px"}}>我的</h2>
      <p style={{fontSize:11,color:T.colors.textFaint,letterSpacing:"0.06em",marginBottom:26}}>记忆不会消失，只是换了方式存在</p>
      <div style={{borderRadius:T.radius.lg,border:`0.5px solid ${T.colors.border}`,background:T.colors.card,boxShadow:T.shadow.card,padding:16,marginBottom:20}}>
        <p style={{fontSize:12,color:T.colors.textFaint,letterSpacing:"0.06em",margin:"0 0 14px"}}>情绪延续</p>
        <p style={{fontSize:15,color:T.colors.text,lineHeight:1.7,margin:0,fontStyle:"italic"}}>&quot;他仍然在你的记忆中延续——每一次对话，都在让这份连接变得更深。&quot;</p>
      </div>
      <button onClick={()=>router.push("/dialogue")} style={{width:"100%",minHeight:50,borderRadius:T.radius.lg,border:"none",background:T.colors.primary,color:"#FFF",fontSize:15,fontWeight:600,letterSpacing:"0.04em",cursor:"pointer",boxShadow:T.shadow.button,marginBottom:24}}>再次进入对话</button>
      <p style={{fontSize:11,color:T.colors.textFaint,letterSpacing:"0.08em",marginBottom:8,paddingLeft:4}}>系统状态</p>
      <div style={{borderRadius:T.radius.lg,border:`0.5px solid ${T.colors.border}`,background:T.colors.card,boxShadow:T.shadow.card,padding:"4px 16px",marginBottom:20}}>{FEATURES.map((f,i)=>(<div key={f.label} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",borderBottom:i<FEATURES.length-1?"0.5px solid "+T.colors.border:"none"}}><span style={{fontSize:14,color:T.colors.textMuted}}>{f.label}</span><span style={{fontSize:11,fontWeight:500,color:f.done?T.colors.success:T.colors.textFaint}}>{f.status}</span></div>))}</div>
      <p style={{fontSize:11,color:T.colors.textFaint,letterSpacing:"0.08em",marginBottom:8,paddingLeft:4}}>设置</p>
      <div style={{borderRadius:T.radius.lg,border:`0.5px solid ${T.colors.border}`,background:T.colors.card,boxShadow:T.shadow.card,padding:"4px 16px"}}>
        {[{label:"清理缓存",action:clearCache},{label:"数据删除与退款",action:()=>router.push("/report")},{label:"关于忆见",action:()=>{}}].map((item,i)=>(<div key={item.label} onClick={item.action} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",borderBottom:i<2?"0.5px solid "+T.colors.border:"none",cursor:"pointer"}}><span style={{fontSize:14,color:T.colors.textMuted}}>{item.label}</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.colors.textFaint} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></div>))}
      </div>
      <div style={{textAlign:"center",fontSize:11,color:T.colors.textFaint,letterSpacing:"0.07em",paddingTop:32}}>忆见 MemoryAI<br/>V2 Warm Healing</div>
    </motion.div>
  );
}
