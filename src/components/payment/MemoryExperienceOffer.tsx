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
  const checkoutKey = useRef<string | null>(null);

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

  const beginPurchase = async () => {
    if (checkoutLoading) return;
    setCheckoutLoading(true);
    setNotice("");
    try {
      checkoutKey.current ??= createPaymentIdempotencyKey();
      const paymentUrl = await createExperienceCheckout(memoryId, checkoutKey.current);
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
      <h2 className={styles.title}>{status.title}</h2>
      <p className={styles.product}>49元 · 30天 · 1个 TA · 100次 AI 回复</p>
      <p className={styles.detail}>{loading ? "正在确认已有体验与支付状态…" : status.detail}</p>
      <div className={styles.actions}>
        {status.canPurchase && <MemoryButton variant="primary" loading={checkoutLoading} onClick={() => void beginPurchase()}>{checkoutLoading ? "正在前往微信支付" : "购买忆见初遇体验"}</MemoryButton>}
        <button type="button" className={styles.refresh} onClick={() => void refresh()} disabled={loading || checkoutLoading}>{loading ? "正在刷新" : "刷新支付状态"}</button>
      </div>
      {notice && <p className={styles.notice} role="alert">{notice}</p>}
    </section>
  );
}
