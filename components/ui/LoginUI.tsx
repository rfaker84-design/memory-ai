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

  const leaveToCreate = async () => {
    const canLeave = (await onStart?.()) ?? true;

    if (!canLeave) {
      return;
    }

    setLeaving(true);
    window.setTimeout(() => {
      onExitComplete?.();
    }, 1050);
  };

  const handlePhoneLogin = () => {
    if (!phone.trim()) {
      alert("请输入手机号");
      return;
    }

    if (!agreed) {
      alert("请先阅读并同意相关协议");
      return;
    }

    window.localStorage.setItem("yijian_phone", phone.trim());
    window.localStorage.setItem("yijian_auth_mode", "phone");
    setPressed(true);

    window.setTimeout(() => {
      setPressed(false);
      void leaveToCreate();
    }, 120);
  };

  const handleWechatLogin = () => {
    alert("微信登录即将开放");
  };

  const handleGuest = () => {
    window.localStorage.setItem("yijian_auth_mode", "guest");
    window.localStorage.removeItem("yijian_phone");
    void leaveToCreate();
  };

  const baseControlTransition =
    "opacity 900ms cubic-bezier(0.22,1,0.36,1), transform 900ms cubic-bezier(0.22,1,0.36,1)";

  return (
    <section
      aria-label="忆见登录"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10,
        pointerEvents: leaving ? "none" : "auto",
        opacity: leaving ? 0 : 1,
        transform: leaving ? "translateY(-12px)" : "translateY(0)",
        transition:
          "opacity 1050ms cubic-bezier(0.22,1,0.36,1), transform 1050ms cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "11vh",
          left: 24,
          right: 24,
          textAlign: "center",
          opacity: entered ? 1 : 0,
          transform: entered ? "translateY(0)" : "translateY(18px)",
          transition: baseControlTransition,
        }}
      >
        <h1
          style={{
            margin: 0,
            color: "#F8EED4",
            fontSize: 42,
            fontWeight: 500,
            letterSpacing: "0.14em",
            textShadow: "0 0 26px rgba(248,238,212,0.22)",
          }}
        >
          忆见
        </h1>
        <p
          style={{
            margin: "14px 0 0",
            color: "rgba(248,238,212,0.48)",
            fontSize: 12,
            letterSpacing: "0.42em",
          }}
        >
          YIJIAN MEMORY
        </p>
        <p
          style={{
            margin: "12px 0 0",
            color: "rgba(248,238,212,0.72)",
            fontSize: 15,
            letterSpacing: "0.04em",
          }}
        >
          再次遇见思念的人
        </p>
      </div>

      <div
        style={{
          position: "absolute",
          left: "7%",
          right: "7%",
          bottom: "calc(env(safe-area-inset-bottom) + 38px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: entered ? 1 : 0,
          transform: entered ? "translateY(0)" : "translateY(18px)",
          transition: `${baseControlTransition} 120ms`,
        }}
      >
        <div
          style={{
            width: "100%",
            height: 52,
            borderRadius: 999,
            background: "rgba(0,0,0,0.28)",
            border: "1px solid rgba(248,238,212,0.22)",
            display: "flex",
            alignItems: "center",
            overflow: "hidden",
          }}
        >
          <span
            style={{
              width: 58,
              textAlign: "center",
              color: "rgba(248,238,212,0.72)",
              fontSize: 15,
            }}
          >
            +86
          </span>
          <span
            aria-hidden="true"
            style={{
              width: 1,
              height: 20,
              background: "rgba(248,238,212,0.22)",
            }}
          />
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))}
            inputMode="tel"
            placeholder="请输入手机号"
            aria-label="请输入手机号"
            style={{
              flex: 1,
              minWidth: 0,
              height: "100%",
              border: 0,
              background: "transparent",
              color: "#F8EED4",
              outline: "none",
              padding: "0 18px",
              fontSize: 16,
            }}
          />
        </div>

        <button
          type="button"
          onClick={handlePhoneLogin}
          style={{
            width: "100%",
            height: 52,
            marginTop: 14,
            border: 0,
            borderRadius: 999,
            background: "linear-gradient(135deg, #FFF1C9 0%, #E7BE78 52%, #B98748 100%)",
            color: "#120E09",
            fontSize: 16,
            fontWeight: 600,
            cursor: "pointer",
            transform: pressed ? "scale(0.98)" : "scale(1)",
            boxShadow: "0 14px 42px rgba(204,151,78,0.18)",
            transition: "transform 120ms ease",
          }}
        >
          登录
        </button>

        <button
          type="button"
          onClick={handleWechatLogin}
          style={{
            width: "100%",
            height: 48,
            marginTop: 12,
            borderRadius: 999,
            border: "1px solid rgba(248,238,212,0.18)",
            background: "rgba(0,0,0,0.22)",
            color: "rgba(248,238,212,0.76)",
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          微信登录
        </button>

        <button
          type="button"
          onClick={handleGuest}
          style={{
            marginTop: 13,
            border: 0,
            background: "transparent",
            color: "rgba(248,238,212,0.42)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          跳过登录
        </button>

        <label
          style={{
            width: "100%",
            margin: "18px 0 0",
            color: "rgba(248,238,212,0.58)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            gap: 8,
            fontSize: 12,
            lineHeight: 1.8,
            textAlign: "left",
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
