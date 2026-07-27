export default function ReportPage() {
  return (
    <main className="min-h-screen bg-[#0b0a08] px-6 py-12 text-[#f6eee2]">
      <div className="mx-auto max-w-3xl rounded-2xl border border-[#d5b172]/25 bg-[#18120d] p-8 shadow-[0_28px_80px_rgba(0,0,0,.28)]">
        <h1 className="text-3xl font-bold">投诉、退款与数据删除</h1>
        <p className="mt-6 whitespace-pre-wrap leading-7 text-[#d8bfaa]">
如果你认为某个记忆体侵犯了你的合法权益，或包含未经授权的照片、语音、文字资料，请联系我们处理。

请提供：
1. 你的联系方式
2. 涉及的记忆体名称
3. 权利证明或亲属关系说明
4. 删除、退款或其他处理请求

如需退款，请同时提供订单号或支付时间，便于核验订单状态；退款是否完成及权益状态会以系统确认结果为准。

联系邮箱：support@yijianai.cn
{"\n\n"}
退款规则：
{"\n"}历史订单请通过 support@yijianai.cn 联系人工核验；当前公开版本不提供旧聊天购买卡。
        </p>
      </div>
    </main>
  );
}
