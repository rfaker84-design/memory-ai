"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import {
  clearCommerceVideoOrderRecovery,
  clearOccasionVideoRecovery,
  claimOccasionReward,
  CommerceVideoOrderRecovery,
  CommerceVideoEntryError,
  CommerceReferralStatus,
  CommerceVideoProduct,
  createOccasionVideo,
  createOccasionVideoRecovery,
  commercePlatform,
  createCommerceVideoOrder,
  createCommerceVideoOrderIdempotencyKey,
  createReferralCode,
  loadCommerceCreditBalance,
  loadCommerceVideoProducts,
  loadOpenOccasionRewardOffers,
  loadReferralStatus,
  readCommerceVideoOrderRecovery,
  readOccasionVideoRecovery,
  writeCommerceVideoOrderRecovery,
  writeOccasionVideoRecovery,
  type OccasionRewardOffer,
} from "./commerceVideoCreditsClient";
import {
  resolveCommerceVideoCreditsBalanceState,
  type CommerceVideoCreditsBalanceState,
} from "./commerceVideoCreditsEntryState";
import {
  CommerceVideoCreditsEntryView,
  type CommerceVideoCreditsEntryStyles,
} from "./CommerceVideoCreditsEntryView";
import {
  recordTrustConsent,
  TrustConsentRequestError,
} from "../trust/trustConsentClient";
import styles from "./CommerceVideoCreditsEntry.module.css";
import { reportProductInteraction } from "../product-metrics/productInteractionClient";

type View = "choices" | "invite" | "packages";

type Props = {
  memoryId: string;
};

function unavailableCopy(error: unknown) {
  if (error instanceof CommerceVideoEntryError && error.code === "UNDERSTANDING_ASSISTANCE_REQUIRED") {
    return "\u8fd9\u9879\u64cd\u4f5c\u5df2\u6682\u65f6\u505c\u6b62\u3002\u4f60\u53ef\u4ee5\u5148\u518d\u770b\u4e00\u6b21\u8bf4\u660e\uff0c\u6682\u65f6\u4e0d\u8d2d\u4e70\uff0c\u6216\u8bf7\u53ef\u4fe1\u4efb\u7684\u4eba\u534f\u52a9\uff1b\u5fc6\u89c1\u4e0d\u4f1a\u66ff\u4f60\u5224\u65ad\uff0c\u4e5f\u4e0d\u4f1a\u81ea\u52a8\u8054\u7cfb\u4efb\u4f55\u4eba\u3002";
  }
  if (error instanceof CommerceVideoEntryError && error.code === "COMMERCE_TEST_PAYMENT_DISABLED") {
    return "当前环境尚未配置支付，订单不会被提交。";
  }
  if (error instanceof CommerceVideoEntryError && error.code === "COMMERCE_REQUEST_TIMEOUT") {
    return "本次结果尚未确认。不会自动重试；若是订单或纪念影像请求，原恢复标识会保留，稍后请明确重试。";
  }
  return "影像机会暂时无法读取，请稍后再试。";
}

const entryStyles: CommerceVideoCreditsEntryStyles = styles;

export function CommerceVideoCreditsEntry({ memoryId }: Props) {
  const [view, setView] = useState<View>("choices");
  const [products, setProducts] = useState<CommerceVideoProduct[]>([]);
  const [referral, setReferral] = useState<CommerceReferralStatus | null>(null);
  const [notice, setNotice] = useState("");
  const [assistanceBlocked, setAssistanceBlocked] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);
  const [balanceState, setBalanceState] = useState<CommerceVideoCreditsBalanceState>({
    kind: "loading",
  });
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [commercialAccepted, setCommercialAccepted] = useState(false);
  const [orderRecovery, setOrderRecovery] = useState<CommerceVideoOrderRecovery | null>(null);
  const [occasionOffers, setOccasionOffers] = useState<OccasionRewardOffer[]>([]);
  const balanceAttempt = useRef(0);
  const paywallExposureRecorded = useRef(false);

  const refreshBalance = useCallback(async () => {
    const attempt = balanceAttempt.current + 1;
    balanceAttempt.current = attempt;
    setBalanceState({ kind: "loading" });
    try {
      const balance = await loadCommerceCreditBalance();
      if (balanceAttempt.current === attempt) {
        setBalanceState(resolveCommerceVideoCreditsBalanceState(balance));
      }
    } catch {
      if (balanceAttempt.current === attempt) setBalanceState({ kind: "unavailable" });
    }
  }, []);

  useEffect(() => {
    setCommercialAccepted(false);
    paywallExposureRecorded.current = false;
    const recovery = readCommerceVideoOrderRecovery();
    setOrderRecovery(recovery?.memoryId === memoryId ? recovery : null);
  }, [memoryId]);

  useEffect(() => {
    if (view !== "packages" || paywallExposureRecorded.current) return;
    paywallExposureRecorded.current = true;
    reportProductInteraction({
      eventName: "paywall_viewed",
      idempotencyKey: `metrics:v1:paywall-viewed:${memoryId}`,
      memoryId,
      properties: { surface: "commerce" },
    });
  }, [memoryId, view]);

  useEffect(() => {
    void refreshBalance();
    return () => {
      balanceAttempt.current += 1;
    };
  }, [refreshBalance]);

  useEffect(() => {
    let current = true;
    void Promise.allSettled([loadCommerceVideoProducts(), loadReferralStatus(), loadOpenOccasionRewardOffers()]).then((results) => {
      if (!current) return;
      const [catalog, referralStatus, offers] = results;
      if (catalog.status === "fulfilled") setProducts(catalog.value);
      if (catalog.status === "rejected") setCatalogUnavailable(true);
      if (referralStatus.status === "fulfilled") setReferral(referralStatus.value);
      if (offers.status === "fulfilled") setOccasionOffers(offers.value);
      setCatalogLoading(false);
    });
    return () => {
      current = false;
    };
  }, []);

  const openInvite = async () => {
    if (balanceState.kind !== "empty") return;
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

  const openPackages = () => {
    if (balanceState.kind !== "empty") return;
    setView("packages");
    setNotice("");
  };

  const createOrder = async (product: CommerceVideoProduct) => {
    if (balanceState.kind !== "empty" || !commercialAccepted) return;
    const platform = commercePlatform(navigator.userAgent);
    if (platform === "ios") {
      setNotice("iOS 内购尚未完成配置，暂不能提交订单。");
      return;
    }
    setSubmitting(product.id);
    setNotice("");
    setAssistanceBlocked(false);
    try {
      await recordTrustConsent("commercial_use", memoryId);
      const recovery = orderRecovery
        && orderRecovery.memoryId === memoryId
        && orderRecovery.productId === product.id
        && orderRecovery.platform === platform
        ? orderRecovery
        : {
          memoryId,
          productId: product.id,
          platform,
          idempotencyKey: createCommerceVideoOrderIdempotencyKey(),
        };
      if (!writeCommerceVideoOrderRecovery(recovery)) {
        setNotice("当前浏览器无法安全保留订单恢复标识，尚未提交影像额度订单；请恢复后再试。");
        return;
      }
      setOrderRecovery(recovery);
      const result = await createCommerceVideoOrder(memoryId, product.id, platform, fetch, recovery.idempotencyKey);
      clearCommerceVideoOrderRecovery();
      setOrderRecovery(null);
      const checkout = result.checkout as { kind?: string } | undefined;
      if (checkout?.kind === "test_callback_required") {
        setNotice("测试订单已创建，需由受控测试回调完成；不会发起真实扣款。");
      } else {
        setNotice("当前支付通道不可用，订单不会获得额度。");
      }
    } catch (error) {
      if ((error instanceof TrustConsentRequestError || error instanceof CommerceVideoEntryError) && error.code === "UNDERSTANDING_ASSISTANCE_REQUIRED") {
        setNotice("\u8fd9\u9879\u64cd\u4f5c\u5df2\u6682\u65f6\u505c\u6b62\u3002\u4f60\u53ef\u4ee5\u5148\u518d\u770b\u4e00\u6b21\u8bf4\u660e\uff0c\u6682\u65f6\u4e0d\u8d2d\u4e70\uff0c\u6216\u8bf7\u53ef\u4fe1\u4efb\u7684\u4eba\u534f\u52a9\uff1b\u5fc6\u89c1\u4e0d\u4f1a\u66ff\u4f60\u5224\u65ad\uff0c\u4e5f\u4e0d\u4f1a\u81ea\u52a8\u8054\u7cfb\u4efb\u4f55\u4eba\u3002");
        setAssistanceBlocked(true);
      } else {
      setNotice(error instanceof TrustConsentRequestError
        ? "购买确认尚未安全记录，订单未创建。恢复连接后请重新确认。"
        : unavailableCopy(error));
      }
    } finally {
      setSubmitting(null);
    }
  };

  const useOccasionReward = async (offer: OccasionRewardOffer) => {
    if (submitting) return;
    const previous = readOccasionVideoRecovery();
    const recovery = previous
      && previous.memoryId === memoryId
      && previous.occasion === offer.occasion
      ? previous
      : createOccasionVideoRecovery(memoryId, offer.occasion);
    if (!writeOccasionVideoRecovery(recovery)) {
      setNotice("浏览器无法安全保留本次影像请求标识；尚未提交，请恢复后再试。");
      return;
    }
    setSubmitting(`occasion:${offer.occasion}`);
    setNotice("");
    try {
      if (!offer.claimed) {
        await claimOccasionReward(offer.occasion, recovery.claimIdempotencyKey);
        setOccasionOffers((current) => current.map((item) => (
          item.occasion === offer.occasion && item.calendarYear === offer.calendarYear
            ? { ...item, claimed: true }
            : item
        )));
      }
      await createOccasionVideo(memoryId, recovery.videoIdempotencyKey);
      clearOccasionVideoRecovery();
      setNotice("纪念影像已加入准备队列；完成前会先经过人工审核。");
      await refreshBalance();
    } catch (error) {
      setNotice(error instanceof CommerceVideoEntryError
        ? unavailableCopy(error)
        : "纪念影像暂时无法提交；已保留安全恢复标识，请稍后重试。");
      await refreshBalance();
    } finally {
      setSubmitting(null);
    }
  };

  const titleId = memoryId + "-video-credits-title";

  return (
    <aside className={styles.entry} aria-labelledby={titleId}>
      <CommerceVideoCreditsEntryView
        balanceState={balanceState}
        catalogLoading={catalogLoading}
        catalogUnavailable={catalogUnavailable}
        commercialAccepted={commercialAccepted}
        memoryId={memoryId}
        notice={notice}
        occasionOffers={occasionOffers}
        products={products}
        referral={referral}
        styles={entryStyles}
        submitting={submitting}
        titleId={titleId}
        view={view}
        onBack={() => setView("choices")}
        onCommercialAcceptanceChange={setCommercialAccepted}
        onCreateOrder={(product) => void createOrder(product)}
        onOpenInvite={() => void openInvite()}
        onOpenPackages={openPackages}
        onUseOccasionReward={(offer) => void useOccasionReward(offer)}
        onRetryBalance={() => void refreshBalance()}
      />
      {assistanceBlocked ? <p className={styles.notice}><Link href="/settings/understanding-assistance">{"\u8bf7\u53ef\u4fe1\u4efb\u7684\u4eba\u534f\u52a9"}</Link></p> : null}
    </aside>
  );
}
