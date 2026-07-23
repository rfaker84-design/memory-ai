"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MemoryButton } from "../memory-ui";
import {
  createExperienceCheckout,
  createPaymentIdempotencyKey,
  describeExperienceStatus,
  loadPaymentSnapshot,
  PaymentExperienceRequestError,
  type PaymentSnapshot,
} from "./memoryExperienceClient";
import styles from "./MemoryExperienceOffer.module.css";
import { recordBusinessView } from "../business-metrics/businessMetricsClient";
import { recordTrustConsent, TrustConsentRequestError } from "../trust/trustConsentClient";

type Props = { memoryId: string; tone?: "dark" | "light" };

function readableFailure(error: unknown) {
  if (error instanceof PaymentExperienceRequestError && error.code === "WECHAT_PAY_NOT_CONFIGURED") return "支付暂未开放；不会创建任何体验权益。";
  if (error instanceof PaymentExperienceRequestError && error.code === "PAYMENT_PRODUCT_NOT_CONFIGURED") return "体验购买暂未开放；不会创建任何体验权益。";
  if (error instanceof PaymentExperienceRequestError && error.status === 401) return "登录状态已失效，请重新完成登录后再查看购买状态。";
  if (!(error instanceof PaymentExperienceRequestError)) return "网络连接暂时中断，尚未创建或确认任何体验权益。";
  return "暂时无法确认支付状态；未确认前不会显示体验已生效。";
}

export function MemoryExperienceOffer({ memoryId, tone = "dark" }: Props) {
  const [snapshot, setSnapshot] = useState<PaymentSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [purchaseAccepted, setPurchaseAccepted] = useState(false);
  const checkoutKey = useRef<string | null>(null);
  const viewedRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setNotice("");
    try {
      setSnapshot(await loadPaymentSnapshot(memoryId));
      checkoutKey.current = null;
    } catch (error) {
      setNotice(readableFailure(error));
    } finally {
      setLoading(false);
    }
  }, [memoryId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => { setPurchaseAccepted(false); }, [memoryId]);

  useEffect(() => {
    if (!viewedRef.current) {
      viewedRef.current = true;
      recordBusinessView("payment_entry_viewed", memoryId);
    }
  }, [memoryId]);

  const beginPurchase = async () => {
    if (checkoutLoading || !purchaseAccepted) return;
    setCheckoutLoading(true);
    setNotice("");
    try {
      await recordTrustConsent("commercial_use", memoryId);
      checkoutKey.current ??= createPaymentIdempotencyKey();
      const paymentUrl = await createExperienceCheckout(memoryId, checkoutKey.current);
      window.location.assign(paymentUrl);
    } catch (error) {
      setNotice(error instanceof TrustConsentRequestError
        ? "购买确认暂未安全记录，尚未创建订单或跳转支付；恢复连接后可明确重试。"
        : readableFailure(error));
    } finally {
      setCheckoutLoading(false);
    }
  };

  const status = snapshot
    ? describeExperienceStatus(snapshot)
    : { title: "忆见初遇体验", detail: "49元 · 30天 · 1个 TA · 100次 AI 回复。一次性购买，不自动续费。", canPurchase: true };

  return (
    <section className={`${styles.offer} ${tone === "light" ? styles.light : ""}`} aria-label="忆见初遇体验">
      <p className={styles.eyebrow}>在这句回应之后</p>
      <h2 className={styles.title}>{status.title}</h2>
      <p className={styles.product}>49元 · 30天 · 1个 TA · 100次 AI 回复</p>
      <p className={styles.detail}>{loading ? "正在确认已有体验与支付状态…" : status.detail}</p>
      {status.canPurchase && <div className={styles.trust}><p>一次性购买，不自动续费。付款成功后才开通；取消、失败或过期不会获得权益。退款处理完成后，这份体验权益会结束。</p><p>购买前请阅读 <a href="/terms">用户协议</a>、<a href="/privacy">隐私政策</a> 与 <a href="/authorization">AI 内容说明</a>；退款申请和数据删除入口在 <a href="/report">投诉与删除</a>。</p><label><input type="checkbox" checked={purchaseAccepted} onChange={(event) => setPurchaseAccepted(event.currentTarget.checked)} /><span>我已年满 18 周岁，理解这是 AI 服务，并确认价格、期限、额度、一次性收费及退款后权益结束。</span></label></div>}
      <div className={styles.actions}>
        {status.canPurchase && <MemoryButton variant="primary" loading={checkoutLoading} disabled={!purchaseAccepted} onClick={() => void beginPurchase()}>{checkoutLoading ? "正在前往微信支付" : "购买忆见初遇体验"}</MemoryButton>}
        <button type="button" className={styles.refresh} onClick={() => void refresh()} disabled={loading || checkoutLoading}>{loading ? "正在刷新" : "刷新支付状态"}</button>
      </div>
      {notice && <p className={styles.notice} role="alert">{notice}</p>}
    </section>
  );
}
