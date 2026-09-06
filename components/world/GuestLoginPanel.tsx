"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { fetchAuthRequestJson } from "../../src/components/auth/authRequestClient";
import { authFailureReference, resolveSmsLoginAction, smsSendFailureNotice, smsVerifyFailureNotice } from "../../src/components/auth/loginExperienceClient";
import { containModalFocus } from "../../src/components/auth/modalFocus";
import styles from "./GuestPublicExperience.module.css";

type GuestLoginPanelProps = {
  reason: string;
  onClose: () => void;
  onAuthenticated: () => void | Promise<void>;
};

type LoginPayload = { authenticated?: boolean; challengeId?: string };

export function GuestLoginPanel({ reason, onClose, onAuthenticated }: GuestLoginPanelProps) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [failureReference, setFailureReference] = useState("");
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const restore = panel.current ? containModalFocus(panel.current, () => close.current()) : undefined;
    return () => { activeRequest.current?.abort(); restore?.(); };
  }, []);

  const codeStage = challengeId.length > 0;

  const sendCode = async () => {
    if (activeRequest.current) return;
    const action = resolveSmsLoginAction(agreementAccepted);
    if (action.type === "notice") return setError(action.message);
    if (!/^1\d{10}$/.test(phone.trim())) return setError("请输入有效的中国大陆手机号。");
    setBusy(true);
    setError("");
    setFailureReference("");
    const controller = new AbortController();
    activeRequest.current = controller;
    try {
      const { response, body } = await fetchAuthRequestJson("/api/auth/send-code", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      }, fetch, controller.signal);
      if (controller.signal.aborted) return;
      const payload = body as LoginPayload | null;
      if (!response.ok || typeof payload?.challengeId !== "string" || !payload.challengeId) {
        setError(smsSendFailureNotice(response.status));
        setFailureReference(authFailureReference(response));
        return;
      }
      setChallengeId(payload.challengeId);
      setCode("");
    } catch {
      if (controller.signal.aborted) return;
      setError("网络连接中断，验证码尚未发送。系统不会自动重试。");
    } finally {
      activeRequest.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const verifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (activeRequest.current) return;
    const action = resolveSmsLoginAction(agreementAccepted);
    if (action.type === "notice") return setError(action.message);
    if (!challengeId || !/^\d{6}$/.test(code)) return setError("请输入 6 位短信验证码。");
    setBusy(true);
    setError("");
    setFailureReference("");
    const controller = new AbortController();
    activeRequest.current = controller;
    try {
      const { response, body } = await fetchAuthRequestJson("/api/auth/verify-code", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), challengeId, code }),
      }, fetch, controller.signal);
      if (controller.signal.aborted) return;
      if (!response.ok || (body as LoginPayload | null)?.authenticated !== true) {
        setError(smsVerifyFailureNotice(response.status));
        setFailureReference(authFailureReference(response));
        return;
      }
      await onAuthenticated();
    } catch {
      if (controller.signal.aborted) return;
      setError("网络连接中断，登录结果尚未确认。请重新验证。");
    } finally {
      activeRequest.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  return (
    <div className={styles.loginLayer} role="presentation">
      <section ref={panel} tabIndex={-1} className={styles.loginPanel} role="dialog" aria-modal="true" aria-labelledby="guest-login-title">
        <div className={styles.loginHeading}>
          <p>继续此操作</p>
          <h1 id="guest-login-title">{reason}</h1>
          <button className={styles.closeButton} type="button" onClick={onClose} aria-label="关闭登录面板">×</button>
        </div>
        <form className={styles.loginForm} onSubmit={verifyCode} noValidate>
          <label>
            <span>手机号</span>
            <input value={phone} disabled={busy} onChange={(event) => { setPhone(event.currentTarget.value); setChallengeId(""); setCode(""); setError(""); setFailureReference(""); }} type="tel" inputMode="numeric" autoComplete="tel" maxLength={16} placeholder="请输入手机号" />
          </label>
          <label>
            <span>验证码</span>
            <div className={styles.codeRow}>
              <input value={code} onChange={(event) => { setCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} type="text" inputMode="numeric" autoComplete="one-time-code" disabled={!codeStage || busy} placeholder={codeStage ? "请输入 6 位验证码" : "发送后填写"} />
              <button type="button" onClick={() => void sendCode()} disabled={busy || !phone.trim()}>{codeStage ? "重新发送" : "发送验证码"}</button>
            </div>
          </label>
          {error && <p className={styles.loginError} role="status">{error}</p>}
          {error && <p className={styles.loginReference}>{failureReference}<a href="/help#support">查看帮助</a></p>}
          <label className={styles.agreement}><input type="checkbox" checked={agreementAccepted} onChange={(event) => { setAgreementAccepted(event.currentTarget.checked); setError(""); }} /><span>我已阅读并同意<a href="/terms">《用户协议》</a>和<a href="/privacy">《隐私政策》</a></span></label>
          <button className={styles.loginContinue} type="submit" disabled={busy || !codeStage || code.length !== 6 || !agreementAccepted}>{busy ? "正在确认…" : "登录并继续"}</button>
          <button className={styles.loginCancel} type="button" onClick={onClose}>暂不登录</button>
        </form>
      </section>
    </div>
  );
}
