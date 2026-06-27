"use client";

import FilmController from "@/components/cinematic/FilmController";
import HeartLightLayer from "@/components/cinematic/layers/HeartLightLayer";
import TransitionLayer from "@/components/cinematic/layers/TransitionLayer";
import UILayer from "@/components/cinematic/layers/UILayer";
import LoginUI from "@/components/ui/LoginUI";
import {WAITING} from "@/lib/cinematic/state";
import {useRouter} from "next/navigation";

export default function CinematicRoot() {
  const router = useRouter();

  return (
    <main className="relative min-h-screen overflow-hidden bg-black">
      <FilmController state={WAITING} />
      <HeartLightLayer />
      <TransitionLayer />
      <UILayer />
      <LoginUI
        onStart={() => true}
        onExitComplete={() => router.push("/create-memory")}
      />
    </main>
  );
}
