"use client";

import { useState } from "react";

const trustItems = [
  "用户协议",
  "隐私政策",
  "数字人授权声明",
  "AI生成内容说明",
  "逝者数字重建说明",
  "照片/声音/视频资料授权",
  "数据导出与删除说明",
  "肖像权与声音权权益保护",
  "侵权投诉入口",
  "未成年人保护",
];

export default function LoginPage() {
  const [checked, setChecked] = useState(false);
  const [expanded, setExpanded] = useState(false);

  return (
    <main className="login-page">
      <div className="stars" />
      <div className="glow glow-a" />
      <div className="glow glow-b" />

      <section className="login-core">
        <div className="mark">✦</div>

        <p className="eyebrow">忆见 · 进入记忆宇宙</p>

        <h1>你的记忆世界</h1>

        <p className="subtitle">
          每一次想念
          <br />
          都会被听见
        </p>

        <div className="login-form">
          <input placeholder="输入手机号" inputMode="tel" />
          <button className="code-btn" disabled={!checked}>
            获取验证码
          </button>

          <div className="third-login">
            <button disabled={!checked}>微信登录</button>
            <button disabled={!checked}>Apple 登录</button>
          </div>
        </div>
      </section>

      <section className="trust-panel">
        <label className="agree-line">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span>
            我已阅读并同意
            <b>《用户协议》</b>
            <b>《隐私政策》</b>
          </span>
        </label>

        <button className="expand-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? "收起忆见授权说明" : "查看忆见授权说明"}
        </button>

        {expanded && (
          <div className="trust-list">
            {trustItems.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        )}

        <p className="legal-note">
          我确认拥有或已取得上传照片、声音、视频、故事资料的合法授权。
          忆见生成内容为 AI 重建结果，不代表真实人类意识，仅用于情感陪伴与纪念用途。
        </p>
      </section>

      <style jsx>{`
        .login-page {
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          background: #030302;
          color: #fff;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 44px 20px 150px;
        }

        .stars {
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(circle at 20% 30%, rgba(255,255,255,.9) 0 1px, transparent 1.5px),
            radial-gradient(circle at 70% 20%, rgba(255,255,255,.65) 0 1px, transparent 1.5px),
            radial-gradient(circle at 40% 80%, rgba(255,255,255,.5) 0 1px, transparent 1.5px),
            radial-gradient(circle at 90% 70%, rgba(255,255,255,.7) 0 1px, transparent 1.5px);
          background-size: 160px 160px, 220px 220px, 280px 280px, 360px 360px;
          opacity: 0.58;
          animation: drift 28s linear infinite;
        }

        .glow {
          position: absolute;
          border-radius: 999px;
          filter: blur(70px);
          pointer-events: none;
        }

        .glow-a {
          width: 420px;
          height: 420px;
          background: rgba(232, 201, 122, 0.16);
          top: 18%;
          left: 50%;
          transform: translateX(-50%);
        }

        .glow-b {
          width: 280px;
          height: 280px;
          background: rgba(255, 255, 255, 0.08);
          bottom: 18%;
          right: 12%;
        }

        .login-core {
          position: relative;
          z-index: 2;
          width: min(420px, 100%);
          text-align: center;
        }

        .mark {
          font-size: 24px;
          color: #ead28f;
          margin-bottom: 18px;
          animation: pulse 3.2s ease-in-out infinite;
        }

        .eyebrow {
          margin: 0 0 14px;
          color: rgba(234, 210, 143, 0.86);
          font-size: 13px;
          letter-spacing: 0.18em;
        }

        h1 {
          margin: 0;
          font-size: clamp(36px, 8vw, 54px);
          line-height: 1.05;
          letter-spacing: -0.06em;
          font-weight: 800;
        }

        .subtitle {
          margin: 18px 0 34px;
          color: rgba(255,255,255,0.72);
          font-size: 18px;
          line-height: 1.7;
        }

        .login-form {
          display: grid;
          gap: 14px;
        }

        input {
          height: 54px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.055);
          color: white;
          padding: 0 22px;
          font-size: 16px;
          outline: none;
          backdrop-filter: blur(20px);
        }

        input::placeholder {
          color: rgba(255,255,255,0.42);
        }

        .code-btn {
          height: 54px;
          border: 0;
          border-radius: 999px;
          background: linear-gradient(90deg, #fff1bc, #d9a84f);
          color: #1a1204;
          font-size: 16px;
          font-weight: 700;
        }

        button:disabled {
          opacity: 0.42;
        }

        .third-login {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 4px;
        }

        .third-login button {
          height: 48px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.11);
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.78);
          backdrop-filter: blur(18px);
        }

        .trust-panel {
          position: fixed;
          left: 50%;
          bottom: 22px;
          transform: translateX(-50%);
          z-index: 3;
          width: min(680px, calc(100% - 32px));
          text-align: center;
          color: rgba(255,255,255,0.56);
          font-size: 12px;
          line-height: 1.7;
        }

        .agree-line {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .agree-line input {
          width: 14px;
          height: 14px;
          accent-color: #e8c97a;
        }

        .agree-line b {
          color: rgba(255,232,180,0.86);
          font-weight: 500;
          margin-left: 4px;
        }

        .expand-btn {
          margin-top: 6px;
          border: 0;
          background: transparent;
          color: rgba(255,232,180,0.78);
          font-size: 12px;
          cursor: pointer;
        }

        .trust-list {
          margin: 10px auto 6px;
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 7px;
        }

        .trust-list span {
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.045);
          border-radius: 999px;
          padding: 4px 10px;
        }

        .legal-note {
          margin: 8px auto 0;
          max-width: 620px;
          color: rgba(255,255,255,0.36);
        }

        @keyframes drift {
          from { transform: translateY(0); }
          to { transform: translateY(-80px); }
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.45; transform: scale(0.94); }
          50% { opacity: 1; transform: scale(1.08); }
        }

        @media (max-width: 640px) {
          .login-page {
            justify-content: flex-start;
            padding-top: 96px;
          }

          .trust-panel {
            bottom: 18px;
          }

          .third-login {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
