const sections = [
  {
    title: "我们处理哪些信息",
    content: "忆见会处理你主动提交的登录信息、TA 资料、照片、聊天内容、生成视频、订单与退款必要信息。照片、聊天和视频属于高敏感内容；我们不会把它们当作公开资料展示。公开首发不收集声音、不录音，也不提供声音克隆。",
  },
  {
    title: "用途与边界",
    content: "这些信息只用于你选择的记忆保存、AI 内容生成、播放、客户支持与安全保障。AI 生成内容不代表真人在现实中表达，也不具有真实意识。我们不会将注销中的内容用于产品功能、推荐、训练或新的生成。",
  },
  {
    title: "账户注销后的时间表",
    content: "确认注销后，登录 Session、设备访问与原有 Cookie 会立即失效。人物资料、聊天、照片和视频会停止使用，并在不晚于 7 天内从系统删除；COS 原文件、缩略图、派生文件和可删除的 Provider 副本会在不晚于 30 天内处理并记录删除结果；普通备份按自然轮转，最长不超过 90 天。",
  },
  {
    title: "备份、财务记录与法定保全",
    content: "无法逐用户修改的备份不会被恢复到产品使用中；恢复时会重新应用删除墓碑。订单、退款、发票、投诉和监管调查所需记录与照片、视频、聊天等内容逻辑和物理隔离，只保留最少字段。legal hold 必须记录具体原因、覆盖范围、审批人和到期时间，不能无限期保留全部内容，也不能用于产品功能、训练或生成。",
  },
  {
    title: "删除进度与供应商",
    content: "你可在账户注销页查看任务进度和完成回执。对外部服务商的删除，只有收到可审计结果后才会标记完成；关于已完成 Vidu 产物的删除接口、回执、保存期限、训练使用和数据地域，仍在向供应商取得书面确认，不会把未确认的能力称为已完成。",
  },
  {
    title: "你的选择",
    content: "你可以通过账户设置发起注销，或通过投诉与删除入口申请处理未获授权的资料、退款或其他权利请求。未成年人或受监护账号的注销需要对应监护人完成一次新近身份确认。最终的财务、争议与会计记录保存期限仍须经中国大陆律师和会计复核后确定。",
  },
  {
    title: "公开影像分享",
    content: "照片、聊天和影像默认私密。只有 Owner 主动为已人工审核通过的影像创建分享链接时，才会出现公开只读页面；该页面默认不被搜索收录、不提供原始文件下载，并持续标注为 AI 生成内容。Owner 可以随时撤销链接，撤销后页面和播放都会立即不可访问。",
  },
] as const;

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#0b0a08] px-6 py-12 text-[#f6eee2]">
      <article className="mx-auto max-w-3xl rounded-2xl border border-[#d5b172]/25 bg-[#18120d] p-8 shadow-[0_28px_80px_rgba(0,0,0,.28)]">
        <p className="text-sm text-[#d5b172]">隐私与删除说明（候选）</p>
        <h1 className="mt-2 text-3xl font-bold">隐私政策</h1>
        <p className="mt-6 leading-7 text-[#d8bfaa]">本说明描述忆见当前候选工程中的数据处理与删除边界，不替代尚待完成的中国大陆法律、会计和供应商合规复核。</p>
        <div className="mt-8 grid gap-7">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold text-[#f6eee2]">{section.title}</h2>
              <p className="mt-2 leading-7 text-[#d8bfaa]">{section.content}</p>
            </section>
          ))}
        </div>
        <p className="mt-10 leading-7 text-[#d8bfaa]">需要帮助时，请前往 <a className="text-[#e6c483] underline" href="/report">投诉、退款与数据删除</a>，或阅读 <a className="text-[#e6c483] underline" href="/authorization">上传授权说明</a>。</p>
      </article>
    </main>
  );
}
