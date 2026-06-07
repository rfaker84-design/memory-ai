import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-amber-soft/60 bg-warm-white/40 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-6 py-12 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-warm to-amber-deep text-xs font-semibold text-warm-white">
              忆
            </span>
            <span className="font-serif text-base font-semibold text-charcoal">
              忆见 MemoryAI
            </span>
          </Link>

          <div className="flex gap-6 text-sm text-charcoal-light">
            <Link href="/" className="transition-colors hover:text-charcoal">
              首页
            </Link>
            <Link
              href="/about"
              className="transition-colors hover:text-charcoal"
            >
              关于我们
            </Link>
          </div>

          <p className="text-sm text-charcoal-light/70">
            &copy; {new Date().getFullYear()} 忆见 MemoryAI. 保留所有权利。
          </p>
        </div>
      </div>
    </footer>
  );
}
