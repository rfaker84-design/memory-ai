"use client";

import { useEffect, useState } from "react";

type Task = { kind: string; status: string; completedAt: string | null; completionReceiptAvailable: boolean };
type Progress = {
  requestId: string;
  status: string;
  requestedAt: string;
  contentDeleteAfter: string;
  providerDeleteAfter: string;
  backupExpireAfter: string;
  legalHold: boolean;
  completedAt: string | null;
  tasks: Task[];
};

const format = (value: string | null) => value ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "尚未完成";

export function AccountDeletionPanel() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const response = await fetch("/api/account/deletion", { credentials: "include", cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { deletion?: Progress; error?: string };
    if (response.ok) setProgress(body.deletion ?? null);
    else if (body.error !== "UNAUTHENTICATED") setMessage(body.error ?? "无法获取注销状态");
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const submit = async () => {
    setMessage(null);
    const response = await fetch("/api/account/deletion", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE_ACCOUNT" }),
    });
    const body = await response.json().catch(() => ({})) as { deletion?: Progress; error?: string };
    if (response.status === 403 && body.error === "REAUTH_REQUIRED") {
      setMessage("为保护你的账户，请重新完成短信登录后，在 5 分钟内返回此页确认注销。");
      setConfirming(false);
      return;
    }
    if (!response.ok) {
      setMessage(body.error ?? "提交注销申请失败，请稍后重试。");
      return;
    }
    setProgress(body.deletion ?? null);
    setConfirming(false);
    setMessage("注销申请已受理。你已退出登录；本页会使用仅限注销进度的回执 Cookie 显示后续状态。");
  };

  if (loading) return <main><p>正在读取账户注销状态…</p></main>;
  if (progress) return <main aria-live="polite">
    <h1>账户注销进度</h1>
    <p>状态：{progress.status}{progress.legalHold ? "（存在法定保全范围，相关资料不会用于产品功能）" : ""}</p>
    <ul>
      <li>在线 TA、聊天、照片、声音和视频：不晚于 {format(progress.contentDeleteAfter)} 删除。</li>
      <li>COS 原件、派生文件与 Provider 副本：不晚于 {format(progress.providerDeleteAfter)} 删除并留存删除回执。</li>
      <li>不可逐用户改写的备份：自然轮转，最长至 {format(progress.backupExpireAfter)}；恢复时会重新应用删除墓碑。</li>
      <li>订单、退款、发票、投诉和法定记录：与内容资料隔离，只保留最低必要字段。</li>
    </ul>
    <h2>执行回执</h2>
    <ul>{progress.tasks.map((task) => <li key={task.kind}>{task.kind}：{task.status}{task.completedAt ? `（${format(task.completedAt)}）` : ""}{task.completionReceiptAvailable ? "，回执已留存" : ""}</li>)}</ul>
    {progress.completedAt ? <p>注销完成回执：{format(progress.completedAt)}。你的内容已停止用于产品、训练或生成。</p> : <p>请求编号：{progress.requestId}</p>}
  </main>;

  return <main>
    <h1>注销账户</h1>
    <p>这是不可逆的账户操作。确认后，所有登录 Session、设备访问和旧 Cookie 会立即失效。</p>
    <ul>
      <li>TA、聊天、照片、声音和视频会停止使用，并在 7 天内从在线系统删除。</li>
      <li>COS、缩略图、生成视频与 Provider 副本会在 30 天内删除并记录回执。</li>
      <li>支付、退款、发票、投诉和法定审计记录不会与内容资料混存。</li>
    </ul>
    {message ? <p role="status">{message}</p> : null}
    {confirming ? <section aria-label="注销确认"><p>请确认：你理解注销后无法恢复内容，且将立即退出所有设备。</p><button type="button" onClick={() => void submit()}>确认注销账户</button><button type="button" onClick={() => setConfirming(false)}>取消</button></section> : <button type="button" onClick={() => setConfirming(true)}>申请注销</button>}
  </main>;
}
