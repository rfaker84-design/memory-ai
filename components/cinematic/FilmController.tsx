"use client";

import BackgroundLayer from "@/components/cinematic/BackgroundLayer";
import {type CinematicState, RESPONSE, WAITING} from "@/lib/cinematic/state";

type FilmControllerProps = {
  state: CinematicState;
};

const RESPONSE_FILM_AVAILABLE = false;

export default function FilmController({state}: FilmControllerProps) {
  if (state === WAITING) {
    return <BackgroundLayer />;
  }

  if (state === RESPONSE) {
    return null;
  }

  return null;
}

export function canEnterResponse() {
  if (!RESPONSE_FILM_AVAILABLE) {
    console.warn("response.mp4 missing");
    return false;
  }

  return true;
}
