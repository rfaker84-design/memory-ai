"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { fetchReportJson, prepareReportSubmission, type PendingReportSubmission } from "./reportIntakeClient";

type Report = { id: string; category: string; requestedAction: string; status: string; createdAt: string; resolvedAt: string | null };

export function ReportIntake() {
  const [reports, setReports] = useState<Report[]>([]);
  const [details, setDetails] = useState("");
  const [category, setCategory] = useState("rights");
  const [requestedAction, setRequestedAction] = useState("review");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "unauthenticated" | "unavailable">("loading");
  const pendingSubmission = useRef<PendingReportSubmission | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoadState("loading");
    try {
      const { response, body } = await fetchReportJson("/api/reports", { credentials: "include", cache: "no-store" }, fetch, signal);
      if (signal?.aborted) return;
      const reportBody = body as { reports?: Report[]; error?: string };
      if (response.ok) {
        setReports(reportBody.reports ?? []);
        setMessage(null);
        setLoadState("ready");
      } else if (reportBody.error === "UNAUTHENTICATED") {
        setMessage("请先登录后提交应用内工单。非登录状态的权利或隐私请求渠道尚未配置；请勿向未核验地址发送身份材料、照片、声音或聊天内容。");
        setLoadState("unauthenticated");
      } else {
        setMessage("暂时无法读取工单状态；尚未提交新的工单。请恢复网络后刷新。");
        setLoadState("unavailable");
      }
    } catch {
      if (signal?.aborted) return;
      setMessage("暂时无法读取工单状态；尚未提交新的工单。请恢复网络后刷新。");
      setLoadState("unavailable");
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true); setMessage(null);
    const submission = prepareReportSubmission(pendingSubmission.current, { category, requestedAction, details });
    pendingSubmission.current = submission;
    try {
      const { response, body } = await fetchReportJson("/api/reports", { method: "POST", credentials: "include", headers: { "content-type": "application/json", "idempotency-key": submission.idempotencyKey }, body: JSON.stringify({ category, subjectType: "other", subjectId: null, requestedAction, details }) });
      const reportBody = body as { report?: Report; error?: string };
      if (!response.ok) {
        if (reportBody.error === "UNAUTHENTICATED") {
          setMessage("登录状态已失效。请重新登录后再提交；这份尚未确认受理的说明仍只保留在当前页面内。");
          setLoadState("unauthenticated");
        } else {
          setMessage("暂时无法确认是否已受理。请勿刷新或修改这份说明；恢复连接后再次提交会安全复用同一请求。");
        }
        return;
      }
      pendingSubmission.current = null;
      setReports((current) => [reportBody.report!, ...current]); setDetails(""); setMessage("已受理。工单状态会显示在此页面。"); setLoadState("ready");
    } catch {
      setMessage("暂时无法确认是否已受理。请勿刷新或修改这份说明；恢复连接后再次提交会安全复用同一请求。");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadState === "loading") return <section className="mt-8 rounded-xl border border-[#d5b172]/25 p-5" aria-labelledby="report-intake-title"><h2 id="report-intake-title" className="text-xl font-semibold">应用内投诉与举报</h2><p role="status" aria-live="polite">正在确认登录状态…</p></section>;
  if (loadState === "unauthenticated") return <section className="mt-8 rounded-xl border border-[#d5b172]/25 p-5" aria-labelledby="report-intake-title"><h2 id="report-intake-title" className="text-xl font-semibold">应用内投诉与举报</h2><p role="alert">{message ?? "请先登录后提交应用内工单。"}</p><Link className="mt-3 inline-block underline" href="/login">前往登录</Link></section>;
  if (loadState === "unavailable") return <section className="mt-8 rounded-xl border border-[#d5b172]/25 p-5" aria-labelledby="report-intake-title"><h2 id="report-intake-title" className="text-xl font-semibold">应用内投诉与举报</h2><p role="alert">{message ?? "暂时无法读取工单状态。"}</p><button className="mt-3 rounded border border-[#d5b172]/50 px-4 py-2" type="button" onClick={() => void load()}>重新读取</button></section>;

  return <section className="mt-8 rounded-xl border border-[#d5b172]/25 p-5" aria-labelledby="report-intake-title">
    <h2 id="report-intake-title" className="text-xl font-semibold">应用内投诉与举报</h2>
    <p className="mt-2 text-sm text-[#d8bfaa]">请勿在描述中提交身份证号、银行卡号、密码或短信验证码。证据材料仅通过受控渠道另行提供。</p>
    <form className="mt-4 space-y-3" onSubmit={submit}>
      <label className="block">类型<select className="ml-2 rounded bg-[#0b0a08] p-2" value={category} onChange={(event) => setCategory(event.target.value)}><option value="rights">权利与内容</option><option value="privacy">隐私</option><option value="safety">安全</option><option value="payment">支付与退款</option><option value="account">账户</option><option value="other">其他</option></select></label>
      <label className="block">请求<select className="ml-2 rounded bg-[#0b0a08] p-2" value={requestedAction} onChange={(event) => setRequestedAction(event.target.value)}><option value="review">请求审核</option><option value="remove_content">请求下架或删除</option><option value="refund">退款协助</option><option value="account_help">账户协助</option><option value="other">其他</option></select></label>
      <label className="block">说明<textarea className="mt-2 block w-full rounded bg-[#0b0a08] p-3" required maxLength={2000} value={details} onChange={(event) => setDetails(event.target.value)} /></label>
      <button className="rounded bg-[#d5b172] px-4 py-2 text-[#1b120a]" type="submit" disabled={submitting}>{submitting ? "正在提交…" : "提交工单"}</button>
    </form>
    {message ? <p className="mt-3" role="status">{message}</p> : null}
    {reports.length ? <ul className="mt-5 space-y-2" aria-label="我的工单">{reports.map((report) => <li key={report.id}>#{report.id.slice(0, 8)} · {report.category} · {report.status} · {new Date(report.createdAt).toLocaleString("zh-CN")}</li>)}</ul> : null}
  </section>;
}
