"use client";

import {useRef} from "react";
import LottiePlayer, {type LottiePlayerHandle} from "@/components/lottie/LottiePlayer";
import heartLight from "@/public/lottie/heart-light.json";
import loading from "@/public/lottie/loading.json";
import logo from "@/public/lottie/logo.json";
import uploadSuccess from "@/public/lottie/upload-success.json";

type PreviewItemProps = {
  title: string;
  animationData: unknown;
};

function PreviewItem({title, animationData}: PreviewItemProps) {
  const playerRef = useRef<LottiePlayerHandle>(null);

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
      <div className="mb-4 flex h-40 items-center justify-center rounded-2xl bg-black">
        <LottiePlayer
          ref={playerRef}
          animationData={animationData}
          loop
          autoplay={false}
          speed={1}
          className="h-28 w-28"
        />
      </div>
      <h2 className="mb-4 text-lg font-medium text-white">{title}</h2>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => playerRef.current?.play()}
          className="rounded-full bg-white px-4 py-2 text-sm text-black"
        >
          播放
        </button>
        <button
          type="button"
          onClick={() => playerRef.current?.pause()}
          className="rounded-full border border-white/20 px-4 py-2 text-sm text-white"
        >
          暂停
        </button>
        <button
          type="button"
          onClick={() => playerRef.current?.replay()}
          className="rounded-full border border-white/20 px-4 py-2 text-sm text-white"
        >
          重新播放
        </button>
      </div>
    </section>
  );
}

export default function LottiePreviewPage() {
  return (
    <main className="min-h-screen bg-black px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <p className="mb-3 text-xs uppercase tracking-[0.32em] text-white/40">
          YIJIAN Lottie System
        </p>
        <h1 className="mb-8 text-3xl font-semibold">Lottie Preview</h1>
        <div className="grid gap-5 md:grid-cols-2">
          <PreviewItem title="Heart Light" animationData={heartLight} />
          <PreviewItem title="Logo" animationData={logo} />
          <PreviewItem title="Loading" animationData={loading} />
          <PreviewItem title="Upload Success" animationData={uploadSuccess} />
        </div>
      </div>
    </main>
  );
}
