"use client";

import { useRouter } from "next/navigation";
import CinematicSplash from "../../src/components/splash/CinematicSplash";

export default function SplashPage() {
  const router = useRouter();
  return <CinematicSplash onDone={() => router.push("/")} />;
}