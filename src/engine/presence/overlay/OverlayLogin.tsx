"use client";

import { DirectorConfig } from "../director/DirectorConfig";

type OverlayLoginProps = {
  onStart: () => void;
};

export function OverlayLogin({ onStart }: OverlayLoginProps) {
  const overlay = DirectorConfig.overlay;

  return (
    <div className="presence-overlay" style={{ "--overlay-width": `${overlay.width}px` } as React.CSSProperties}>
      <form
        className="presence-overlay__login"
        onSubmit={(event) => {
          event.preventDefault();
          onStart();
        }}
      >
        <div className="presence-overlay__text">
          <h1>进入忆见</h1>
          <p>有些思念，值得被温柔地保存。</p>
        </div>
        <input aria-label="手机号" inputMode="tel" placeholder="手机号" />
        <input aria-label="验证码" inputMode="numeric" placeholder="验证码" />
        <label className="presence-overlay__agreement">
          <input type="checkbox" defaultChecked />
          <span>我已阅读并同意服务协议</span>
        </label>
        <button type="submit">开始连接</button>
      </form>
    </div>
  );
}
