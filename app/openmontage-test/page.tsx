export default function OpenMontageTestPage() {
  return (
    <main className="min-h-screen bg-[#050506] px-4 py-8 text-[#f8eed4]">
      <section className="mx-auto max-w-[960px]">
        <p className="text-xs tracking-[0.34em] text-white/38">YIJIAN INTERNAL VIDEO</p>
        <h1 className="mt-4 text-3xl font-light tracking-[0.12em]">OpenMontage 忆见视频测试</h1>
        <p className="mt-4 text-sm leading-7 text-white/52">
          仅用于内部验收 OpenMontage 生成的静态视频资产，不影响首页、登录页或创建页。
        </p>

        <div className="mt-8 space-y-8">
          <article className="rounded-[28px] border border-white/10 bg-white/[0.045] p-4">
            <h2 className="mb-4 text-lg font-light">login-to-create-transition.mp4</h2>
            <video
              className="w-full rounded-2xl bg-black"
              src="/videos/login-to-create-transition.mp4"
              controls
              playsInline
              preload="metadata"
            />
          </article>

          <article className="rounded-[28px] border border-white/10 bg-white/[0.045] p-4">
            <h2 className="mb-4 text-lg font-light">soul-awakening-create-memory.mp4</h2>
            <video
              className="w-full rounded-2xl bg-black"
              src="/videos/soul-awakening-create-memory.mp4"
              controls
              playsInline
              preload="metadata"
            />
            <p className="mt-3 text-xs leading-6 text-white/40">
              如果该文件尚未生成，播放器会保持空状态；后续生成后会自动可预览。
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
