import Link from "next/link";
import BottomNav from "@/components/BottomNav";

export default function CompanionPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#02030a] px-5 pb-28 pt-10 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(160,190,255,0.18),transparent_34%),radial-gradient(circle_at_50%_70%,rgba(255,220,180,0.08),transparent_40%),linear-gradient(180deg,#050713,#010106)]" />
      <section className="relative z-10 mx-auto max-w-[430px]">
        <p className="text-xs tracking-[0.42em] text-white/38">COMPANION</p>
        <h1 className="mt-5 text-3xl font-light tracking-[0.18em]">陪伴</h1>
        <p className="mt-4 text-sm leading-7 text-white/52">进入与记忆中那个人的声音、故事和对话空间。</p>

        <div className="mt-8 rounded-[34px] border border-white/10 bg-white/[0.055] p-6 backdrop-blur-2xl">
          <div className="mx-auto h-44 w-32 rounded-full border border-white/15 bg-white/[0.035] shadow-[0_0_90px_rgba(190,215,255,0.2)]" />
          <h2 className="mt-7 text-xl font-light">陪伴体等待唤醒</h2>
          <p className="mt-3 text-sm leading-7 text-white/46">当照片、声音与故事逐步完整，TA 会从光点变成可陪伴的存在。</p>
          <Link
            href="/create-memory"
            className="mt-6 flex h-12 items-center justify-center rounded-2xl bg-white text-sm tracking-[0.18em] text-black"
          >
            开始唤醒
          </Link>
        </div>
      </section>
      <BottomNav />
    </main>
  );
}
