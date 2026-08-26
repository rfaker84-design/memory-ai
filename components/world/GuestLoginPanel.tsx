"use client";

import { FormEvent, useState } from "react";

import { fetchAuthRequestJson } from "../../src/components/auth/authRequestClient";
import { resolveSmsLoginAction } from "../../src/components/auth/loginExperienceClient";
import styles from "./GuestPublicExperience.module.css";

type GuestLoginPanelProps = {
  reason: string;
  onClose: () => void;
  onAuthenticated: () => void;
};

type LoginPayload = { authenticated?: boolean; challengeId?: string };

export function GuestLoginPanel({ reason, onClose, onAuthenticated }: GuestLoginPanelProps) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const codeStage = challengeId.length > 0;

  const sendCode = async () => {
    const action = resolveSmsLoginAction(agreementAccepted);
    if (action.type === "notice") return setError(action.message);
    if (!/^1\d{10}$/.test(phone.trim())) return setError("请输入有效的中国大陆手机号。");
    setBusy(true);
    setError("");
    try {
      const { response, body } = await fetchAuthRequestJson("/api/auth/send-code", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const payload = body as LoginPayload;
      if (!response.ok || !payload.challengeId) {
        setError(response.status === 429 ? "请求过于频繁，请稍后再试。" : "暂时无法发送验证码，请检查号码后重试。");
        return;
      }
      setChallengeId(payload.challengeId);
      setCode("");
    } catch {
      setError("网络连接中断，验证码尚未发送。系统不会自动重试。");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const action = resolveSmsLoginAction(agreementAccepted);
    if (action.type === "notice") return setError(action.message);
    if (!challengeId || !/^\d{6}$/.test(code)) return setError("请输入 6 位短信验证码。");
    setBusy(true);
    setError("");
    try {
      const { response, body } = await fetchAuthRequestJson("/api/auth/verify-code", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), challengeId, code }),
      });
      if (!response.ok || !(body as LoginPayload).authenticated) {
        setError("验证码无效或已过期，请重新获取。");
        return;
      }
      onAuthenticated();
    } catch {
      setError("网络连接中断，登录结果尚未确认。请重新验证。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.loginLayer} role="presentation">
      <section className={styles.loginPanel} role="dialog" aria-modal="true" aria-labelledby="guest-login-title">
        <div className={styles.loginHeading}>
          <p>继续此操作</p>
          <h1 id="guest-login-title">{reason}</h1>
          <button className={styles.closeButton} type="button" onClick={onClose} aria-label="关闭登录面板">×</button>
        </div>
        <form className={styles.loginForm} onSubmit={verifyCode} noValidate>
          <label>
            <span>手机号</span>
            <input value={phone} onChange={(event) => { setPhone(event.currentTarget.value); setError(""); }} type="tel" inputMode="numeric" autoComplete="tel" maxLength={16} placeholder="请输入手机号" />
          </label>
          <label>
            <span>验证码</span>
            <div className={styles.codeRow}>
              <input value={code} onChange={(event) => { setCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} type="text" inputMode="numeric" autoComplete="one-time-code" disabled={!codeStage || busy} placeholder={codeStage ? "请输入 6 位验证码" : "发送后填写"} />
              <button type="button" onClick={() => void sendCode()} disabled={busy || !phone.trim()}>{codeStage ? "重新发送" : "发送验证码"}</button>
            </div>
          </label>
          {error && <p className={styles.loginError} role="status">{error}</p>}
          <label className={styles.agreement}><input type="checkbox" checked={agreementAccepted} onChange={(event) => { setAgreementAccepted(event.currentTarget.checked); setError(""); }} /><span>我已阅读并同意<a href="/terms">《用户协议》</a>和<a href="/privacy">《隐私政策》</a></span></label>
          <button className={styles.loginContinue} type="submit" disabled={busy || !codeStage || code.length !== 6 || !agreementAccepted}>{busy ? "正在确认…" : "登录并继续"}</button>
          <button className={styles.loginCancel} type="button" onClick={onClose}>暂不登录</button>
        </form>
      </section>
    </div>
  );
}
