import Link from "next/link";
import BottomNav from "@/components/BottomNav";

export default function HomePage() {
  return (
    <main className="relative mx-auto min-h-screen max-w-[430px] overflow-hidden bg-[#050506] px-5 pb-28 pt-10 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,222,190,0.15),transparent_30%),radial-gradient(circle_at_50%_62%,rgba(120,150,255,0.11),transparent_42%),linear-gradient(180deg,#070707,#020203)]" />
      <div className="absolute left-1/2 top-24 h-52 w-52 -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />

      <section className="relative z-10">
        <p className="text-xs tracking-[0.42em] text-white/38">YIJIAN MEMORY</p>
        <h1 className="mt-5 text-4xl font-light leading-tight tracking-[0.16em]">
          忆见
          <br />
          重新遇见想念的人
        </h1>
        <p className="mt-5 text-sm leading-7 text-white/52">
          通过被授权的照片、声音、故事与记忆，唤醒一个温柔、克制、可信的 AI 陪伴体。
        </p>

        <Link
          href="/create-memory"
          className="mt-8 flex h-13 items-center justify-center rounded-2xl bg-white text-sm tracking-[0.18em] text-black"
        >
          创建我的记忆体
        </Link>

        <div className="mt-9 rounded-[34px] border border-white/10 bg-white/[0.055] p-6 backdrop-blur-2xl">
          <div className="mx-auto h-44 w-32 rounded-full border border-white/15 bg-white/[0.035] shadow-[0_0_90px_rgba(255,225,190,0.18)]" />
          <h2 className="mt-7 text-xl font-light">灵魂体唤醒中</h2>
          <p className="mt-3 text-sm leading-7 text-white/48">
            上传照片、声音和故事后，记忆体会从光点、轮廓、面部到完整亲人形态逐步生成。
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Link href="/companion" className="rounded-3xl border border-white/10 bg-white/[0.045] p-5">
            <p className="text-lg">陪伴</p>
            <p className="mt-2 text-xs leading-5 text-white/42">进入对话与声音陪伴</p>
          </Link>
          <Link href="/memories" className="rounded-3xl border border-white/10 bg-white/[0.045] p-5">
            <p className="text-lg">记忆</p>
            <p className="mt-2 text-xs leading-5 text-white/42">管理照片声音故事</p>
          </Link>
        </div>
      </section>

      <BottomNav />
    </main>
  );
}
