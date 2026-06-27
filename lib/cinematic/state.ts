export const WAITING = "WAITING";
export const RESPONSE = "RESPONSE";
export const AWAKENING = "AWAKENING";
export const REUNION = "REUNION";

export type CinematicState =
  | typeof WAITING
  | typeof RESPONSE
  | typeof AWAKENING
  | typeof REUNION;
