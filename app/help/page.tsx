import Link from "next/link";

const sectionStyle = {
  border: "1px solid rgba(213,177,114,.25)",
  borderRadius: "1rem",
  background: "#18120d",
  padding: "1.25rem",
} as const;

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-[#0b0a08] px-6 py-12 text-[#f6eee2]">
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <p className="text-sm text-[#d5b172]">忆见帮助</p>
          <h1 className="mt-2 text-3xl font-bold">开始前，你需要知道的事</h1>
          <p className="mt-4 leading-7 text-[#d8bfaa]">
            忆见生成的是 AI 纪念内容，不是现实中的 TA，也不具有意识、记忆或真实意图。
            请只提交你有权使用、且愿意用于纪念体验的资料。
          </p>
        </header>

        <section style={sectionStyle}>
          <h2 className="text-xl font-semibold">创建与资料</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 leading-7 text-[#d8bfaa]">
            <li>先填写你确认的称呼、关系和一段真实资料；不确定时可以留空或稍后补充。</li>
            <li>照片会在正式创建后上传，并与同一个记忆体关联；请勿上传无授权素材。公开首发不收集声音、不录音，也不提供声音克隆。</li>
            <li>照片支持常见图片格式，单个文件上限为 20MB。上传失败时请保留原文件并稍后重试，不要把私密资料发给客服。</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 className="text-xl font-semibold">首次影像与聊天</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 leading-7 text-[#d8bfaa]">
            <li>首次影像可能需要排队和人工审核；在审核通过前不会提供播放或下载。</li>
            <li>AI 回复只能参考你已确认的资料。它不应声称复活、意识、正在看见你，或要求你把它当作唯一依靠。</li>
            <li>不要在聊天中提供身份证号、银行卡号、密码、验证码或支付密码。</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 className="text-xl font-semibold">遇到问题怎么办</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 leading-7 text-[#d8bfaa]">
            <li>登录、上传、生成或播放失败时，请记录页面显示的请求编号和发生时间；已登录用户可通过投诉与删除入口提交可追踪工单。</li>
            <li>如遇到自伤、自杀、暴力或未成年人受害的即时风险，请优先联系当地紧急服务、可信赖的成年人或危机支持资源。</li>
            <li>需要投诉、授权撤销、退款或数据删除时，请使用正式处置入口；账户注销进度会在应用内显示。</li>
            <li><Link href="/settings/data-export" className="underline">下载我的资料副本</Link></li>
          </ul>
          <p className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[#f1c980]">
            <Link href="/report" className="underline">投诉、退款与数据删除</Link>
            <Link href="/settings/account-deletion" className="underline">账户注销进度</Link>
            <Link href="/settings/companion" className="underline">陪伴安全设置</Link>
            <Link href="/privacy" className="underline">隐私政策</Link>
            <Link href="/terms" className="underline">用户协议</Link>
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 className="text-xl font-semibold">常见问题</h2>
          <dl className="mt-3 space-y-4 leading-7 text-[#d8bfaa]">
            <div>
              <dt className="font-semibold text-[#f6eee2]">这是真实的 TA 吗？</dt>
              <dd className="mt-1">不是。忆见提供的是 AI 纪念陪伴内容，不代表真实人物具有意识、真实意图或正在现实中行动。</dd>
            </div>
            <div>
              <dt className="font-semibold text-[#f6eee2]">聊天内容会自动成为长期记忆吗？</dt>
              <dd className="mt-1">不会。只有你主动在“拾忆”中确认的内容，才会成为 TA 可以引用的资料；你可以查看来源、编辑或删除它。</dd>
            </div>
            <div>
              <dt className="font-semibold text-[#f6eee2]">网络中断时，我刚写的话会怎样？</dt>
              <dd className="mt-1">未发送的文字会保留在输入框中，恢复连接后也不会自动发送。请先找回对话，再由你决定是否重试。</dd>
            </div>
            <div>
              <dt className="font-semibold text-[#f6eee2]">怎样提交投诉、退款或数据权利请求？</dt>
              <dd className="mt-1">请通过应用内的投诉、退款与数据删除入口提交；不要把身份证件、照片、声音或聊天正文发送到未核验的地址。</dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  );
}
