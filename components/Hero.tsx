import Link from "next/link";

export default function Hero() {
  return (
    <section
      id="home"
      className="flex min-h-screen flex-col items-center justify-center px-6 pt-24 pb-16 text-center lg:px-8"
    >
      <div className="mx-auto max-w-3xl">
        <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-soft bg-warm-white/80 px-4 py-1.5 text-xs font-medium tracking-wide text-amber-deep backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-warm" />
          AI 驱动的数字记忆
        </p>

        <h1 className="font-serif text-4xl leading-[1.25] font-semibold tracking-tight text-charcoal sm:text-5xl lg:text-6xl">
          让记忆继续
          <br />
          <span className="bg-gradient-to-r from-amber-deep via-amber-warm to-rose-muted bg-clip-text text-transparent">
            陪伴未来
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed font-light text-charcoal-light sm:text-lg sm:leading-relaxed">
          通过 AI 保存亲人的声音、故事与记忆。
          <br className="hidden sm:block" />
          让珍贵的情感，跨越时间，温暖如初。
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="#experience"
            id="experience"
            className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-deep to-amber-warm px-8 py-3.5 text-sm font-medium text-warm-white shadow-lg shadow-amber-warm/25 transition-all hover:shadow-xl hover:shadow-amber-warm/30 hover:brightness-105"
          >
            创建我的记忆体
            <svg
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
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

      <div
        aria-hidden
        className="mt-20 flex items-center gap-3 text-xs text-charcoal-light/60"
      >
        <span className="h-px w-12 bg-amber-soft" />
        <span>温暖 · 永恒 · 陪伴</span>
        <span className="h-px w-12 bg-amber-soft" />
      </div>
    </section>
  );
}
