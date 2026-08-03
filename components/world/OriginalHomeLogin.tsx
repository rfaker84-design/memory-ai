"use client";

import { useEffect, useState } from "react";

import {
  LOGIN_AGREEMENT_NOTICE,
  loadWeChatProviderState,
  resolveWeChatLoginAction,
  smsSendFailureNotice,
  type WeChatProviderState,
} from "../../src/components/auth/loginExperienceClient";
import homeLoginStyles from "./HomeLogin.module.css";

const WECHAT_LOGIN_VISUAL_PREVIEW_AVAILABLE =
  process.env.NODE_ENV !== "production"
  && process.env.NEXT_PUBLIC_MEMORYAI_LOGIN_VISUAL_STATE === "wechat-available";

function WeChatMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 28" width="24" height="22">
      <path fill="#07C160" d="M12.8 2C5.73 2 0 6.57 0 12.2c0 3.2 1.86 6.05 4.76 7.92l-1.2 3.6 4.17-2.08c1.57.5 3.28.77 5.07.77.54 0 1.07-.03 1.59-.08a8.67 8.67 0 0 1-.53-2.97c0-5.35 4.9-9.72 11.07-9.98C23.38 5.1 18.58 2 12.8 2Z" />
      <path fill="#07C160" d="M32 19.27c0-4.36-4.5-7.9-10.06-7.9s-10.07 3.54-10.07 7.9 4.51 7.9 10.07 7.9c1.42 0 2.77-.23 4-.64l3.3 1.65-.94-2.88c2.25-1.45 3.7-3.62 3.7-6.03Z" />
      <circle cx="8.4" cy="10.1" r="1.25" fill="#0B0A08" />
      <circle cx="16.3" cy="10.1" r="1.25" fill="#0B0A08" />
      <circle cx="18.4" cy="17.5" r="1.05" fill="#0B0A08" />
      <circle cx="25.2" cy="17.5" r="1.05" fill="#0B0A08" />
    </svg>
  );
}

export function OriginalHomeLogin({ onAuthenticated, onPreview }: { onAuthenticated: () => void; onPreview?: () => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [challengeId, setChallengeId] = useState("");
  const [notice, setNotice] = useState("");
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [wechatProviderState, setWechatProviderState] = useState<WeChatProviderState>("checking");

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown((current) => current - 1), 1_000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    if (WECHAT_LOGIN_VISUAL_PREVIEW_AVAILABLE) {
      setWechatProviderState("available");
      return;
    }
    const controller = new AbortController();
    void loadWeChatProviderState(fetch, controller.signal).then((state) => {
      if (!controller.signal.aborted) setWechatProviderState(state);
    });
    return () => controller.abort();
  }, []);

  const isChinaMobile = (value: string) => {
    const compact = value.trim().replace(/[\s()-]/g, "");
    const national = compact.startsWith("+86") ? compact.slice(3)
      : compact.startsWith("0086") ? compact.slice(4)
        : compact.startsWith("86") && compact.length === 13 ? compact.slice(2) : compact;
    return /^1[3-9]\d{9}$/.test(national);
  };

  const sendCode = async () => {
    if (sending) return;
    if (!agreementAccepted) {
      setNotice(LOGIN_AGREEMENT_NOTICE);
      return;
    }
    if (!isChinaMobile(phone)) {
      setNotice("请输入有效的中国大陆手机号。");
      return;
    }
    setSending(true);
    setNotice("");
    try {
      const response = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ phone }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 202 && data.accepted && data.challengeId) {
        setChallengeId(data.challengeId);
        setStep("code");
        setCountdown(60);
      } else {
        setNotice(smsSendFailureNotice(response.status));
      }
    } catch {
      setNotice("网络连接暂时中断，请检查网络后重试。");
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async () => {
    if (code.length !== 6 || !challengeId) return;
    setNotice("");
    try {
      const response = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ phone, code, challengeId }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.authenticated) {
        setStep("phone");
        setPhone("");
        setCode("");
        setChallengeId("");
        onAuthenticated();
      } else {
        setNotice("验证码暂时无法确认，请重新获取后再试。");
      }
    } catch {
      setNotice("网络连接暂时中断，请检查网络后重试。");
    }
  };

  const beginWeChatLogin = () => {
    const action = resolveWeChatLoginAction(agreementAccepted, wechatProviderState);
    if (action.type === "notice") {
      setNotice(action.message);
      return;
    }
    window.location.assign(action.href);
  };

  return (
    <main style={{ position: "fixed", inset: 0, overflow: "auto", background: "radial-gradient(circle at 50% 0%, #302218 0%, #0B0A08 55%)", fontFamily: "system-ui, -apple-system, 'Noto Serif SC', 'Noto Sans SC', sans-serif" }}>
      <div className={homeLoginStyles.overlay}>
        <div className={homeLoginStyles.title}>你的记忆世界</div>
        <div className={homeLoginStyles.subtitle}>每一次回来，都是重逢</div>
        <div className={homeLoginStyles.card}>
          {notice && <p role="alert" className={homeLoginStyles.notice}>{notice}</p>}
          {step === "phone" ? <>
            {wechatProviderState === "available" && <>
              <button type="button" onClick={beginWeChatLogin} className={homeLoginStyles.wechatButton}><WeChatMark /><span>微信一键登录</span></button>
              <div role="separator" className={homeLoginStyles.divider}><span className={homeLoginStyles.dividerLine} /><span>或使用手机号登录</span><span className={homeLoginStyles.dividerLine} /></div>
            </>}
            <input type="tel" value={phone} onChange={(event) => { setPhone(event.currentTarget.value); setNotice(""); }} placeholder="输入手机号" inputMode="numeric" autoComplete="tel" maxLength={16} autoFocus className={homeLoginStyles.phoneInput} />
            <button type="button" onClick={() => void sendCode()} disabled={!phone || sending} data-active={Boolean(phone && !sending)} className={homeLoginStyles.smsButton}>{sending ? "发送中..." : "获取验证码"}</button>
            <div className={homeLoginStyles.agreementRow}>
              <span className={homeLoginStyles.checkControl}><input id="login-agreement" type="checkbox" checked={agreementAccepted} onChange={(event) => { setAgreementAccepted(event.currentTarget.checked); if (event.currentTarget.checked && notice === LOGIN_AGREEMENT_NOTICE) setNotice(""); }} aria-describedby="login-account-note" className={homeLoginStyles.checkboxInput} /><span className={homeLoginStyles.checkboxVisual} aria-hidden="true" /></span>
              <span><label htmlFor="login-agreement" className={homeLoginStyles.agreementLabel}>我已阅读并同意</label><a href="/terms" className={homeLoginStyles.legalLink}>《用户协议》</a>和<a href="/privacy" className={homeLoginStyles.legalLink}>《隐私政策》</a></span>
            </div>
            <p id="login-account-note" className={homeLoginStyles.accountNote}>未注册的手机号验证后将自动创建忆见账号</p>
            <a href="/help" className={homeLoginStyles.legalLink}>帮助与安全说明</a>
            {process.env.NODE_ENV !== "production" && onPreview && <button type="button" onClick={onPreview} className={homeLoginStyles.previewButton}>开发视觉预览</button>}
          </> : <>
            <p style={{ margin: 0, color: "#8a7060", fontSize: 12, textAlign: "center" }}>验证码已发送至 {phone}</p>
            <input type="text" value={code} onChange={(event) => setCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6))} placeholder="输入验证码" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} className={homeLoginStyles.phoneInput} />
            <button type="button" onClick={() => void verifyCode()} disabled={code.length !== 6} data-active={code.length === 6} className={homeLoginStyles.smsButton}>进入忆见</button>
            <button type="button" onClick={() => { if (countdown === 0) void sendCode(); else setStep("phone"); }} disabled={sending} className={homeLoginStyles.previewButton}>{countdown > 0 ? `${countdown}s 后更换手机号` : "重新发送验证码"}</button>
          </>}
        </div>
      </div>
    </main>
  );
}
