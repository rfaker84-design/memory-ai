import React from 'react';
import {AbsoluteFill, Composition, interpolate, registerRoot, useCurrentFrame, useVideoConfig} from 'remotion';

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const DURATION_IN_FRAMES = 20 * FPS;
const STAR_COUNT = 2400;
const HEART_X = WIDTH / 2;
const HEART_Y = HEIGHT * 0.62;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const hash = (index: number, salt: number) => {
  const x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453123;
  return x - Math.floor(x);
};

type Star = {
  x: number;
  y: number;
  size: number;
  opacity: number;
  layer: number;
  driftX: number;
  driftY: number;
  twinkleSpeed: number;
  twinklePhase: number;
  warmth: number;
};

const stars: Star[] = Array.from({length: STAR_COUNT}, (_, index) => {
  const layerPick = hash(index, 1);
  const layer = layerPick < 0.52 ? 0 : layerPick < 0.84 ? 1 : 2;
  const layerDepth = [0.26, 0.58, 1][layer];
  const size = interpolate(hash(index, 2), [0, 1], [0.45, 1.9 + layer * 0.35]);
  return {
    x: hash(index, 3) * WIDTH,
    y: hash(index, 4) * HEIGHT,
    size,
    opacity: interpolate(hash(index, 5), [0, 1], [0.1, 0.88]) * layerDepth,
    layer,
    driftX: interpolate(hash(index, 6), [0, 1], [-9, 9]) * layerDepth,
    driftY: interpolate(hash(index, 7), [0, 1], [-5, 5]) * layerDepth,
    twinkleSpeed: interpolate(hash(index, 8), [0, 1], [0.45, 2.1]),
    twinklePhase: hash(index, 9) * Math.PI * 2,
    warmth: hash(index, 10),
  };
});

const HeartLight: React.FC = () => {
  const frame = useCurrentFrame();
  const breath = (Math.sin((frame / (FPS * 6)) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
  const coreScale = interpolate(breath, [0, 1], [0.92, 1.08]);
  const glowScale = interpolate(breath, [0, 1], [0.82, 1.14]);
  const intensity = interpolate(breath, [0, 1], [0.72, 1]);

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: HEART_X - 220,
          top: HEART_Y - 220,
          width: 440,
          height: 440,
          borderRadius: '50%',
          transform: `scale(${glowScale})`,
          background:
            'radial-gradient(circle, rgba(255,238,206,0.36) 0%, rgba(255,226,180,0.20) 15%, rgba(255,210,148,0.075) 34%, rgba(255,210,148,0.018) 56%, rgba(0,0,0,0) 72%)',
          filter: 'blur(18px)',
          opacity: intensity,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: HEART_X - 36,
          top: HEART_Y - 36,
          width: 72,
          height: 72,
          borderRadius: '50%',
          transform: `scale(${coreScale})`,
          background:
            'radial-gradient(circle, rgba(255,255,248,1) 0%, rgba(255,239,207,0.98) 28%, rgba(255,214,159,0.64) 56%, rgba(255,214,159,0) 72%)',
          boxShadow: `0 0 ${90 + breath * 70}px rgba(255,226,184,${0.62 + breath * 0.18})`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: HEART_X - 14,
          top: HEART_Y - 13,
          width: 28,
          height: 26,
          transform: `scale(${coreScale})`,
          filter: `drop-shadow(0 0 ${18 + breath * 12}px rgba(255,245,225,0.88))`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 14,
            top: 8,
            width: 16,
            height: 24,
            background: 'rgba(255,252,239,0.96)',
            borderRadius: '16px 16px 0 0',
            transform: 'rotate(45deg)',
            transformOrigin: '0 100%',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: -2,
            top: 8,
            width: 16,
            height: 24,
            background: 'rgba(255,252,239,0.96)',
            borderRadius: '16px 16px 0 0',
            transform: 'rotate(-45deg)',
            transformOrigin: '100% 100%',
          }}
        />
      </div>
    </>
  );
};

const StarField: React.FC = () => {
  const frame = useCurrentFrame();
  const seconds = frame / FPS;

  return (
    <>
      {stars.map((star, index) => {
        const loop = seconds / 20;
        const driftMultiplier = 0.22 + star.layer * 0.22;
        const x = star.x + Math.sin(loop * Math.PI * 2 + star.twinklePhase) * star.driftX * driftMultiplier;
        const y = star.y + Math.cos(loop * Math.PI * 2 + star.twinklePhase * 0.7) * star.driftY * driftMultiplier;
        const twinkle = (Math.sin(seconds * star.twinkleSpeed + star.twinklePhase) + 1) / 2;
        const opacity = clamp(star.opacity * interpolate(twinkle, [0, 1], [0.38, 1.18]), 0.035, 0.95);
        const color = star.warmth > 0.62 ? '255,231,190' : star.warmth > 0.28 ? '255,244,220' : '235,238,236';
        const blur = star.layer === 0 ? 0.8 : star.layer === 1 ? 0.35 : 0;

        return (
          <div
            key={index}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: star.size,
              height: star.size,
              borderRadius: '50%',
              backgroundColor: `rgba(${color},${opacity})`,
              boxShadow: star.layer === 2 ? `0 0 ${star.size * 4}px rgba(${color},${opacity * 0.55})` : 'none',
              filter: blur ? `blur(${blur}px)` : undefined,
              transform: 'translate3d(0,0,0)',
            }}
          />
        );
      })}
    </>
  );
};

export const WaitingPrototype: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const breath = (Math.sin((frame / (fps * 6)) * Math.PI * 2) + 1) / 2;
  const cameraScale = interpolate(breath, [0, 1], [1, 1.004]);
  const exposure = interpolate(breath, [0, 1], [0.985, 1.02]);

  return (
    <AbsoluteFill style={{backgroundColor: '#000000', overflow: 'hidden'}}>
      <div
        style={{
          position: 'absolute',
          inset: -12,
          transform: `scale(${cameraScale})`,
          transformOrigin: `${HEART_X}px ${HEART_Y}px`,
          opacity: exposure,
        }}
      >
        <StarField />
        <HeartLight />
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 50% 62%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.06) 38%, rgba(0,0,0,0.36) 72%, rgba(0,0,0,0.72) 100%)',
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="WaitingPrototype"
    component={WaitingPrototype}
    durationInFrames={DURATION_IN_FRAMES}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
);

registerRoot(RemotionRoot);
