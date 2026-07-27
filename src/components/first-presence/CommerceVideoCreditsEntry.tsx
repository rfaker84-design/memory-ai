"use client";

import { useEffect, useState } from "react";

import { MemoryButton } from "../memory-ui";
import {
  CommerceVideoEntryError,
  CommerceCreditBalance,
  CommerceReferralStatus,
  CommerceVideoProduct,
  availableVideoCredits,
  commercePlatform,
  createCommerceVideoOrder,
  createReferralCode,
  loadCommerceCreditBalance,
  loadCommerceVideoProducts,
  loadReferralStatus,
} from "./commerceVideoCreditsClient";
import styles from "./CommerceVideoCreditsEntry.module.css";

type View = "choices" | "invite" | "packages";

type Props = {
  memoryId: string;
};

function unavailableCopy(error: unknown) {
  if (error instanceof CommerceVideoEntryError && error.code === "COMMERCE_TEST_PAYMENT_DISABLED") {
    return "当前环境尚未配置支付，订单不会被提交。";
  }
  return "影像机会暂时无法读取，请稍后再试。";
}

export function CommerceVideoCreditsEntry({ memoryId }: Props) {
  const [view, setView] = useState<View>("choices");
  const [products, setProducts] = useState<CommerceVideoProduct[]>([]);
  const [balance, setBalance] = useState<CommerceCreditBalance | null>(null);
  const [referral, setReferral] = useState<CommerceReferralStatus | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.allSettled([
      loadCommerceVideoProducts(),
      loadCommerceCreditBalance(),
      loadReferralStatus(),
    ]).then((results) => {
      if (controller.signal.aborted) return;
      const [catalog, credits, referralStatus] = results;
      if (catalog.status === "fulfilled") setProducts(catalog.value);
      if (credits.status === "fulfilled") setBalance(credits.value);
      if (referralStatus.status === "fulfilled") setReferral(referralStatus.value);
      if (catalog.status === "rejected" && credits.status === "rejected") {
        setNotice("影像机会暂时无法读取，请稍后再试。");
      }
      setLoading(false);
    });
    return () => controller.abort();
  }, []);

  const openInvite = async () => {
    setView("invite");
    setNotice("");
    if (referral?.code) return;
    try {
      const created = await createReferralCode();
      setReferral((current) => ({
        code: created.code,
        qualifiedInvitees: current?.qualifiedInvitees ?? 0,
        rewardsGranted: current?.rewardsGranted ?? 0,
        inviteesUntilNextReward: current?.inviteesUntilNextReward ?? 3,
      }));
    } catch (error) {
      setNotice(unavailableCopy(error));
    }
  };

  const createOrder = async (product: CommerceVideoProduct) => {
    const platform = commercePlatform(navigator.userAgent);
    if (platform === "ios") {
      setNotice("iOS 内购尚未完成配置，暂不能提交订单。");
      return;
    }
    setSubmitting(product.id);
    setNotice("");
    try {
      const result = await createCommerceVideoOrder(product.id, platform);
      const checkout = result.checkout as { kind?: string } | undefined;
      if (checkout?.kind === "test_callback_required") {
        setNotice("测试订单已创建，需由受控测试回调完成；不会发起真实扣款。");
      } else {
        setNotice("当前支付通道不可用，订单不会获得额度。");
      }
    } catch (error) {
      setNotice(unavailableCopy(error));
    } finally {
      setSubmitting(null);
    }
  };

  const credits = availableVideoCredits(balance);
  const titleId = memoryId + "-video-credits-title";

  return (
    <aside className={styles.entry} aria-labelledby={titleId}>
      <p className={styles.kicker}>本次体验机会已经用完</p>
      <h2 id={titleId}>想继续留住TA的更多模样</h2>
      <p className={styles.description}>可以邀请3位朋友获得1次不可保存的体验机会，或选择影像次数。</p>

      {notice && <p className={styles.notice} role="status">{notice}</p>}

      {view === "choices" && (
        <div className={styles.choices}>
          <MemoryButton variant="secondary" onClick={() => void openInvite()} disabled={loading}>邀请朋友</MemoryButton>
          <MemoryButton onClick={() => { setView("packages"); setNotice(""); }} disabled={loading}>选择影像次数</MemoryButton>
        </div>
      )}

      {view === "invite" && (
        <div className={styles.detail}>
          <p>邀请满3名不同设备、不同已验证手机号的新用户后，获得1次不可保存的影像体验机会。</p>
          {referral?.code && <p className={styles.code}>邀请代码：{referral.code}</p>}
          {referral && <p>已完成 {referral.qualifiedInvitees} / 3 名验证；不是分享一次立即到账。</p>}
          <button type="button" className={styles.back} onClick={() => setView("choices")}>返回</button>
        </div>
      )}

      {view === "packages" && (
        <div className={styles.detail}>
          {credits > 0 && (
            <div className={styles.balance}>
              <p>你有 {credits} 次可用影像额度。</p>
              <a href={"/memory/" + encodeURIComponent(memoryId) + "?open=image-generation"}>使用现有额度生成影像</a>
            </div>
          )}
          <div className={styles.packages}>
            {products.map((product) => (
              <button
                key={product.id}
                type="button"
                className={styles.package}
                onClick={() => void createOrder(product)}
                disabled={submitting !== null}
              >
                <strong>{product.priceFen / 100}元 / {product.generationCredits}次</strong>
              </button>
            ))}
          </div>
          <p className={styles.rules}>额度永久有效<br />生成成功才消耗<br />一次性购买，不自动续费</p>
          <button type="button" className={styles.back} onClick={() => setView("choices")}>返回</button>
        </div>
      )}
    </aside>
  );
}
