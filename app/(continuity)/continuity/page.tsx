"use client";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { MemoryTheme as T, WarmMotion as M } from "../../../src/lib/design-system/memory-theme";

function clearCache(){try{Object.keys(localStorage).filter(k=>k.startsWith("yj_")||k.startsWith("yijian_")).forEach(k=>localStorage.removeItem(k));alert("已清理");}catch{}}

export default function ContinuityPage() {
  const router = useRouter();
  return (
    <motion.div {...M.enter} style={{minHeight:"calc(100dvh - var(--nav-height,64px) - env(safe-area-inset-bottom,0px) - 16px)",padding:"clamp(20px,5vw,32px) clamp(16px,4vw,24px) calc(96px + env(safe-area-inset-bottom,0px))",background:T.colors.bg}}>
      <h2 style={{fontSize:"clamp(20px,5vw,26px)",fontWeight:700,color:T.colors.text,margin:"0 0 4px"}}>我的</h2>
      <p style={{fontSize:11,color:T.colors.textFaint,letterSpacing:"0.06em",marginBottom:26}}>管理你的资料、隐私与帮助选项</p>
      <div style={{borderRadius:T.radius.lg,border:`0.5px solid ${T.colors.border}`,background:T.colors.card,boxShadow:T.shadow.card,padding:16,marginBottom:20}}>
        <p style={{fontSize:12,color:T.colors.textFaint,letterSpacing:"0.06em",margin:"0 0 14px"}}>使用说明</p>
        <p style={{fontSize:15,color:T.colors.text,lineHeight:1.7,margin:0}}>忆见的回复由 AI 基于你确认的资料生成，不代表真实人物具有意识、正在现实中活动或作出承诺。</p>
      </div>
      <button onClick={()=>router.push("/memory-world")} style={{width:"100%",minHeight:50,borderRadius:T.radius.lg,border:"none",background:T.colors.primary,color:"#FFF",fontSize:15,fontWeight:600,letterSpacing:"0.04em",cursor:"pointer",boxShadow:T.shadow.button,marginBottom:24}}>前往相伴</button>
      <p style={{fontSize:11,color:T.colors.textFaint,letterSpacing:"0.08em",marginBottom:8,paddingLeft:4}}>设置</p>
      <div style={{borderRadius:T.radius.lg,border:`0.5px solid ${T.colors.border}`,background:T.colors.card,boxShadow:T.shadow.card,padding:"4px 16px"}}>
        {[{label:"清理本机界面缓存",action:clearCache},{label:"数据删除与退款",action:()=>router.push("/settings/account-deletion")},{label:"数据导出",action:()=>router.push("/settings/data-export")},{label:"陪伴安全设置",action:()=>router.push("/settings/companion")},{label:"帮助与安全说明",action:()=>router.push("/help")},{label:"关于忆见",action:()=>router.push("/about")}].map((item,i,items)=>(<button key={item.label} type="button" onClick={item.action} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",border:"none",borderBottom:i<items.length-1?"0.5px solid "+T.colors.border:"none",background:"transparent",cursor:"pointer",textAlign:"left",minHeight:44}}><span style={{fontSize:14,color:T.colors.textMuted}}>{item.label}</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.colors.textFaint} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>))}
      </div>
      <button type="button" onClick={()=>router.push("/settings/companion")} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:12,padding:"14px 16px",border:`0.5px solid ${T.colors.border}`,borderRadius:T.radius.lg,background:T.colors.card,color:T.colors.textMuted,cursor:"pointer",textAlign:"left",minHeight:50,boxShadow:T.shadow.card}}><span style={{fontSize:14}}>陪伴安全设置</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.colors.textFaint} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
      <div style={{textAlign:"center",fontSize:11,color:T.colors.textFaint,letterSpacing:"0.07em",paddingTop:32}}>忆见 MemoryAI<br/>V2 Warm Healing</div>
    </motion.div>
  );
}
