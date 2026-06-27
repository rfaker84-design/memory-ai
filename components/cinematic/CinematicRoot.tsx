"use client";

import FilmController, {canEnterResponse} from "@/components/cinematic/FilmController";
import HeartLightLayer from "@/components/cinematic/layers/HeartLightLayer";
import TransitionLayer from "@/components/cinematic/layers/TransitionLayer";
import UILayer from "@/components/cinematic/layers/UILayer";
import LoginUI from "@/components/ui/LoginUI";
import {RESPONSE, type CinematicState, WAITING} from "@/lib/cinematic/state";
import {useState} from "react";

export default function CinematicRoot() {
  const [state, setState] = useState<CinematicState>(WAITING);

  return (
    <main className="relative min-h-screen overflow-hidden bg-black">
      <FilmController state={state} />
      <HeartLightLayer />
      <TransitionLayer />
      <UILayer />
      {state === WAITING ? (
        <LoginUI
          onStart={canEnterResponse}
          onExitComplete={() => setState(RESPONSE)}
        />
      ) : null}
    </main>
  );
}
