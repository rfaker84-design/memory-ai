"use client";

export default function useHaptics() {
  const trigger = (pattern: number | number[]) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  };
  const onDoor = () => trigger(30);
  const onBloom = () => trigger(80);
  const onEnter = () => trigger([20, 30, 20]);
  return { onDoor, onBloom, onEnter };
}
