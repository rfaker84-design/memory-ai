import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "关于我们 — 忆见 MemoryAI",
  description:
    "了解忆见 MemoryAI 的使命与愿景，我们用 AI 技术守护每一份珍贵的记忆。",
};

const values = [
  {
    title: "温和支持",
    description:
      "忆见用 AI 帮你整理已经确认的资料与故事，但不会替代现实中的亲人、朋友或支持系统。",
  },
  {
    title: "尊重隐私",
    description:
      "每一份资料都弥足珍贵。我们以最小化处理、明确确认和可追踪删除为原则；公开上线前仍会接受外部合规复核。",
  },
  {
    title: "留住可确认的资料",
    description:
      "你可以保存自己确认过的照片、叙述和资料来源；忆见不会猜测补齐经历，也不会把 AI 内容说成真实人物。",
  },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen">
      <Navbar />

      <section className="pt-28 pb-20 sm:pt-32">
        <div className="mx-auto max-w-4xl px-6 lg:px-8">
          <div className="text-center">
            <h1 className="font-serif text-4xl font-semibold text-charcoal sm:text-5xl">
              关于我们
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-charcoal-light">
              忆见 MemoryAI 源于一个朴素的愿望——
              帮助人们把已经确认的珍贵资料妥善整理、保存，并以清晰标注的 AI 纪念内容重新阅读。
            </p>
          </div>

          <div className="mt-16 rounded-3xl border border-amber-soft/60 bg-warm-white/60 p-8 backdrop-blur-sm sm:p-12">
            <h2 className="font-serif text-2xl font-semibold text-charcoal">
              我们的使命
            </h2>
            <p className="mt-4 text-base leading-relaxed text-charcoal-light">
              在快节奏的现代社会中，许多珍贵的家庭记忆正在悄然流失。
              家人的故事、旧照片和那些来不及记录的温暖瞬间——
              都可能成为值得妥善保存的资料；不确定的部分可以留白，而不由系统猜测补齐。
            </p>
            <p className="mt-4 text-base leading-relaxed text-charcoal-light">
              忆见运用人工智能技术，帮助你保存、整理并基于已确认资料生成纪念内容。
              首发不收集声音、不录音，也不提供声音克隆；所有 AI 内容都不代表真实人物具有意识、意图或现实行动。
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {values.map((value) => (
              <div
                key={value.title}
                className="rounded-2xl border border-amber-soft/40 bg-warm-white/50 p-6 backdrop-blur-sm transition-all hover:border-amber-soft hover:shadow-md"
              >
                <h3 className="font-serif text-lg font-semibold text-charcoal">
                  {value.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-charcoal-light">
                  {value.description}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-16 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-deep to-amber-warm px-8 py-3.5 text-sm font-medium text-warm-white shadow-lg shadow-amber-warm/25 transition-all hover:brightness-105"
            >
              返回首页
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
