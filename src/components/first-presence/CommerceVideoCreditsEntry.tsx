"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  CommerceVideoEntryError,
  CommerceReferralStatus,
  CommerceVideoProduct,
  commercePlatform,
  createCommerceVideoOrder,
  createReferralCode,
  loadCommerceCreditBalance,
  loadCommerceVideoProducts,
  loadReferralStatus,
} from "./commerceVideoCreditsClient";
import {
  resolveCommerceVideoCreditsBalanceState,
  type CommerceVideoCreditsBalanceState,
} from "./commerceVideoCreditsEntryState";
import {
  CommerceVideoCreditsEntryView,
  type CommerceVideoCreditsEntryStyles,
} from "./CommerceVideoCreditsEntryView";
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

  const titleId = memoryId + "-video-credits-title";

  return (
    <aside className={styles.entry} aria-labelledby={titleId}>
      <CommerceVideoCreditsEntryView
        balanceState={balanceState}
        catalogLoading={catalogLoading}
        catalogUnavailable={catalogUnavailable}
        memoryId={memoryId}
        notice={notice}
        products={products}
        referral={referral}
        styles={entryStyles}
        submitting={submitting}
        titleId={titleId}
        view={view}
        onBack={() => setView("choices")}
        onCreateOrder={(product) => void createOrder(product)}
        onOpenInvite={() => void openInvite()}
        onOpenPackages={openPackages}
        onRetryBalance={() => void refreshBalance()}
      />
    </aside>
  );
}
