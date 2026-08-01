import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MotionProvider } from "@/src/motion";

import type {
  CommerceCreditBalance,
  CommerceVideoProduct,
} from "./commerceVideoCreditsClient";
import {
  CommerceVideoCreditsEntryView,
  type CommerceVideoCreditsEntryStyles,
} from "./CommerceVideoCreditsEntryView";
import {
  resolveCommerceVideoCreditsBalanceState,
  type CommerceVideoCreditsBalanceState,
} from "./commerceVideoCreditsEntryState";

Object.assign(globalThis, { React });

const styles: CommerceVideoCreditsEntryStyles = {
  back: "back",
  balance: "balance",
  choices: "choices",
  commercialConsent: "commercialConsent",
  code: "code",
  description: "description",
  detail: "detail",
  kicker: "kicker",
  notice: "notice",
  package: "package",
  packages: "packages",
  rules: "rules",
};

const emptyBalance: CommerceCreditBalance = {
  paidAvailable: 0,
  referralAvailable: 0,
  freePreviewAvailable: 0,
  photoRemedyAvailable: 0,
  totalAvailable: 0,
  paidCreditsNeverExpire: true,
  canSaveFirstPreview: false,
};

function renderEntryState(state: CommerceVideoCreditsBalanceState, products: CommerceVideoProduct[] = []) {
  return renderToStaticMarkup(
    <MotionProvider>
      <aside aria-labelledby="test-entry-title">
        <CommerceVideoCreditsEntryView
          balanceState={state}
          catalogLoading={false}
          catalogUnavailable={false}
          memoryId="test-memory"
          notice=""
          products={products}
          referral={null}
          styles={styles}
          submitting={null}
          titleId="test-entry-title"
          view="choices"
          onBack={() => undefined}
          onCreateOrder={() => undefined}
          onOpenInvite={() => undefined}
          onOpenPackages={() => undefined}
          onRetryBalance={() => undefined}
        />
      </aside>
    </MotionProvider>,
  );
}

test("loading UI only confirms the balance and exposes no offer actions", () => {
  const rendered = renderEntryState({ kind: "loading" });
  assert.match(rendered, /正在确认你的影像机会/);
  assert.doesNotMatch(rendered, /本次体验机会已经用完|邀请朋友|选择影像次数|49元/);
});

test("positive-balance UI offers existing credits and never renders the exhausted copy", () => {
  const rendered = renderEntryState(resolveCommerceVideoCreditsBalanceState({
    ...emptyBalance,
    paidAvailable: 2,
    totalAvailable: 2,
  }));
  assert.match(rendered, /你还有可用的影像机会/);
  assert.match(rendered, /使用现有额度生成影像/);
  assert.match(rendered, /2 次影像机会/);
  assert.doesNotMatch(rendered, /本次体验机会已经用完|邀请朋友|选择影像次数/);
});

test("zero-balance UI is the only state that presents invitation and packages", () => {
  const rendered = renderEntryState(resolveCommerceVideoCreditsBalanceState(emptyBalance));
  assert.match(rendered, /本次体验机会已经用完/);
  assert.match(rendered, /邀请朋友/);
  assert.match(rendered, /选择影像次数/);
  assert.doesNotMatch(rendered, /使用现有额度生成影像/);
});

test("package choices require an explicit commercial confirmation", () => {
  const rendered = renderToStaticMarkup(
    <MotionProvider>
      <CommerceVideoCreditsEntryView
        balanceState={resolveCommerceVideoCreditsBalanceState(emptyBalance)}
        catalogLoading={false}
        catalogUnavailable={false}
        commercialAccepted={false}
        memoryId="test-memory"
        notice=""
        products={[{ id: "memory_video_49", priceFen: 4900, generationCredits: 2, grantsFirstPreviewSave: true }]}
        referral={null}
        styles={styles}
        submitting={null}
        titleId="test-entry-title"
        view="packages"
        onBack={() => undefined}
        onCommercialAcceptanceChange={() => undefined}
        onCreateOrder={() => undefined}
        onOpenInvite={() => undefined}
        onOpenPackages={() => undefined}
        onRetryBalance={() => undefined}
      />
    </MotionProvider>,
  );
  assert.match(rendered, /我已年满 18 周岁/);
  assert.match(rendered, /disabled/);
});

test("unavailable-balance UI provides retry without treating the query as zero credits", () => {
  const rendered = renderEntryState({ kind: "unavailable" });
  assert.match(rendered, /暂时无法确认影像次数/);
  assert.match(rendered, /重试/);
  assert.doesNotMatch(rendered, /本次体验机会已经用完|邀请朋友|选择影像次数|49元/);
});
