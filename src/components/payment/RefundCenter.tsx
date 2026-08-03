"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MemoryButton } from "../memory-ui";
import styles from "./RefundCenter.module.css";
import { refundPolicy } from "./refundPolicy";

type Order = { orderNo: string; status: string; productId: string; amountFen: number };
type Refund = {
  id: string;
  orderNo: string;
  requestNo: string;
  reason: "unused_purchase" | "duplicate_charge" | "service_failure";
  status: "manual_review" | "requested" | "succeeded" | "rejected";
  createdAt: string;
  resolvedAt: string | null;
};
type RefundReason = Refund["reason"];

const reasonCopy: Record<RefundReason, string> = {
  unused_purchase: "未使用购买",
  duplicate_charge: "疑似重复扣款",
  service_failure: "平台故障无法使用",
};

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => !!row && typeof row === "object") : [];
}

function parseOrders(value: unknown): Order[] {
  return asRecords(value).flatMap((row) =>
    typeof row.orderNo === "string" && typeof row.status === "string" && typeof row.productId === "string" && typeof row.amountFen === "number"
      ? [{ orderNo: row.orderNo, status: row.status, productId: row.productId, amountFen: row.amountFen }]
      : [],
  );
}

function parseRefunds(value: unknown): Refund[] {
  return asRecords(value).flatMap((row) =>
    typeof row.id === "string" && typeof row.orderNo === "string" && typeof row.requestNo === "string"
      && (row.reason === "unused_purchase" || row.reason === "duplicate_charge" || row.reason === "service_failure")
      && (row.status === "manual_review" || row.status === "requested" || row.status === "succeeded" || row.status === "rejected")
      && typeof row.createdAt === "string"
      ? [{ id: row.id, orderNo: row.orderNo, requestNo: row.requestNo, reason: row.reason, status: row.status, createdAt: row.createdAt, resolvedAt: typeof row.resolvedAt === "string" ? row.resolvedAt : null }]
      : [],
  );
}

function description(refund: Refund): string {
  if (refund.status === "succeeded") return "退款已由支付渠道确认；对应体验权益已结束。";
  if (refund.status === "rejected") return "本次申请未获通过。你可以在投诉入口补充与订单相关的必要说明。";
  if (refund.status === "manual_review") return "申请正在人工审核中；结果会在此处更新。";
  return "申请已提交，正在核验订单与退款条件。";
}

function refundKey() {
  const token = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `commerce-refund-${token}`;
}

export function RefundCenter() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [reason, setReason] = useState<RefundReason>("unused_purchase");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const retryKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setNotice("");
    try {
      const [ordersResponse, refundsResponse] = await Promise.all([
        fetch("/api/commerce/orders", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/commerce/refunds", { credentials: "same-origin", cache: "no-store" }),
      ]);
      const [ordersBody, refundsBody] = await Promise.all([ordersResponse.json().catch(() => ({})), refundsResponse.json().catch(() => ({}))]);
      if (ordersResponse.status === 401 || refundsResponse.status === 401) {
        setNotice("登录状态已失效，请重新登录后查看退款状态。");
        return;
      }
      if (!ordersResponse.ok || !refundsResponse.ok) {
        setNotice("暂时无法读取订单或退款状态；未提交任何退款申请。请稍后刷新。");
        return;
      }
      setOrders(parseOrders((ordersBody as Record<string, unknown>).orders));
      setRefunds(parseRefunds((refundsBody as Record<string, unknown>).refunds));
    } catch {
      setNotice("暂时无法读取订单或退款状态；未提交任何退款申请。请稍后刷新。");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const paidOrder = orders.find((order) => order.status === "paid");
  const submit = async () => {
    if (!paidOrder || submitting) return;
    setSubmitting(true); setNotice("");
    const idempotencyKey = retryKey.current ?? refundKey();
    retryKey.current = idempotencyKey;
    try {
      const response = await fetch("/api/commerce/refunds", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ orderNo: paidOrder.orderNo, reason }),
      });
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) {
        setNotice(response.status === 409 ? "该订单当前不符合退款申请条件。" : "无法确认退款申请是否已提交；不会自动重试。请在确认后明确重试。");
        return;
      }
      const refund = parseRefunds([body.refund])[0];
      if (!refund) {
        setNotice("退款申请状态暂时无法确认；不会自动重试。请稍后刷新。");
        return;
      }
      retryKey.current = null;
      setRefunds((current) => [refund, ...current.filter((item) => item.id !== refund.id)]);
      setNotice("退款申请已提交，处理状态会在这里更新。");
    } catch {
      setNotice("无法确认退款申请是否已提交；不会自动重试。请在确认后明确重试。");
    } finally { setSubmitting(false); }
  };

  return <section className={styles.center} aria-label="退款申请与状态">
    <p className={styles.eyebrow}>购买与退款</p><h2>退款申请与状态</h2>
    <p className={styles.intro}>{refundPolicy.noReason} {refundPolicy.afterUse} {refundPolicy.manualReview} {refundPolicy.entitlementEnd} 状态和最终结果仅向当前登录账户显示。</p>
    {loading && <p className={styles.muted} role="status">正在核验订单与退款状态…</p>}
    {!loading && refunds.map((refund) => <div className={styles.status} key={refund.id} aria-live="polite"><strong>{refund.status === "succeeded" ? "退款已完成" : refund.status === "rejected" ? "退款申请未通过" : "退款申请处理中"}</strong><span>订单 {refund.orderNo} · {reasonCopy[refund.reason]}</span><p>{description(refund)}</p></div>)}
    {!loading && !refunds.length && paidOrder && <div className={styles.form}><p className={styles.order}>可申请订单：{paidOrder.productId} · ¥{(paidOrder.amountFen / 100).toFixed(2)}</p><label>申请原因<select value={reason} onChange={(event) => setReason(event.target.value as RefundReason)}>{Object.entries(reasonCopy).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><MemoryButton variant="secondary" loading={submitting} onClick={() => void submit()}>{submitting ? "正在提交申请" : "提交退款申请"}</MemoryButton></div>}
    {!loading && !refunds.length && !paidOrder && <p className={styles.muted}>尚未找到已付款订单，因此暂时没有可申请退款的订单。</p>}
    <button className={styles.refresh} type="button" disabled={loading || submitting} onClick={() => void load()}>{loading ? "正在刷新" : "刷新退款状态"}</button>
    {notice && <p className={styles.notice} role="alert">{notice}</p>}
  </section>;
}
