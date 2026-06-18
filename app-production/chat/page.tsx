"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import MobileAppShell from "../../src/components/MobileAppShell";
import { palette } from "../../styles/app-store-theme";
import { FEATURES } from "../../src/lib/feature-flags";

/* =========================================================================
   Production ChatPage — Stable mock-first AI chat
   Supabase fallback · No streaming/WS/realtime
   ========================================================================= */

type Memory = { id:string; name:string; relationship:string|null };
type Message = { role:"user"|"assistant"; content:string };

const MOCK_MEMORIES: Memory[] = [
  { id:"m1", name:"母亲", relationship:"家人" },
  { id:"m2", name:"父亲", relationship:"家人" },
];

function mockReply(name:string, msg:string): string {
  const replies = [
    `孩子，${name}一直都在。`,
    `我听见了。${name}永远爱你。`,
    `别难过，${name}希望看到你开心的样子。`,
    `谢谢你记得${name}。`,
  ];
  return replies[Math.floor(Math.random() * replies.length)];
}

export default function ChatPage() {
  const router = useRouter();
  const [memories, setMemories] = useState<Memory[]>(MOCK_MEMORIES);
  const [selected, setSelected] = useState<Memory|null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  /* Try Supabase in background */
  useEffect(() => {
    if (!FEATURES.supabaseMemories) return;
    let c = false;
    async function load(){
      try{
        const p=localStorage.getItem("yj_phone")||localStorage.getItem("yijian_phone")||"";
        const r=await fetch("/api/memories-mvp?phone="+encodeURIComponent(p));
        if(r.ok&&!c){const d=await r.json();if(Array.isArray(d)&&d.length>0)setMemories(d);}
      }catch{}
    }
    load(); return ()=>{c=true};
  },[]);

  function select(m:Memory){
    setSelected(m);
    setMessages([{role:"assistant",content:`你好，我是 ${m.name}。很高兴能再次与你对话。`}]);
  }

  async function send(){
    if(!input.trim()||!selected||loading) return;
    const um:Message={role:"user",content:input.trim()};
    setMessages(p=>[...p,um]); setInput(""); setLoading(true);

    if(FEATURES.openAIChat){
      try{
        const p=localStorage.getItem("yj_phone")||localStorage.getItem("yijian_phone")||"";
        const r=await fetch("/api/memory-chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone:p,memoryId:selected.id,message:um.content})});
        if(r.ok){
          const d=await r.json();
          setMessages(p=>[...p,{role:"assistant",content:d.reply||d.text||"我在的。"}]);
          setLoading(false); return;
        }
      }catch{}
    }

    /* Mock fallback with 800ms delay */
    await new Promise(res=>setTimeout(res,800));
    setMessages(p=>[...p,{role:"assistant",content:mockReply(selected.name,um.content)}]);
    setLoading(false);
  }

  if(!selected){
    return (
      <MobileAppShell>
        <div style={{padding:"clamp(20px,5vw,32px) clamp(16px,4vw,24px)",minHeight:"calc(100dvh - 64px - env(safe-area-inset-bottom,0px) - 16px)"}}>
          <h2 style={{fontSize:18,fontWeight:700,color:palette.textPrimary,marginBottom:4}}>选择记忆体</h2>
          <p style={{fontSize:12,color:palette.textMuted,marginBottom:20}}>选择一个记忆体后开始对话</p>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {memories.map(m=>(
              <div key={m.id} onClick={()=>select(m)} style={{borderRadius:18,border:"0.5px solid rgba(255,255,255,0.06)",background:palette.surface,boxShadow:"0 4px 16px rgba(0,0,0,0.3)",padding:"14px 16px",display:"flex",alignItems:"center",gap:12,cursor:"pointer",backdropFilter:"blur(8px)"}}>
                <div style={{width:40,height:40,borderRadius:"50%",background:"rgba(255,179,124,0.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:palette.primary,flexShrink:0}}>{m.name.charAt(0)}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:600,color:palette.textPrimary}}>{m.name}</div>
                  {m.relationship && <div style={{fontSize:12,color:palette.textMuted}}>{m.relationship}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </MobileAppShell>
    );
  }

  return (
    <MobileAppShell>
      <div style={{display:"flex",flexDirection:"column",height:"calc(100dvh - 64px - env(safe-area-inset-bottom,0px) - 16px)"}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderBottom:"0.5px solid rgba(255,255,255,0.06)",background:"rgba(11,10,8,0.9)",backdropFilter:"blur(14px)",position:"sticky",top:0,zIndex:10}}>
          <button onClick={()=>{setSelected(null);setMessages([]);}} style={{background:"none",border:"none",cursor:"pointer",padding:6,display:"flex",color:palette.textMuted}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style={{width:30,height:30,borderRadius:"50%",background:"rgba(255,179,124,0.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:palette.primary}}>{selected.name.charAt(0)}</div>
          <span style={{fontSize:15,fontWeight:600,color:palette.textPrimary}}>{selected.name}</span>
        </div>

        {/* Messages */}
        <div style={{flex:1,overflowY:"auto",padding:"14px 14px 6px",display:"flex",flexDirection:"column",gap:8}}>
          {messages.map((msg,i)=>(
            <div key={i} style={{alignSelf:msg.role==="user"?"flex-end":"flex-start",maxWidth:"82%",animation:"msg-in 0.2s ease-out both"}}>
              <div style={{padding:"11px 15px",borderRadius:msg.role==="user"?"18px 18px 4px 18px":"18px 18px 18px 4px",background:msg.role==="user"?"rgba(255,179,124,0.12)":palette.surface,border:`0.5px solid ${msg.role==="user"?"rgba(255,179,124,0.22)":"rgba(255,255,255,0.06)"}`,fontSize:14,lineHeight:1.65,color:msg.role==="user"?palette.primary:palette.textSecondary}}>{msg.content}</div>
            </div>
          ))}
          {loading && <div style={{padding:"11px 15px"}}><div style={{width:16,height:16,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.06)",borderTopColor:palette.primary,animation:"spin-ring 0.7s linear infinite"}}/></div>}
        </div>

        {/* Input */}
        <div style={{padding:"10px 12px",borderTop:"0.5px solid rgba(255,255,255,0.06)",display:"flex",gap:8}}>
          <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")send()}} placeholder="输入消息..." style={{flex:1,height:42,padding:"0 16px",borderRadius:21,border:"0.5px solid rgba(255,255,255,0.06)",background:palette.surface,color:palette.textPrimary,fontSize:14,outline:"none"}}/>
          <button onClick={send} disabled={!input.trim()||loading} style={{width:38,height:38,borderRadius:"50%",border:`0.5px solid ${input.trim()?"rgba(255,179,124,0.22)":"rgba(255,255,255,0.06)"}`,background:input.trim()?"rgba(255,179,124,0.12)":"transparent",color:input.trim()?palette.primary:palette.textMuted,display:"flex",alignItems:"center",justifyContent:"center",cursor:input.trim()?"pointer":"default"}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    </MobileAppShell>
  );
}
