"use client";

import Link from "next/link";
import {useEffect, useState} from "react";

type LoginUIProps = {
  onStart?: () => Promise<boolean> | boolean;
  onExitComplete?: () => void;
};

export default function LoginUI({onStart, onExitComplete}: LoginUIProps) {
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));

    return () => cancelAnimationFrame(frame);
  }, []);

  const handleStart = () => {
    if (!phone.trim()) {
      alert("请输入手机号");
      return;
    }

    if (!agreed) {
      alert("请先阅读并同意相关协议");
      return;
    }

    window.localStorage.setItem("yijian_phone", phone.trim());
    setPressed(true);

    window.setTimeout(async () => {
      setPressed(false);
      const canLeave = (await onStart?.()) ?? true;

      if (!canLeave) {
        return;
      }

      setLeaving(true);
      window.setTimeout(() => {
        onExitComplete?.();
      }, 500);
    }, 120);
  };

  return (
    <section
      style={{
        position: "fixed",
        left: 24,
        right: 24,
        bottom: "calc(env(safe-area-inset-bottom) + 64px)",
        zIndex: 10,
        maxWidth: 390,
        margin: "0 auto",
        opacity: entered && !leaving ? 1 : 0,
        transform: leaving
          ? "translateY(-12px) scale(0.98)"
          : entered
            ? "translateY(0) scale(1)"
            : "translateY(30px) scale(0.97)",
        filter: entered && !leaving ? "blur(0)" : "blur(20px)",
        transition: leaving
          ? "opacity 500ms cubic-bezier(0.22,0.61,0.36,1), transform 500ms cubic-bezier(0.22,0.61,0.36,1), filter 500ms cubic-bezier(0.22,0.61,0.36,1)"
          : "opacity 800ms cubic-bezier(0.22,0.61,0.36,1), transform 800ms cubic-bezier(0.22,0.61,0.36,1), filter 800ms cubic-bezier(0.22,0.61,0.36,1)",
      }}
    >
      <div
        style={{
          background: "rgba(5,5,7,0.38)",
          border: "1px solid rgba(248,238,212,0.22)",
          borderRadius: 32,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          padding: 24,
        }}
      >
        <p
          style={{
            margin: "0 0 12px",
            color: "rgba(248,238,212,0.48)",
            fontSize: 12,
            letterSpacing: "0.42em",
            textAlign: "center",
          }}
        >
          YIJIAN MEMORY
        </p>

        <h1
          style={{
            margin: 0,
            color: "#F8EED4",
            fontSize: 32,
            fontWeight: 500,
            letterSpacing: "0.08em",
            textAlign: "center",
          }}
        >
          忆见
        </h1>
        <p
          style={{
            margin: "10px 0 22px",
            color: "rgba(248,238,212,0.72)",
            fontSize: 15,
            textAlign: "center",
          }}
        >
          再次遇见思念的人
        </p>

        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          inputMode="tel"
          placeholder="请输入手机号"
          aria-label="请输入手机号"
          style={{
            width: "100%",
            height: 52,
            borderRadius: 999,
            background: "rgba(0,0,0,0.28)",
            border: "1px solid rgba(248,238,212,0.18)",
            color: "#F8EED4",
            outline: "none",
            padding: "0 18px",
            fontSize: 16,
            opacity: entered ? 1 : 0,
            transform: entered ? "translateY(0)" : "translateY(16px)",
            transition: "opacity 800ms cubic-bezier(0.22,0.61,0.36,1) 120ms, transform 800ms cubic-bezier(0.22,0.61,0.36,1) 120ms",
          }}
        />

        <button
          type="button"
          onClick={handleStart}
          style={{
            width: "100%",
            height: 52,
            marginTop: 14,
            border: 0,
            borderRadius: 999,
            background: "#F8EED4",
            color: "#1A1A1A",
            fontSize: 16,
            fontWeight: 500,
            cursor: "pointer",
            opacity: entered ? 1 : 0,
            transform: `${entered ? "translateY(0)" : "translateY(16px)"} ${pressed ? "scale(0.97)" : "scale(1)"}`,
            transition: pressed
              ? "transform 120ms ease"
              : "opacity 800ms cubic-bezier(0.22,0.61,0.36,1) 220ms, transform 800ms cubic-bezier(0.22,0.61,0.36,1) 220ms",
          }}
        >
          登录
        </button>

        <label
          style={{
            margin: "16px 0 0",
            color: "rgba(248,238,212,0.58)",
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            fontSize: 12,
            lineHeight: 1.8,
            textAlign: "left",
            opacity: entered ? 1 : 0,
            transform: entered ? "translateY(0)" : "translateY(16px)",
            transition: "opacity 800ms cubic-bezier(0.22,0.61,0.36,1) 320ms, transform 800ms cubic-bezier(0.22,0.61,0.36,1) 320ms",
          }}
        >
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
            style={{
              marginTop: 5,
              accentColor: "#F8EED4",
            }}
          />
          <span>
            我已阅读并同意
            <Link href="/terms" style={{color: "rgba(248,238,212,0.78)", textDecoration: "underline"}}>
              《用户协议》
            </Link>
            和
            <Link href="/privacy" style={{color: "rgba(248,238,212,0.78)", textDecoration: "underline"}}>
              《隐私政策》
            </Link>
          </span>
        </label>
      </div>
    </section>
  );
}
