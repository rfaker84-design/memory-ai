import Link from "next/link";
import { refundPolicy } from "@/src/components/payment/refundPolicy";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#0b0a08] px-6 py-12 text-[#f6eee2]">
      <div className="mx-auto max-w-3xl rounded-2xl border border-[#d5b172]/25 bg-[#18120d] p-8 shadow-[0_28px_80px_rgba(0,0,0,.28)]">
        <h1 className="text-3xl font-bold">用户协议</h1>
        <p className="mt-6 whitespace-pre-wrap leading-7 text-[#d8bfaa]">
忆见是 AI 记忆陪伴工具，不代表逝者本人真实表达。

用户不得上传无授权的照片、语音、文字资料。

用户不得利用忆见生成违法、侵权、欺诈、迷信、威胁、自伤诱导等内容。

平台有权删除违规内容，并限制违规用户继续使用。
{"\n\n"}
{"\n"}历史订单、退款和其他账户请求可由已登录用户通过应用内工单提交。外部人工渠道将在主体和联系方式完成核验后另行公布；请勿向未核验地址发送敏感材料。
{"\n\n"}退款规则：
{"\n"}{refundPolicy.noReason}
{"\n"}{refundPolicy.afterUse}
{"\n"}{refundPolicy.manualReview}
{"\n"}{refundPolicy.entitlementEnd}
        </p>
        <p className="mt-6 text-[#f1c980]"><Link href="/report" className="underline">前往投诉、退款与数据删除入口</Link></p>
      </div>
    </main>
  );
}
