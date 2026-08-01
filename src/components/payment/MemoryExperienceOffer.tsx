"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MemoryButton } from "../memory-ui";
import {
  clearPaymentCheckoutRecovery,
  createExperienceCheckout,
  createPaymentIdempotencyKey,
  describeExperienceStatus,
  loadPaymentSnapshot,
  PaymentExperienceRequestError,
  readPaymentCheckoutRecovery,
  type PaymentSnapshot,
  writePaymentCheckoutRecovery,
} from "./memoryExperienceClient";
import styles from "./MemoryExperienceOffer.module.css";
import { recordBusinessView } from "../business-metrics/businessMetricsClient";
import { recordTrustConsent, TrustConsentRequestError } from "../trust/trustConsentClient";
import { refundPolicy } from "./refundPolicy";

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
  const [checkoutKey, setCheckoutKey] = useState<string | null>(null);
  const viewedRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setNotice("");
    try {
      const nextSnapshot = await loadPaymentSnapshot(memoryId);
      setSnapshot(nextSnapshot);
      const recovery = readPaymentCheckoutRecovery();
      if (recovery?.memoryId === memoryId) {
        const hasOpenOrder = nextSnapshot.orders.some((order) => order.status === "pending" || order.status === "paid");
        if (hasOpenOrder) {
          setCheckoutKey(recovery.idempotencyKey);
        } else if (nextSnapshot.orders.some((order) => ["failed", "cancelled", "expired", "refunded"].includes(order.status))) {
          clearPaymentCheckoutRecovery();
          setCheckoutKey(null);
        } else {
          setCheckoutKey(recovery.idempotencyKey);
        }
      } else {
        setCheckoutKey(null);
      }
    } catch (error) {
      setNotice(readableFailure(error));
    } finally {
      setLoading(false);
    }
  }, [memoryId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    setPurchaseAccepted(false);
    const recovery = readPaymentCheckoutRecovery();
    setCheckoutKey(recovery?.memoryId === memoryId ? recovery.idempotencyKey : null);
  }, [memoryId]);

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
      const key = checkoutKey ?? createPaymentIdempotencyKey();
      if (!writePaymentCheckoutRecovery({ memoryId, idempotencyKey: key })) {
        setNotice("当前浏览器无法安全保留支付恢复标识，尚未创建订单或跳转支付；请恢复后再试。");
        return;
      }
      setCheckoutKey(key);
      const paymentUrl = await createExperienceCheckout(memoryId, key);
      window.location.assign(paymentUrl);
    } catch (error) {
      setNotice(error instanceof TrustConsentRequestError
        ? "购买确认暂未安全记录，尚未创建订单或跳转支付；恢复连接后可明确重试。"
        : readableFailure(error));
    } finally {
      setCheckoutLoading(false);
    }
  };

  const resumePurchase = async () => {
    if (checkoutLoading || !checkoutKey) return;
    setCheckoutLoading(true);
    setNotice("");
    try {
      // This replays only the exact durable key saved before the original POST.
      const paymentUrl = await createExperienceCheckout(memoryId, checkoutKey);
      window.location.assign(paymentUrl);
    } catch (error) {
      setNotice(readableFailure(error));
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
      <h2 className={styles.title}>{status.canPurchase ? "想继续和TA说说话" : status.title}</h2>
      <p className={styles.product}>49元 · 30天 · 1个 TA · 100次 AI 回复</p>
      <p className={styles.detail}>{loading ? "正在确认已有体验与支付状态…" : status.detail}</p>
      {status.canPurchase && <div className={styles.trust}><p>一次性购买，不自动续费。付款成功后才开通；取消、失败或过期不会获得权益。</p><p>退款申请条件：仅限已完成付款且尚未退款的订单；未支付、已取消、失败、过期或已退款订单不符合系统受理条件。</p><p>{refundPolicy.noReason}</p><p>{refundPolicy.afterUse}</p><p>{refundPolicy.manualReview}</p><p>{refundPolicy.entitlementEnd}申请后的资格结果、处理中、成功或拒绝原因可在“我的”查看。</p><p>购买前请阅读 <a href="/terms">用户协议</a>、<a href="/privacy">隐私政策</a> 与 <a href="/authorization">AI 内容说明</a>；退款申请和数据删除入口在 <a href="/report">投诉与删除</a>。</p><label><input type="checkbox" checked={purchaseAccepted} onChange={(event) => setPurchaseAccepted(event.currentTarget.checked)} /><span>我已年满 18 周岁，理解这是 AI 服务，并确认价格、期限、额度、一次性收费及退款后权益终止。</span></label></div>}
      <div className={styles.actions}>
        {status.canPurchase && <MemoryButton variant="primary" loading={checkoutLoading} disabled={!purchaseAccepted} onClick={() => void beginPurchase()}>{checkoutLoading ? "正在前往微信支付" : "购买忆见初遇体验"}</MemoryButton>}
        {!status.canPurchase && checkoutKey && snapshot?.orders.some((order) => order.status === "pending") && <MemoryButton variant="secondary" loading={checkoutLoading} onClick={() => void resumePurchase()}>{checkoutLoading ? "正在继续支付" : "继续支付"}</MemoryButton>}
        <button type="button" className={styles.refresh} onClick={() => void refresh()} disabled={loading || checkoutLoading}>{loading ? "正在刷新" : "刷新支付状态"}</button>
      </div>
      {notice && <p className={styles.notice} role="alert">{notice}</p>}
    </section>
  );
}
