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
  OccasionRewardOffer,
} from "../../../src/components/first-presence/commerceVideoCreditsClient";
import {
  claimOccasionReward,
  clearOccasionVideoRecovery,
  createReferralCode,
  CommerceVideoEntryError,
  createOccasionVideo,
  createOccasionVideoRecovery,
  loadOpenOccasionRewardOffers,
  readOccasionVideoRecovery,
  writeOccasionVideoRecovery,
} from "../../../src/components/first-presence/commerceVideoCreditsClient";
import { disabledIap } from "../contracts/iap";
import {
  productApi,
  mobileApiFetch,
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
  ownedMemories: ProductMemory[];
  conversation: ProductConversation;
  isFirstMemory: boolean;
  online: boolean;
  onBack: () => void;
  onOpenChat: () => void;
  onSelectMemory: (memoryId: string) => void;
};

function jobCopy(job: FirstPresenceVideoSafeDto | null, saveAllowed: boolean) {
  if (!job) return "机会状态会由服务端继续确认；当前不会在设备上伪造影像。";
  if (job.artifactAvailable && saveAllowed) return "影像已由服务端确认，可保存能力会在正式播放页开放后提供。";
  if (job.artifactAvailable) return "影像预览已由服务端确认；这一次预览不能保存。";
  if (job.manualReviewRequired) return "影像正在等待服务端确认，暂不显示本地成功状态。";
  if (job.status === "failed" || job.status === "rejected") return "这次影像暂未准备好，可以稍后回到这里查看。";
  return "影像机会已登记，等待服务端完成后会更新在这里。";
}

function isMissingReferralCode(error: unknown) {
  return error instanceof CommerceVideoEntryError && error.code === "REFERRAL_CODE_NOT_CREATED";
}

export function VideoOpportunityScreen({
  memory,
  ownedMemories,
  conversation,
  isFirstMemory,
  online,
  onBack,
  onOpenChat,
  onSelectMemory,
}: Props) {
  const opportunities = useMemo(
    () => resolveMobileVideoOpportunities(memory, conversation, isFirstMemory),
    [conversation, isFirstMemory, memory],
  );
  const remoteReadable = online && productApi.enabled() && memory.id !== "preview-memory";
  const hasConfirmedPhoto = Boolean(memory.photoAssetId?.trim());
  const [jobs, setJobs] = useState<FirstPresenceVideoSafeDto[]>([]);
  const [commerce, setCommerce] = useState<CommerceSnapshot>({ balance: null, referral: null, products: [] });
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [iapNotice, setIapNotice] = useState("");
  const [occasionOffers, setOccasionOffers] = useState<OccasionRewardOffer[]>([]);
  const [occasionSubmitting, setOccasionSubmitting] = useState(false);
  const [referralSubmitting, setReferralSubmitting] = useState(false);
  const [referralNotice, setReferralNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!remoteReadable || !hasConfirmedPhoto) {
        if (active) {
          setJobs([]);
          setCommerce({ balance: null, referral: null, products: [] });
          setOccasionOffers([]);
          setUnavailable(false);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setUnavailable(false);
      const [jobsResult, commerceResult] = await Promise.all([
        productApi.listFirstPresenceVideos(memory.id).then(
          (value) => ({ ok: true as const, value }),
          () => ({ ok: false as const }),
        ),
        Promise.all([
          productApi.loadCommerceCreditBalance(),
          productApi.loadCommerceVideoProducts(),
          productApi.loadCommerceReferralStatus().catch((error) => {
            if (isMissingReferralCode(error)) return null;
            throw error;
          }),
          loadOpenOccasionRewardOffers(mobileApiFetch),
        ]).then(
          ([balance, products, referral, offers]) => ({ ok: true as const, balance, products, referral, offers }),
          () => ({ ok: false as const }),
        ),
      ]);

      if (!active) return;
      if (jobsResult.ok) setJobs(jobsResult.value);
      if (commerceResult.ok) {
        setCommerce({
          balance: commerceResult.balance,
          products: commerceResult.products,
          referral: commerceResult.referral,
        });
        setOccasionOffers(commerceResult.offers);
      }
      setUnavailable(!jobsResult.ok || !commerceResult.ok);
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [hasConfirmedPhoto, memory.id, refreshKey, remoteReadable]);

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

  const createReferral = useCallback(async () => {
    if (referralSubmitting || !remoteReadable) return;
    setReferralSubmitting(true);
    setReferralNotice("");
    try {
      const created = await createReferralCode(mobileApiFetch);
      setCommerce((current) => ({
        ...current,
        referral: {
          code: created.code,
          qualifiedInvitees: current.referral?.qualifiedInvitees ?? 0,
          rewardsGranted: current.referral?.rewardsGranted ?? 0,
          inviteesUntilNextReward: current.referral?.inviteesUntilNextReward ?? 3,
        },
      }));
      setReferralNotice("邀请代码已由服务端签发；分享本身不会计入资格或发放机会。");
    } catch {
      setReferralNotice("暂时无法签发邀请代码；没有创建本地资格或奖励。请稍后重试。");
    } finally {
      setReferralSubmitting(false);
    }
  }, [referralSubmitting, remoteReadable]);

  const copyReferralCode = useCallback(async () => {
    const code = commerce.referral?.code;
    if (!code) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("CLIPBOARD_UNAVAILABLE");
      await navigator.clipboard.writeText(code);
      setReferralNotice("邀请代码已复制。对方仍须使用不同的已验证手机号和已验证设备完成资格确认。");
    } catch {
      setReferralNotice("未能复制邀请代码；资格和奖励状态没有改变。");
    }
  }, [commerce.referral?.code]);

  const useOccasionReward = useCallback(async (offer: OccasionRewardOffer) => {
    if (occasionSubmitting) return;
    const existing = readOccasionVideoRecovery();
    const recovery = existing && existing.memoryId === memory.id && existing.occasion === offer.occasion
      ? existing : createOccasionVideoRecovery(memory.id, offer.occasion);
    if (!writeOccasionVideoRecovery(recovery)) {
      setIapNotice("无法安全保留本次领取标识；尚未提交，请恢复后再试。"); return;
    }
    setOccasionSubmitting(true); setIapNotice("");
    try {
      if (!offer.claimed) await claimOccasionReward(offer.occasion, recovery.claimIdempotencyKey, mobileApiFetch);
      await createOccasionVideo(memory.id, recovery.videoIdempotencyKey, mobileApiFetch);
      clearOccasionVideoRecovery(); setRefreshKey((value) => value + 1);
      setIapNotice("纪念影像机会已由服务端登记；请在这里刷新查看审核进度。");
    } catch {
      setIapNotice("领取或影像结果尚未确认。系统不会创建新的请求；请恢复后用同一机会手动重试。");
    } finally { setOccasionSubmitting(false); }
  }, [memory.id, occasionSubmitting]);

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

    {occasionOffers.filter((offer) => !offer.claimed || (commerce.balance?.occasionAvailable ?? 0) > 0).map((offer) => <section key={`${offer.occasion}-${offer.calendarYear}`} className="videoOpportunityCard"><p className="eyebrow">纪念日机会</p><p>为 {memory.name} 制作一段 8 秒竖版、静音的纪念影像；领取期至 {offer.claimDeadline}。</p>{ownedMemories.filter((candidate) => candidate.photoAssetId?.trim()).length > 1 ? <><p>请选择要制作的 TA：</p><div>{ownedMemories.filter((candidate) => candidate.photoAssetId?.trim()).map((candidate) => <button key={candidate.id} className="quietLink" disabled={candidate.id === memory.id || occasionSubmitting} onClick={() => onSelectMemory(candidate.id)}>{candidate.id === memory.id ? `${candidate.name}（当前）` : candidate.name}</button>)}</div></> : null}<p>生成成功并审核通过后可保存。领取机会与后续影像资格独立，不要求先完成两轮对话。</p><button className="secondaryButton" disabled={loading || occasionSubmitting} onClick={() => void useOccasionReward(offer)}>{occasionSubmitting ? "正在确认" : offer.claimed ? "使用已领取机会" : "领取并制作纪念影像"}</button></section>)}

    {opportunities.additionalGeneration ? <article className="videoOpportunityCard additionalOpportunityCard">
      <p className="eyebrow">后续影像</p>
      <h2>{commercePresentation.title}</h2>
      {commercePresentation.description ? <p>{commercePresentation.description}</p> : null}
      {commerceState.kind === "available" ? <span className="videoPolicy">账户可用机会 {commerceState.balance.totalAvailable} 次</span> : null}
      <section className="videoOpportunityCard">
        <p className="eyebrow">邀请朋友</p>
        <p>邀请 3 位使用不同已验证手机号和已验证设备的新用户，可获得 1 次不可保存的体验机会。</p>
        <p>分享邀请代码不等于资格确认；资格、去重和机会都只由服务端核验。</p>
        {commerce.referral ? <><p className="videoStatus">已确认 {commerce.referral.qualifiedInvitees} 位；下一次机会仍需 {commerce.referral.inviteesUntilNextReward} 位符合条件的新用户。</p><p className="videoPolicy">邀请代码：{commerce.referral.code}</p><button className="secondaryButton" disabled={loading || referralSubmitting} onClick={() => void copyReferralCode()}>复制邀请代码</button></> : <button className="secondaryButton" disabled={loading || referralSubmitting || unavailable} onClick={() => void createReferral()}>{referralSubmitting ? "正在签发" : "生成邀请代码"}</button>}
        {referralNotice ? <p className="notice" role="status">{referralNotice}</p> : null}
      </section>
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
