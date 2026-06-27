"use client";

import Lottie, {type LottieRefCurrentProps} from "lottie-react";
import {forwardRef, useEffect, useImperativeHandle, useRef} from "react";

type LottiePlayerProps = {
  animationData: unknown;
  loop?: boolean;
  autoplay?: boolean;
  speed?: number;
  className?: string;
};

export type LottiePlayerHandle = {
  play: () => void;
  pause: () => void;
  replay: () => void;
};

const LottiePlayer = forwardRef<LottiePlayerHandle, LottiePlayerProps>(
  ({animationData, loop = true, autoplay = true, speed = 1, className}, ref) => {
    const lottieRef = useRef<LottieRefCurrentProps>(null);

    useEffect(() => {
      lottieRef.current?.setSpeed(speed);
    }, [speed]);

    useImperativeHandle(ref, () => ({
      play: () => {
        lottieRef.current?.play();
      },
      pause: () => {
        lottieRef.current?.pause();
      },
      replay: () => {
        lottieRef.current?.goToAndPlay(0, true);
      },
    }));

    return (
      <Lottie
        lottieRef={lottieRef}
        animationData={animationData}
        loop={loop}
        autoplay={autoplay}
        className={className}
      />
    );
  }
);

LottiePlayer.displayName = "LottiePlayer";

export default LottiePlayer;
