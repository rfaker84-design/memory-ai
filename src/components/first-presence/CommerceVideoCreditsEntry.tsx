"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearCommerceVideoOrderRecovery,
  CommerceVideoOrderRecovery,
  CommerceVideoEntryError,
  CommerceReferralStatus,
  CommerceVideoProduct,
  commercePlatform,
  createCommerceVideoOrder,
  createCommerceVideoOrderIdempotencyKey,
  createReferralCode,
  loadCommerceCreditBalance,
  loadCommerceVideoProducts,
  loadReferralStatus,
  readCommerceVideoOrderRecovery,
  writeCommerceVideoOrderRecovery,
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

const entryStyles: CommerceVideoCreditsEntryStyles = styles;

export function CommerceVideoCreditsEntry({ memoryId }: Props) {
  const [view, setView] = useState<View>("choices");
  const [products, setProducts] = useState<CommerceVideoProduct[]>([]);
  const [referral, setReferral] = useState<CommerceReferralStatus | null>(null);
  const [notice, setNotice] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);
  const [balanceState, setBalanceState] = useState<CommerceVideoCreditsBalanceState>({
    kind: "loading",
  });
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [commercialAccepted, setCommercialAccepted] = useState(false);
  const [orderRecovery, setOrderRecovery] = useState<CommerceVideoOrderRecovery | null>(null);
  const balanceAttempt = useRef(0);

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
    const recovery = readCommerceVideoOrderRecovery();
    setOrderRecovery(recovery?.memoryId === memoryId ? recovery : null);
  }, [memoryId]);

  useEffect(() => {
    void refreshBalance();
    return () => {
      balanceAttempt.current += 1;
    };
  }, [refreshBalance]);

  useEffect(() => {
    let current = true;
    void Promise.allSettled([loadCommerceVideoProducts(), loadReferralStatus()]).then((results) => {
      if (!current) return;
      const [catalog, referralStatus] = results;
      if (catalog.status === "fulfilled") setProducts(catalog.value);
      if (catalog.status === "rejected") setCatalogUnavailable(true);
      if (referralStatus.status === "fulfilled") setReferral(referralStatus.value);
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
      setNotice(error instanceof TrustConsentRequestError
        ? "购买确认尚未安全记录，订单未创建。恢复连接后请重新确认。"
        : unavailableCopy(error));
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
        onRetryBalance={() => void refreshBalance()}
      />
    </aside>
  );
}
