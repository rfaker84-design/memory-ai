import type { CommerceCreditBalance } from "./commerceVideoCreditsClient";

export type CommerceVideoCreditsBalanceState =
  | { kind: "loading" }
  | { kind: "available"; balance: CommerceCreditBalance }
  | { kind: "empty"; balance: CommerceCreditBalance }
  | { kind: "unavailable" };

export type CommerceVideoCreditsPreviewState = CommerceVideoCreditsBalanceState["kind"];

export type CommerceVideoCreditsEntryPresentation = {
  kind: CommerceVideoCreditsBalanceState["kind"];
  kicker?: string;
  title: string;
  description?: string;
  actions: Array<"invite" | "packages" | "retry" | "use-existing">;
};

const previewBalance: CommerceCreditBalance = {
  paidAvailable: 2,
  referralAvailable: 0,
  freePreviewAvailable: 0,
  photoRemedyAvailable: 0,
  occasionAvailable: 0,
  totalAvailable: 2,
  paidCreditsNeverExpire: true,
  canSaveFirstPreview: true,
};

export function resolveCommerceVideoCreditsBalanceState(
  balance: CommerceCreditBalance,
): CommerceVideoCreditsBalanceState {
  return balance.totalAvailable > 0
    ? { kind: "available", balance }
    : { kind: "empty", balance };
}

export function previewCommerceVideoCreditsBalanceState(
  state: CommerceVideoCreditsPreviewState,
): CommerceVideoCreditsBalanceState {
  if (state === "available") return { kind: "available", balance: previewBalance };
  if (state === "empty") return {
    kind: "empty",
    balance: { ...previewBalance, paidAvailable: 0, totalAvailable: 0 },
  };
  if (state === "unavailable") return { kind: "unavailable" };
  return { kind: "loading" };
}

export function commerceVideoCreditsEntryPresentation(
  state: CommerceVideoCreditsBalanceState,
): CommerceVideoCreditsEntryPresentation {
  if (state.kind === "loading") {
    return {
      kind: state.kind,
      title: "正在确认你的影像机会",
      actions: [],
    };
  }

  if (state.kind === "available") {
    return {
      kind: state.kind,
      kicker: "你还有可用的影像机会",
      title: "还剩 " + state.balance.totalAvailable + " 次影像机会",
      description: "现在可以直接使用现有额度生成影像。",
      actions: ["use-existing"],
    };
  }

  if (state.kind === "unavailable") {
    return {
      kind: state.kind,
      title: "暂时无法确认影像次数",
      description: "请检查网络后重试。",
      actions: ["retry"],
    };
  }

  return {
    kind: state.kind,
    kicker: "本次体验机会已经用完",
    title: "想继续留住TA的更多模样",
    description: "可以邀请3位朋友获得1次不可保存的体验机会，或选择影像次数。",
    actions: ["invite", "packages"],
  };
}
