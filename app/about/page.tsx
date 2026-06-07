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
    title: "温暖陪伴",
    description:
      "我们相信技术应当传递温度。忆见致力于让 AI 成为连接过去与未来的桥梁，而非冰冷的工具。",
  },
  {
    title: "尊重隐私",
    description:
      "每一份记忆都弥足珍贵。我们采用最高标准的数据安全与隐私保护措施，守护您最私密的情感寄托。",
  },
  {
    title: "传承永恒",
    description:
      "声音、故事、笑容——这些看似微小的片段，构成了一个人独一无二的生命印记。我们帮助这些印记永存。",
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
              忆见 MemoryAI 诞生于一个朴素的愿望——
              让逝去的亲人，以另一种方式继续陪伴我们所爱的人。
            </p>
          </div>

          <div className="mt-16 rounded-3xl border border-amber-soft/60 bg-warm-white/60 p-8 backdrop-blur-sm sm:p-12">
            <h2 className="font-serif text-2xl font-semibold text-charcoal">
              我们的使命
            </h2>
            <p className="mt-4 text-base leading-relaxed text-charcoal-light">
              在快节奏的现代社会中，许多珍贵的家庭记忆正在悄然流失。
              祖辈的故事、父母年轻时的声音、那些来不及记录的温暖瞬间——
              它们构成了我们生命中最深刻的情感纽带。
            </p>
            <p className="mt-4 text-base leading-relaxed text-charcoal-light">
              忆见运用前沿的人工智能技术，帮助您保存、整理并重现亲人的声音与故事，
              创建一个属于您家庭的数字记忆体。这不仅是对过去的致敬，
              更是留给后代最珍贵的礼物。
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
              href="/#experience"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-deep to-amber-warm px-8 py-3.5 text-sm font-medium text-warm-white shadow-lg shadow-amber-warm/25 transition-all hover:brightness-105"
            >
              创建我的记忆体
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
