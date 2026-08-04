"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { recordTrustConsent, revokeCrisisSupportConsent } from "@/src/components/trust/trustConsentClient";
import { fetchCompanionSettingsJson } from "@/src/components/trust/companionSettingsClient";
import { loadNotificationPreferences, updateNotificationPreferences } from "@/src/components/trust/notificationPreferencesClient";

export default function CompanionSettingsPage() {
  const [enabled, setEnabled] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "unauthenticated" | "unavailable">("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [contacts, setContacts] = useState<Array<{ id: string; role: "owner" | "contact"; status: "pending" | "accepted" | "revoked" }>>([]);
  const [contactState, setContactState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [contactExternalId, setContactExternalId] = useState("");
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [notificationState, setNotificationState] = useState<"loading" | "ready" | "unavailable">("loading");
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoadState("loading");
    setMessage("");
    try {
      const { response, body: rawBody } = await fetchCompanionSettingsJson(signal);
      const body = rawBody as { crisisSupportEnabled?: unknown; error?: unknown };
      if (signal?.aborted) return;
      if (response.ok) {
        setEnabled(body.crisisSupportEnabled === true);
        setLoadState("ready");
      } else if (response.status === 401 || body.error === "UNAUTHENTICATED") {
        setLoadState("unauthenticated");
        setMessage("登录状态已失效。请重新登录后查看或变更危机支持预授权。");
      } else {
        setLoadState("unavailable");
        setMessage("无法读取当前设置，未会假称已开启或变更授权。请稍后重试。");
      }
    } catch {
      if (signal?.aborted) return;
      setLoadState("unavailable");
      setMessage("无法读取当前设置，未会假称已开启或变更授权。请稍后重试。");
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const loadContacts = useCallback(async () => {
    setContactState("loading");
    try {
      const response = await fetch("/api/account/crisis-contacts", { credentials: "same-origin", cache: "no-store" });
      const body = await response.json().catch(() => ({})) as { contacts?: unknown };
      if (!response.ok || !Array.isArray(body.contacts)) { setContactState("unavailable"); return; }
      setContacts(body.contacts.filter((value): value is { id: string; role: "owner" | "contact"; status: "pending" | "accepted" | "revoked" } => {
        if (typeof value !== "object" || value === null) return false;
        const contact = value as { id?: unknown; role?: unknown; status?: unknown };
        return typeof contact.id === "string" && (contact.role === "owner" || contact.role === "contact") && (contact.status === "pending" || contact.status === "accepted" || contact.status === "revoked");
      }));
      setContactState("ready");
    } catch { setContactState("unavailable"); }
  }, []);
  useEffect(() => { if (loadState === "ready") void loadContacts(); }, [loadContacts, loadState]);
  const loadNotifications = useCallback(async () => {
    setNotificationState("loading");
    try {
      const preferences = await loadNotificationPreferences();
      setNotificationEnabled(preferences.greetingNotificationsEnabled);
      setNotificationState("ready");
    } catch {
      setNotificationState("unavailable");
    }
  }, []);
  useEffect(() => { if (loadState === "ready") void loadNotifications(); }, [loadNotifications, loadState]);
  const change = async () => {
    if (loadState !== "ready" || busy) return;
    setBusy(true); setMessage("");
    try {
      if (enabled) { await revokeCrisisSupportConsent(); setEnabled(false); setMessage("已撤销危机支持预授权。"); }
      else { await recordTrustConsent("crisis_support_escalation"); setEnabled(true); setMessage("已预授权：即时风险时可创建不含原文的内部支持队列。"); }
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "UNAUTHENTICATED") {
        setLoadState("unauthenticated");
        setMessage("登录状态已失效。请重新登录后再变更危机支持预授权。");
      } else {
        setMessage("暂时无法更新设置；不会假称已变更。请稍后重试。");
      }
    }
    finally { setBusy(false); }
  };
  const requestContact = async () => {
    if (!contactExternalId.trim() || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/account/crisis-contacts", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ contactExternalId: contactExternalId.trim() }) });
      if (!response.ok) { setMessage("无法确认联系人申请；不会假称对方已收到通知。"); return; }
      setContactExternalId(""); setMessage("联系人申请已记录。对方需要自行登录忆见并明确接受；系统不会自动通知或发送消息。"); await loadContacts();
    } catch { setMessage("无法确认联系人申请；不会假称对方已收到通知。"); } finally { setBusy(false); }
  };
  const updateContact = async (consentId: string, action: "accept" | "revoke") => {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/account/crisis-contacts", { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ consentId, action }) });
      const body = await response.json().catch(() => ({})) as { updated?: unknown };
      if (!response.ok) { setMessage("无法确认联系人状态变更；不会假称已接受或已撤销。"); return; }
      if (body.updated !== true) { setMessage("联系人状态未发生可确认的变更，请刷新后再确认。"); await loadContacts(); return; }
      setMessage(action === "accept" ? "已接受此危机联系人授权。" : "已撤销此危机联系人授权。"); await loadContacts();
    } catch { setMessage("无法确认联系人状态变更；不会假称已接受或已撤销。"); } finally { setBusy(false); }
  };
  const changeNotifications = async () => {
    if (notificationState !== "ready" || busy) return;
    setBusy(true); setMessage("");
    try {
      if (notificationEnabled) {
        const saved = await updateNotificationPreferences(false);
        setNotificationEnabled(saved.greetingNotificationsEnabled);
        setMessage("已关闭问候提醒偏好。此操作不会影响阅读、对话或安全陪伴。");
        return;
      }
      if (typeof window === "undefined" || !("Notification" in window)) {
        setMessage("这台设备不支持浏览器提醒；没有保存已开启的偏好。");
        return;
      }
      const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      if (permission !== "granted") {
        setMessage("设备提醒未获允许；没有保存已开启的偏好。你可以随时在设备设置中更改。");
        return;
      }
      const saved = await updateNotificationPreferences(true);
      setNotificationEnabled(saved.greetingNotificationsEnabled);
      setMessage("已保存问候提醒偏好。提醒只允许显示通用的“忆见”提示，不包含 TA 姓名、聊天或记忆内容；设备和供应商投递仍会在可用前单独验证。");
    } catch {
      setMessage("暂时无法保存提醒偏好；不会假称已经开启。");
    } finally { setBusy(false); }
  };
  return <main style={{ padding: 24, maxWidth: 680 }}>
    <h1>陪伴安全设置</h1>
    <p>忆见始终不会代替紧急服务。此选项需由你明确开启；开启后，检测到即时风险时只创建不含聊天原文的内部支持队列，不代表已经联系任何外部人员。</p>
    {loadState === "loading" && <p role="status" aria-live="polite">正在读取当前设置…</p>}
    {loadState === "unauthenticated" && <p role="alert">{message}<Link className="ml-2 underline" href="/login">前往登录</Link></p>}
    {loadState === "unavailable" && <><p role="alert">{message}</p><button type="button" onClick={() => void load()}>重新读取</button></>}
    {loadState === "ready" && <button type="button" onClick={() => void change()} disabled={busy}>{busy ? "正在更新…" : enabled ? "撤销危机支持预授权" : "预授权内部危机支持"}</button>}
    {loadState === "ready" && <section><h2>普通问候提醒</h2><p>这是可选的账号偏好。锁屏或通知内容只能是通用的“忆见”提示，不能显示 TA 姓名、聊天、照片、记忆或健康信息。当前不会保存设备标识，也不会因开启偏好而声称已发送任何提醒。</p>{notificationState === "loading" && <p role="status">正在读取提醒偏好…</p>}{notificationState === "unavailable" && <><p role="alert">暂时无法读取提醒偏好；不会假称已开启。</p><button type="button" onClick={() => void loadNotifications()} disabled={busy}>重新读取</button></>}{notificationState === "ready" && <button type="button" onClick={() => void changeNotifications()} disabled={busy}>{busy ? "正在更新…" : notificationEnabled ? "关闭问候提醒" : "开启问候提醒"}</button>}</section>}
    {loadState === "ready" && <section><h2>危机联系人（候选功能）</h2><p>仅可邀请已验证忆见账户；对方必须自行接受。这里不会发送短信、消息或代表你联系任何人。</p><label>对方忆见账户标识<input value={contactExternalId} onChange={(event) => setContactExternalId(event.currentTarget.value)} /></label><button type="button" disabled={busy || !contactExternalId.trim()} onClick={() => void requestContact()}>发起联系人申请</button>{contactState === "loading" && <p role="status">正在读取联系人状态…</p>}{contactState === "unavailable" && <p role="alert">联系人候选功能暂不可用；未创建或通知任何联系人。</p>}{contactState === "ready" && <ul>{contacts.map((contact) => <li key={contact.id}>{contact.status === "accepted" ? "已接受的危机联系人" : contact.status === "pending" ? "等待对方接受的联系人申请" : "已撤销的联系人授权"}{contact.status === "pending" && contact.role === "contact" && <button type="button" disabled={busy} onClick={() => void updateContact(contact.id, "accept")}>接受</button>}{contact.status !== "revoked" && <button type="button" disabled={busy} onClick={() => void updateContact(contact.id, "revoke")}>撤销授权</button>}</li>)}</ul>}</section>}
    {message && loadState === "ready" && <p role="status">{message}</p>}
  </main>;
}
