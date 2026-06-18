"use client";

import React from "react";
import { palette, radius } from "../../../styles/app-store-design-system";

/* =========================================================================
   AppStoreInput — App Store-grade blur input
   ========================================================================= */

interface Props {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
  style?: React.CSSProperties;
}

export default function AppStoreInput({ value,onChange,onKeyDown,placeholder="",type="text",multiline=false,style }: Props) {
  const base: React.CSSProperties = {
    width:"100%",padding:multiline?"14px 16px":"0 16px",
    borderRadius:radius.input,border:`0.5px solid ${palette.border}`,
    background:palette.surface,color:palette.textPrimary,fontSize:15,
    lineHeight:1.5,outline:"none",
    backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
    transition:"border-color 0.2s,box-shadow 0.2s",
    ...style,
  };
  if (multiline) {
    return <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={3}
      style={{...base,resize:"vertical",minHeight:88,fontFamily:"inherit"}}/>;
  }
  return (
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} onKeyDown={onKeyDown} placeholder={placeholder}
      style={{...base,height:48}}
      onFocus={e=>{e.currentTarget.style.borderColor=palette.borderPrimary;e.currentTarget.style.boxShadow=`0 0 0 1px ${palette.primarySoft}`}}
      onBlur={e=>{e.currentTarget.style.borderColor=palette.border;e.currentTarget.style.boxShadow="none"}}
    />
  );
}
