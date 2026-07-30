import { useCallback, useEffect, useMemo, useState } from "react";

import {
  commerceVideoCreditsEntryPresentation,
  resolveCommerceVideoCreditsBalanceState,
  type CommerceVideoCreditsBalanceState,
} from "../../../src/components/first-presence/commerceVideoCreditsEntryState";
import type {
  CommerceCreditBalance,
  CommerceReferralStatus,
  CommerceVideoProduct,
} from "../../../src/components/first-presence/commerceVideoCreditsClient";
import { disabledIap } from "../contracts/iap";
import {
  productApi,
  type FirstPresenceVideoSafeDto,
  type ProductConversation,
  type ProductMemory,
} from "./api";
import {
  latestVideoJob,
  resolveMobileVideoOpportunities,
  saveAllowedForMobileVideo,
} from "./video-opportunity";

type CommerceSnapshot = {
  balance: CommerceCreditBalance | null;
  referral: CommerceReferralStatus | null;
  products: CommerceVideoProduct[];
};

type Props = {
  memory: ProductMemory;
  conversation: ProductConversation;
  isFirstMemory: boolean;
  online: boolean;
  onBack: () => void;
  onOpenChat: () => void;
};

function jobCopy(job: FirstPresenceVideoSafeDto | null, saveAllowed: boolean) {
  if (!job) return "机会状态会由服务端继续确认；当前不会在设备上伪造影像。";
  if (job.artifactAvailable && saveAllowed) return "影像已由服务端确认，可保存能力会在正式播放页开放后提供。";
  if (job.artifactAvailable) return "影像预览已由服务端确认；这一次预览不能保存。";
  if (job.manualReviewRequired) return "影像正在等待服务端确认，暂不显示本地成功状态。";
  if (job.status === "failed" || job.status === "rejected") return "这次影像暂未准备好，可以稍后回到这里查看。";
  return "影像机会已登记，等待服务端完成后会更新在这里。";
}

export function VideoOpportunityScreen({
  memory,
  conversation,
  isFirstMemory,
  online,
  onBack,
  onOpenChat,
}: Props) {
  const opportunities = useMemo(
    () => resolveMobileVideoOpportunities(memory, conversation, isFirstMemory),
    [conversation, isFirstMemory, memory],
  );
  const remoteReadable = online && productApi.enabled() && memory.id !== "preview-memory";
  const [jobs, setJobs] = useState<FirstPresenceVideoSafeDto[]>([]);
  const [commerce, setCommerce] = useState<CommerceSnapshot>({ balance: null, referral: null, products: [] });
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [iapNotice, setIapNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!remoteReadable || (!opportunities.initialPreview && !opportunities.additionalGeneration)) {
        if (active) {
          setJobs([]);
          setCommerce({ balance: null, referral: null, products: [] });
          setUnavailable(false);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setUnavailable(false);
      const jobsResult = await productApi.listFirstPresenceVideos(memory.id).then(
        (value) => ({ ok: true as const, value }),
        () => ({ ok: false as const }),
      );
      const commerceResult = opportunities.additionalGeneration
        ? await Promise.all([
          productApi.loadCommerceCreditBalance(),
          productApi.loadCommerceVideoProducts(),
          productApi.loadCommerceReferralStatus(),
        ]).then(
          ([balance, products, referral]) => ({ ok: true as const, balance, products, referral }),
          () => ({ ok: false as const }),
        )
        : { ok: true as const, balance: null, products: [], referral: null };

      if (!active) return;
      if (jobsResult.ok) setJobs(jobsResult.value);
      if (commerceResult.ok) {
        setCommerce({
          balance: commerceResult.balance,
          products: commerceResult.products,
          referral: commerceResult.referral,
        });
      }
      setUnavailable(!jobsResult.ok || !commerceResult.ok);
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [memory.id, opportunities.additionalGeneration, opportunities.initialPreview, refreshKey, remoteReadable]);

  const initialJob = latestVideoJob(jobs, "initial_preview");
  const additionalJob = latestVideoJob(jobs, "additional_generation");
  const initialSaveAllowed = initialJob ? saveAllowedForMobileVideo(initialJob) : false;
  const additionalSaveAllowed = additionalJob ? saveAllowedForMobileVideo(additionalJob) : false;
  const commerceState: CommerceVideoCreditsBalanceState = commerce.balance
    ? resolveCommerceVideoCreditsBalanceState(commerce.balance)
    : unavailable ? { kind: "unavailable" } : { kind: "loading" };
  const commercePresentation = commerceVideoCreditsEntryPresentation(commerceState);

  const explainIapBoundary = useCallback(async () => {
    try {
      await disabledIap("memory_video_49").purchase();
    } catch {
      setIapNotice("原生内购尚未接入；不会创建订单、扣款或写入任何本地额度。");
    }
  }, []);

  return <main className="videoOpportunityScene">
    <header className="pageHeader">
      <button className="backButton" onClick={onBack}>‹</button>
      <span>影像机会</span>
      <button className="headerAction" onClick={onOpenChat}>对话</button>
    </header>

    <section className="videoOpportunityIntro">
      <p className="eyebrow">{memory.name}</p>
      <h1>把想念，留成会动的片段。</h1>
      <p>机会、额度与保存权限都以服务端账户状态为准。</p>
    </section>

    {opportunities.initialPreview ? <article className="videoOpportunityCard initialPreviewCard">
      <p className="eyebrow">首次预览</p>
      <h2>照片已保存，免费预览机会已经出现。</h2>
      <p>这一次体验不消耗后续影像额度，也不允许保存到系统相册。</p>
      <span className="videoPolicy">免费 · 不可保存</span>
      <p className="videoStatus">{jobCopy(initialJob, initialSaveAllowed)}</p>
    </article> : <article className="videoOpportunityCard mutedOpportunityCard">
      <p className="eyebrow">首次预览</p>
      <h2>先把一张照片好好保存下来。</h2>
      <p>只有服务端确认照片已绑定到首个 TA 后，免费预览机会才会出现。</p>
    </article>}

    {opportunities.additionalGeneration ? <article className="videoOpportunityCard additionalOpportunityCard">
      <p className="eyebrow">后续影像</p>
      <h2>{commercePresentation.title}</h2>
      {commercePresentation.description ? <p>{commercePresentation.description}</p> : null}
      {commerceState.kind === "available" ? <span className="videoPolicy">账户可用机会 {commerceState.balance.totalAvailable} 次</span> : null}
      {commerceState.kind === "empty" && commerce.referral ? <p className="videoStatus">邀请权益仍按账户规则计算；距离下一次奖励还差 {commerce.referral.inviteesUntilNextReward} 位。</p> : null}
      {commerce.products.length ? <p className="videoCatalog">可用套餐仍由现有 Commerce 目录提供：{commerce.products.map((product) => `${product.generationCredits} 次`).join(" · ")}</p> : null}
      <p className="videoStatus">{jobCopy(additionalJob, additionalSaveAllowed)}</p>
      <button className="secondaryButton" disabled={loading} onClick={() => setRefreshKey((value) => value + 1)}>{loading ? "正在确认" : "刷新账户状态"}</button>
      <button className="quietLink" onClick={() => void explainIapBoundary()}>原生购买即将开放</button>
      {iapNotice ? <p className="notice" role="status">{iapNotice}</p> : null}
    </article> : <article className="videoOpportunityCard mutedOpportunityCard">
      <p className="eyebrow">后续影像</p>
      <h2>再聊两轮，影像机会会在这里出现。</h2>
      <p>只计算当前会话中服务端完整保存的有效对话，不统计本地草稿或失败消息。</p>
    </article>}

    {unavailable ? <p className="videoUnavailable" role="status">暂时无法确认账户影像状态，请检查网络后重试。</p> : null}
  </main>;
}
