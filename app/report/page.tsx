import { refundPolicy } from "@/src/components/payment/refundPolicy";
import { RefundCenter } from "@/src/components/payment/RefundCenter";
import { ReportIntake } from "@/src/components/report/ReportIntake";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ publicShare?: string | string[] }> }) {
  const value = (await searchParams).publicShare;
  const publicShareId = typeof value === "string" && UUID.test(value) ? value : undefined;
  return (
    <main className="min-h-screen bg-[#0b0a08] px-6 py-12 text-[#f6eee2]">
      <div className="mx-auto max-w-3xl rounded-2xl border border-[#d5b172]/25 bg-[#18120d] p-8 shadow-[0_28px_80px_rgba(0,0,0,.28)]">
        <h1 className="text-3xl font-bold">投诉、退款与数据删除</h1>
        <p className="mt-6 leading-7 text-[#d8bfaa]">
          已登录用户可在下方提交可追踪的应用内工单，用于内容、隐私、安全、支付、账户与删除请求。工单状态仅向提交它的账户显示。
          请不要在描述中填写身份证号、银行卡号、密码、验证码或照片、声音、聊天正文。
        </p>
        <ReportIntake publicShareId={publicShareId} />
        <section className="mt-8 rounded-xl border border-[#d5b172]/25 p-5">
          <h2 className="text-xl font-semibold">非登录权利请求</h2>
          <p className="mt-3 leading-7 text-[#d8bfaa]">
            正式法务、隐私和客服联系渠道必须在主体与值班安排完成核验后才会公布。当前尚未配置时，请勿向未核验地址发送身份材料、关系证明或原始照片；该事项仍是公开上线前的 Owner 配置门。
          </p>
        </section>
        <RefundCenter />
        <section className="mt-8 rounded-xl border border-[#d5b172]/25 p-5">
          <h2 className="text-xl font-semibold">退款规则</h2>
          <p className="mt-3 whitespace-pre-wrap leading-7 text-[#d8bfaa]">
            {refundPolicy.noReason}{"\n"}{refundPolicy.afterUse}{"\n"}{refundPolicy.manualReview}{"\n"}{refundPolicy.entitlementEnd}
          </p>
        </section>
      </div>
    </main>
  );
}
