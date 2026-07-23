export default function AuthorizationPage() {
  return (
    <main className="min-h-screen bg-[#0b0a08] px-6 py-12 text-[#f6eee2]">
      <div className="mx-auto max-w-3xl rounded-2xl border border-[#d5b172]/25 bg-[#18120d] p-8 shadow-[0_28px_80px_rgba(0,0,0,.28)]">
        <h1 className="text-3xl font-bold">上传授权说明</h1>
        <p className="mt-6 whitespace-pre-wrap leading-7 text-[#d8bfaa]">
上传照片、语音、人生故事前，用户应确认自己拥有相关资料的合法使用权，或已取得近亲属、权利人授权。

忆见生成的 AI 内容仅用于纪念、记录与情感陪伴，不应用于冒充逝者真实表达、财产决定、遗嘱声明、法律承诺或其他严肃决策。
        </p>
      </div>
    </main>
  );
}
