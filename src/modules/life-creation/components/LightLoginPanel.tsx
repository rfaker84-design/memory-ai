interface LightLoginPanelProps {
  disabled?: boolean;
  onStart: () => void;
}

export function LightLoginPanel({ disabled = false, onStart }: LightLoginPanelProps) {
  return (
    <form
      className="light-login"
      onSubmit={(event) => {
        event.preventDefault();
        onStart();
      }}
    >
      <div className="light-login__copy">
        <h1>进入忆见</h1>
        <p>有些思念，值得被温柔地保存。</p>
      </div>

      <label className="light-login__field">
        <span>手机号</span>
        <input inputMode="tel" placeholder="请输入手机号" disabled={disabled} />
      </label>

      <label className="light-login__field">
        <span>验证码</span>
        <input inputMode="numeric" placeholder="请输入验证码" disabled={disabled} />
      </label>

      <label className="light-login__agreement">
        <input type="checkbox" defaultChecked disabled={disabled} />
        <span>我已阅读并同意服务协议与隐私政策</span>
      </label>

      <button className="light-login__button" type="submit" disabled={disabled}>
        {disabled ? "正在连接" : "开始连接"}
      </button>
    </form>
  );
}
