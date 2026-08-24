export default function AuthorizationPage() {
  return (
    <main className="min-h-screen bg-[#f4ede2] px-6 py-12 text-[#302820]">
      <div className="mx-auto max-w-3xl rounded-3xl border border-[#b98b4f]/30 bg-[#fffaf2] p-8 shadow-[0_18px_56px_rgba(77,53,27,.12)]">
        <h1 className="text-3xl font-bold">上传授权说明</h1>
        <p className="mt-6 whitespace-pre-wrap leading-7 text-[#5d4b3a]">
上传照片、语音、人生故事前，用户应确认自己拥有相关资料的合法使用权，或已取得近亲属、权利人授权。

忆见生成的 AI 内容仅用于纪念、记录与情感陪伴，不应用于冒充真实人物、财产决定、遗嘱声明、法律承诺或其他严肃决策。
        </p>
      </div>
    </main>
  );
}
