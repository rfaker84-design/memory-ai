"use client";

import {useMemo, useState} from "react";
import {
  AWAKENING,
  type CinematicState,
  RESPONSE,
  REUNION,
  WAITING,
} from "@/lib/cinematic/state";

const FILMS: Record<CinematicState, string> = {
  [WAITING]: "/films/waiting.mp4",
  [RESPONSE]: "/films/response.mp4",
  [AWAKENING]: "/films/awakening.mp4",
  [REUNION]: "/films/reunion.mp4",
};

const NEXT_STATE: Partial<Record<CinematicState, CinematicState>> = {
  [WAITING]: RESPONSE,
  [RESPONSE]: AWAKENING,
  [AWAKENING]: REUNION,
};

export default function FilmController() {
  const [state, setState] = useState<CinematicState>(WAITING);
  const src = useMemo(() => FILMS[state], [state]);
  const loop = state === WAITING || state === AWAKENING;

  const handleEnded = () => {
    const nextState = NEXT_STATE[state];

    if (nextState) {
      setState(nextState);
    }
  };

  return (
    <video
      key={src}
      src={src}
      autoPlay
      muted
      playsInline
      preload="auto"
      loop={loop}
      onEnded={handleEnded}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        backgroundColor: "#000000",
      }}
    />
  );
}
