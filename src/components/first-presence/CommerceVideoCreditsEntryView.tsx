"use client";

import { MemoryButton } from "../memory-ui";
import type {
  CommerceReferralStatus,
  CommerceVideoProduct,
} from "./commerceVideoCreditsClient";
import {
  commerceVideoCreditsEntryPresentation,
  type CommerceVideoCreditsBalanceState,
} from "./commerceVideoCreditsEntryState";

type View = "choices" | "invite" | "packages";

export type CommerceVideoCreditsEntryStyles = Readonly<Record<string, string>>;

type Props = {
  balanceState: CommerceVideoCreditsBalanceState;
  catalogLoading: boolean;
  catalogUnavailable: boolean;
  commercialAccepted?: boolean;
  memoryId: string;
  notice: string;
  products: CommerceVideoProduct[];
  referral: CommerceReferralStatus | null;
  styles: CommerceVideoCreditsEntryStyles;
  submitting: string | null;
  titleId: string;
  view: View;
  onBack: () => void;
  onCommercialAcceptanceChange?: (accepted: boolean) => void;
  onCreateOrder: (product: CommerceVideoProduct) => void;
  onOpenInvite: () => void;
  onOpenPackages: () => void;
  onRetryBalance: () => void;
};

export function CommerceVideoCreditsEntryView({
  balanceState,
  catalogLoading,
  catalogUnavailable,
  commercialAccepted = false,
  memoryId,
  notice,
  products,
  referral,
  styles,
  submitting,
  titleId,
  view,
  onBack,
  onCommercialAcceptanceChange = () => undefined,
  onCreateOrder,
  onOpenInvite,
  onOpenPackages,
  onRetryBalance,
}: Props) {
  const presentation = commerceVideoCreditsEntryPresentation(balanceState);

  return (
    <>
      {presentation.kicker && <p className={styles.kicker}>{presentation.kicker}</p>}
      <h2 id={titleId} aria-live={balanceState.kind === "loading" ? "polite" : undefined}>
        {presentation.title}
      </h2>
      {presentation.description && <p className={styles.description}>{presentation.description}</p>}

      {balanceState.kind === "unavailable" && (
        <div className={styles.choices}>
          <MemoryButton variant="secondary" onClick={onRetryBalance}>重试</MemoryButton>
        </div>
      )}

      {balanceState.kind === "available" && (
        <div className={styles.detail}>
          <div className={styles.balance}>
            <p>你还有 {balanceState.balance.totalAvailable} 次可用的影像机会。</p>
            <MemoryButton href={"/memory/" + encodeURIComponent(memoryId) + "?open=image-generation"}>
              使用现有额度生成影像
            </MemoryButton>
          </div>
        </div>
      )}

      {balanceState.kind === "empty" && (
        <>
          {notice && <p className={styles.notice} role="status">{notice}</p>}

          {view === "choices" && (
            <div className={styles.choices}>
              <MemoryButton variant="secondary" onClick={onOpenInvite}>邀请朋友</MemoryButton>
              <MemoryButton onClick={onOpenPackages}>选择影像次数</MemoryButton>
            </div>
          )}

          {view === "invite" && (
            <div className={styles.detail}>
              <p>邀请满3名不同设备、不同已验证手机号的新用户后，获得1次不可保存的影像体验机会。</p>
              {referral?.code && <p className={styles.code}>邀请代码：{referral.code}</p>}
              {referral && <p>已完成 {referral.qualifiedInvitees} / 3 名验证；不是分享一次立即到账。</p>}
              <button type="button" className={styles.back} onClick={onBack}>返回</button>
            </div>
          )}

          {view === "packages" && (
            <div className={styles.detail}>
              {catalogLoading && <p className={styles.notice} role="status">正在准备影像次数。</p>}
              {catalogUnavailable && <p className={styles.notice} role="status">暂时无法读取影像套餐，请稍后再试。</p>}
              <label className={styles.commercialConsent}>
                <input
                  type="checkbox"
                  checked={commercialAccepted}
                  onChange={(event) => onCommercialAcceptanceChange(event.currentTarget.checked)}
                />
                <span>我已年满 18 周岁，理解价格、影像次数、一次性收费与退款规则，并同意将本次确认记录用于订单与售后处理。</span>
              </label>
              <div className={styles.packages}>
                {products.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    className={styles.package}
                    onClick={() => onCreateOrder(product)}
                    disabled={submitting !== null || !commercialAccepted}
                  >
                    <strong>{product.priceFen / 100}元 / {product.generationCredits}次</strong>
                  </button>
                ))}
              </div>
              <p className={styles.rules}>额度永久有效<br />生成成功才消耗<br />一次性购买，不自动续费</p>
              <button type="button" className={styles.back} onClick={onBack}>返回</button>
            </div>
          )}
        </>
      )}
    </>
  );
}
