"use client";

import Image from "next/image";
import type { FormEvent } from "react";

import styles from "./DirectLoginExperience.module.css";

export type DirectLoginStage = "login-phone" | "login-code" | "sms-unavailable";

type DirectLoginExperienceProps = {
  stage: DirectLoginStage;
  phone: string;
  code: string;
  agreementAccepted: boolean;
  busy: boolean;
  error: string;
  sessionChecking: boolean;
  onPhoneChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onAgreementChange: (accepted: boolean) => void;
  onSendCode: () => void | Promise<void>;
  onVerifyCode: () => void | Promise<void>;
  onLeave: () => void;
};

function readableNotice(stage: DirectLoginStage, error: string) {
  if (!error) return "";
  if (stage === "sms-unavailable") return "短信登录暂不可用，请稍后再试。";
  if (stage === "login-code") return "验证码未能确认，请检查后重试。";
  return "请检查手机号，并确认已阅读协议后再继续。";
}

export function DirectLoginExperience({
  stage,
  phone,
  code,
  agreementAccepted,
  busy,
  error,
  sessionChecking,
  onPhoneChange,
  onCodeChange,
  onAgreementChange,
  onSendCode,
  onVerifyCode,
  onLeave,
}: DirectLoginExperienceProps) {
  const codeReady = stage === "login-code";
  const notice = readableNotice(stage, error);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (codeReady) void onVerifyCode();
  };

  return (
    <main className={styles.page}>
      <Image
        className={styles.background}
        src="/login/owner-confirmed-warm-presence.png"
        alt=""
        fill
        priority
        sizes="100vw"
        aria-hidden="true"
      />
      <div className={styles.lightVeil} aria-hidden="true" />
      <div className={styles.shadowVeil} aria-hidden="true" />

      <header className={styles.header}>
        <button className={styles.wordmark} type="button" onClick={onLeave} aria-label="返回忆见首页">
          忆见
        </button>
      </header>

      <section
        className={styles.loginPanel}
        data-visible={!sessionChecking}
        aria-hidden={sessionChecking || undefined}
      >
        <div className={styles.intro}>
          <h1>欢迎来到忆见</h1>
          <p>登录后，开始留下关于 TA 的记忆。</p>
        </div>

        <form className={styles.form} onSubmit={submit} noValidate>
          <label className={styles.field}>
            <span>手机号</span>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={phone}
              maxLength={16}
              onChange={(event) => onPhoneChange(event.currentTarget.value)}
              placeholder="请输入手机号"
              autoFocus
            />
          </label>

          <label className={styles.field}>
            <span>验证码</span>
            <span className={styles.codeRow}>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                maxLength={6}
                disabled={!codeReady || busy}
                onChange={(event) => onCodeChange(event.currentTarget.value.replace(/\D/g, "").slice(0, 6))}
                placeholder={codeReady ? "请输入 6 位验证码" : "发送后填写"}
              />
              <button
                className={styles.sendButton}
                type="button"
                disabled={busy || phone.trim().length === 0}
                onClick={() => void onSendCode()}
              >
                {busy ? "发送中…" : codeReady ? "重新发送" : "发送验证码"}
              </button>
            </span>
          </label>

          <div className={styles.notice} role="status" aria-live="polite">
            {notice || (codeReady ? "验证码已发送，请留意短信。" : "\u00a0")}
          </div>

          <button
            className={styles.continueButton}
            type="submit"
            disabled={busy || !codeReady || code.length !== 6 || !agreementAccepted}
          >
            {busy && codeReady ? "登录中…" : "继续"}
          </button>

          <button className={styles.backButton} type="button" onClick={onLeave}>
            返回首页
          </button>

          <label className={styles.agreement}>
            <input
              type="checkbox"
              checked={agreementAccepted}
              onChange={(event) => onAgreementChange(event.currentTarget.checked)}
            />
            <span>
              继续即表示你已阅读并同意
              <a href="/terms">《用户协议》</a>
              <a href="/privacy">《隐私政策》</a>
            </span>
          </label>
        </form>
      </section>
    </main>
  );
}
