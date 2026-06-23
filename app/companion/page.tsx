import Link from "next/link";
import BottomNav from "@/components/BottomNav";

export default function CompanionPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050506] px-5 pb-28 pt-10 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,225,190,0.14),transparent_32%),radial-gradient(circle_at_50%_62%,rgba(255,205,150,0.10),transparent_42%)]" />

      <section className="relative z-10 mx-auto max-w-[430px]">
        <p className="text-xs tracking-[0.4em] text-white/38">COMPANION</p>
        <h1 className="mt-4 text-3xl font-light tracking-[0.18em]">陪伴</h1>
        <p className="mt-4 text-sm leading-7 text-white/52">
          这里是与记忆中那个人重新对话的地方。声音、故事、照片会共同唤醒一个更完整的存在体。
        </p>

        <div className="mt-8 rounded-[34px] border border-white/10 bg-white/[0.055] p-6 backdrop-blur-2xl">
          <div className="mx-auto h-44 w-32 rounded-full border border-white/15 bg-white/[0.035] shadow-[0_0_80px_rgba(255,225,190,0.16)]" />
          <h2 className="mt-7 text-xl font-light">等待被唤醒的灵魂体</h2>
          <p className="mt-3 text-sm leading-7 text-white/48">
            上传照片、声音和故事后，陪伴体会逐步从光点、轮廓、面容到完整形态生成。
          </p>
          <Link
            href="/create-memory"
            className="mt-6 flex h-12 w-full items-center justify-center rounded-2xl bg-white text-sm tracking-[0.18em] text-black"
          >
            开始唤醒
          </Link>
        </div>
      </section>

      <BottomNav />
    </main>
  );
}
