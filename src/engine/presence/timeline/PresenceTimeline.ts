"use client";

import gsap from "gsap";
import { DirectorConfig } from "../director/DirectorConfig";
import type { PresenceTimelineTargets } from "../states/PresenceState";

export function createPresenceTimeline(targets: PresenceTimelineTargets) {
  const config = DirectorConfig;
  const waiting = gsap.timeline({ repeat: -1, yoyo: true });

  waiting
    .to(targets.cameraRig, {
      y: config.camera.waitingY.to,
      duration: config.camera.waitingY.cycleDuration / 2,
      ease: "sine.inOut",
    }, 0)
    .to(targets.heart.group.scale, {
      x: config.heart.breathScale.to,
      y: config.heart.breathScale.to,
      z: config.heart.breathScale.to,
      duration: config.heart.breathScale.duration / 2,
      ease: "sine.inOut",
    }, 0)
    .to(targets.heart.glow, {
      value: config.heart.glow.waitingTo,
      duration: config.heart.breathScale.duration / 2,
      ease: "sine.inOut",
      onUpdate: () => {
        targets.heart.material.emissiveIntensity = targets.heart.glow.value;
      },
    }, 0)
    .to(targets.fog.density, {
      value: config.fog.flowTo,
      duration: config.fog.flowDuration / 2,
      ease: "sine.inOut",
    }, 0);

  const intro = gsap.timeline();
  intro.fromTo(
    targets.overlay,
    { autoAlpha: 0, y: 18, filter: `blur(${config.overlay.blur}px)` },
    {
      autoAlpha: config.overlay.opacity,
      y: 0,
      filter: "blur(0px)",
      duration: 1.8,
      delay: config.overlay.appearDelay,
      ease: config.timeline.ease,
    },
  );

  const playConnecting = () => {
    waiting.pause();
    intro.kill();

    const timeline = gsap.timeline({ defaults: { ease: config.timeline.ease } });
    timeline
      .call(() => targets.setState("CONNECTING"), [], 0)
      .to(targets.overlay, {
        autoAlpha: 0,
        y: 28,
        filter: `blur(${config.overlay.blur}px)`,
        duration: config.timeline.loginMeltDuration,
      }, 0)
      .to(targets.heart.glow, {
        value: config.heart.glow.connectingTo,
        duration: config.timeline.connectingDuration,
        onUpdate: () => {
          targets.heart.material.emissiveIntensity = targets.heart.glow.value;
        },
      }, 0)
      .to(targets.heart.group.scale, {
        x: config.heart.connectingScale,
        y: config.heart.connectingScale,
        z: config.heart.connectingScale,
        duration: config.timeline.connectingDuration,
      }, 0)
      .to(targets.particles.gather, {
        value: 1,
        duration: config.particle.gatherDuration,
      }, 0)
      .to(targets.cameraRig, {
        z: config.camera.connectingZoom.toZ,
        duration: config.camera.connectingZoom.duration,
      }, 0)
      .call(() => targets.setState("AWAKENING"), [], config.timeline.connectingDuration)
      .to(targets.heart.group.scale, {
        x: config.heart.awakeningScale[0],
        y: config.heart.awakeningScale[1],
        z: config.heart.awakeningScale[2],
        duration: config.timeline.awakeningDuration,
      }, config.timeline.connectingDuration)
      .to(targets.soul.opacity, {
        value: 1,
        duration: config.soul.revealDuration,
      }, config.timeline.connectingDuration)
      .to(targets.soul.wireOpacity, {
        value: 0.34,
        duration: config.soul.revealDuration,
      }, config.timeline.connectingDuration + 0.35)
      .to(targets.particles.opacity, {
        value: 0.18,
        duration: config.soul.revealDuration,
      }, config.timeline.connectingDuration)
      .to(targets.soul.group.scale, {
        x: config.soul.breathScale.to,
        y: config.soul.breathScale.to,
        z: config.soul.breathScale.to,
        duration: config.soul.breathScale.duration / 2,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      }, config.timeline.connectingDuration + config.timeline.awakeningDuration);

    return timeline;
  };

  return { waiting, intro, playConnecting };
}
