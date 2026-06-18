"use client";
import React from "react";
import { V2, r } from "../../../../styles/v2-emotion-ui";

type Props = {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  autoFocus?: boolean;
  style?: React.CSSProperties;
};

export default function V2Input({ value, onChange, placeholder, onKeyDown, autoFocus, style }: Props) {
  return (
    <input
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      autoFocus={autoFocus}
      style={{
        width:"100%",height:44,padding:"0 16px",
        borderRadius:r.md,
        border:`0.5px solid ${V2.borderLight}`,
        background:V2.surface,color:V2.text,
        fontSize:14,outline:"none",
        backdropFilter:"blur(12px)",
        WebkitBackdropFilter:"blur(12px)",
        ...style,
      }}
    />
  );
}