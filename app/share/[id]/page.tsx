import { createClient } from "@supabase/supabase-js";
import { Metadata } from "next";
import Link from "next/link";
import ShareClient from "./ShareClient";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getShareCard(id: string) {
  try {
    const { data } = await supabaseAdmin
      .from("share_cards")
      .select("*, memories(name, relationship, photo_url)")
      .eq("id", id)
      .maybeSingle();
    return data;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const card = await getShareCard(id);
  if (!card) {
    return {
      title: "忆见 - 让思念有回音",
      description: "用AI让思念的人再次对你说话",
    };
  }
  const name = card.memories?.name || "TA";
  const title = card.share_title || name + "对我说的话";
  const description = (card.content_text || "").substring(0, 120);
  return {
    title: title + " | 忆见",
    description,
    openGraph: {
      title: title + " | 忆见",
      description,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const card = await getShareCard(id);
  if (!card) {
    return (
      <main
        className="fixed inset-0 flex flex-col items-center justify-center"
        style={{ background: "#0b0b0f" }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at 50% 35%, rgba(140,110,200,0.06) 0%, transparent 55%)",
          }}
        />
        <div className="relative z-10 text-center px-8">
          <p
            className="text-[48px] mb-6"
            style={{ margin: 0 }}
          >
            🌙
          </p>
          <h1
            className="text-[22px] font-light tracking-[0.1em] mb-3"
            style={{ color: "rgba(225,215,195,0.8)", margin: 0 }}
          >
            这张卡片已经飘走了
          </h1>
          <p
            className="text-[13px] mb-8"
            style={{ color: "rgba(180,170,150,0.35)", margin: 0 }}
          >
            但思念不会消失
          </p>
          <Link
            href="/signup"
            className="inline-block rounded-full px-10 py-3 text-[13px] tracking-[0.08em]"
            style={{
              background: "rgba(140,120,180,0.1)",
              border: "0.5px solid rgba(180,160,200,0.18)",
              color: "rgba(220,210,190,0.75)",
              textDecoration: "none",
            }}
          >
            创建属于你的记忆
          </Link>
        </div>
      </main>
    );
  }
  return <ShareClient card={card} />;
}
