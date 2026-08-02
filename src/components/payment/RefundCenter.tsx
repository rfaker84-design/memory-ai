"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MemoryButton } from "../memory-ui";
import {
  createRefundIdempotencyKey,
  createRefundRequest,
  describeRefundEligibility,
  describeRefundRequest,
  loadPaymentSnapshot,
  loadRefundRequests,
  PaymentExperienceRequestError,
  type PaymentSnapshot,
  type RefundRequest,
} from "./memoryExperienceClient";
import styles from "./RefundCenter.module.css";
import { refundPolicy } from "./refundPolicy";

type OwnedMemory = { id: string; name: string };

function toMemories(value: unknown): OwnedMemory[] {
  return Array.isArray(value)
    ? value.flatMap((item) => typeof item === "object" && item !== null && typeof (item as Record<string, unknown>).id === "string" && typeof (item as Record<string, unknown>).name === "string"
      ? [{ id: (item as Record<string, string>).id, name: (item as Record<string, string>).name }]
      : [])
    : [];
}

export function RefundCenter() {
  const [memories, setMemories] = useState<OwnedMemory[]>([]);
  const [memoryId, setMemoryId] = useState("");
  const [snapshot, setSnapshot] = useState<PaymentSnapshot | null>(null);
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [statusReady, setStatusReady] = useState(false);
  const [loadedMemoryId, setLoadedMemoryId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const requestKey = useRef<string | null>(null);
  const statusRequest = useRef(0);

  const load = useCallback(async (selected: string) => {
    const request = ++statusRequest.current;
    const isCurrent = () => statusRequest.current === request;
    setLoading(true); setStatusReady(false); setLoadedMemoryId(null); setSnapshot(null); setRefunds([]); setNotice("");
    try {
      if (!selected) {
        const response = await fetch("/api/memories", { credentials: "same-origin", cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (!isCurrent()) return;
        if (!response.ok) throw new PaymentExperienceRequestError(response.status, typeof body.error === "string" ? body.error : "MEMORIES_UNAVAILABLE");
        const nextMemories = toMemories(body);
        setMemories(nextMemories);
        const first = nextMemories[0]?.id ?? "";
        setMemoryId(first);
        if (!first) setStatusReady(true);
        return;
      }
      const [nextSnapshot, nextRefunds] = await Promise.all([loadPaymentSnapshot(selected), loadRefundRequests(selected)]);
      if (!isCurrent()) return;
      setSnapshot(nextSnapshot); setRefunds(nextRefunds); setLoadedMemoryId(selected); setStatusReady(true);
    } catch (error) {
      if (!isCurrent()) return;
      setNotice(error instanceof PaymentExperienceRequestError && error.status === 401
        ? "登录状态已失效，请完成短信登录后查看退款状态。"
        : "暂时无法读取订单或退款状态；未提交任何退款申请。请稍后刷新。");
    } finally { if (isCurrent()) setLoading(false); }
  }, []);

  useEffect(() => {
    void load(memoryId);
    return () => { statusRequest.current += 1; };
  }, [load, memoryId]);

  const chooseMemory = (nextMemoryId: string) => {
    requestKey.current = null; setReason(""); setMemoryId(nextMemoryId);
  };

  const submit = async () => {
    const orderNo = snapshot?.orders.find((order) => order.status === "paid")?.orderNo ?? snapshot?.orders[0]?.orderNo;
    if (!statusReady || loadedMemoryId !== memoryId || !memoryId || !orderNo || !reason.trim() || submitting) return;
    setSubmitting(true); setNotice("");
    try {
      requestKey.current ??= createRefundIdempotencyKey();
      const refund = await createRefundRequest({ memoryId, orderNo, reason: reason.trim(), idempotencyKey: requestKey.current });
      setRefunds((current) => [refund, ...current.filter((item) => item.id !== refund.id)]);
      requestKey.current = null;
    } catch (error) {
      setNotice(error instanceof PaymentExperienceRequestError && error.status === 401
        ? "登录状态已失效，退款申请尚未提交。"
        : "无法确认退款申请是否已提交；不会自动重试。你可以在确认内容后明确重试。");
    } finally { setSubmitting(false); }
  };

  const latestRefund = refunds[0];
  const latestOrder = snapshot?.orders.find((order) => order.status === "paid") ?? snapshot?.orders[0];

  return <section className={styles.center} aria-label="退款申请与状态">
    <p className={styles.eyebrow}>购买与退款</p>
    <h2>退款申请与状态</h2>
    <p className={styles.intro}>受理条件：仅可为已完成付款且尚未退款的订单提交申请；未支付、已取消、失败、过期或已退款订单会明确显示不符合条件。</p>
    <ul className={styles.rules}><li>{refundPolicy.noReason}</li><li>{refundPolicy.afterUse}</li><li>{refundPolicy.manualReview}</li><li>{refundPolicy.entitlementEnd}</li></ul>
    {memories.length > 1 && <label className={styles.selector}>选择 TA<select value={memoryId} onChange={(event) => chooseMemory(event.currentTarget.value)}>{memories.map((memory) => <option value={memory.id} key={memory.id}>{memory.name}</option>)}</select></label>}
    {loading && <p className={styles.muted} role="status">正在核验订单与退款状态…</p>}
    {!loading && !memoryId && <p className={styles.muted}>还没有可查询的 TA。创建 TA 并完成购买后，可在这里查看退款资格和处理结果。</p>}
    {!loading && statusReady && loadedMemoryId === memoryId && latestRefund && <div className={styles.status} aria-live="polite"><strong>{describeRefundRequest(latestRefund).title}</strong><span>资格结果：{describeRefundEligibility(latestRefund.eligibility)}</span><p>{describeRefundRequest(latestRefund).detail}</p></div>}
    {!loading && statusReady && loadedMemoryId === memoryId && !latestRefund && latestOrder && <div className={styles.form}><p className={styles.order}>订单 {latestOrder.orderNo} · {latestOrder.status === "paid" ? "已完成付款，可提交申请" : "当前订单将由系统核验资格"}</p><p className={styles.order}>{refundPolicy.noReason}{refundPolicy.afterUse}</p><label>申请说明<textarea value={reason} maxLength={500} placeholder="请简要说明退款原因" onChange={(event) => { requestKey.current = null; setReason(event.currentTarget.value); }} /></label><MemoryButton variant="secondary" disabled={!reason.trim() || !statusReady || loadedMemoryId !== memoryId} loading={submitting} onClick={() => void submit()}>{submitting ? "正在提交申请" : "提交退款申请"}</MemoryButton></div>}
    {!loading && statusReady && loadedMemoryId === memoryId && !latestRefund && !latestOrder && memoryId && <p className={styles.muted}>尚未找到支付订单，因此暂时没有可申请退款的订单。</p>}
    <button className={styles.refresh} type="button" disabled={loading || submitting} onClick={() => void load(memoryId)}>{loading ? "正在刷新" : "刷新退款状态"}</button>
    {notice && <p className={styles.notice} role="alert">{notice}</p>}
  </section>;
}
