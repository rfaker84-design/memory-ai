import { create } from "zustand";
import type { PresenceState } from "./PresenceState";

type PresenceStore = {
  state: PresenceState;
  setState: (state: PresenceState) => void;
};

export const usePresenceStore = create<PresenceStore>((set) => ({
  state: "WAITING",
  setState: (state) => set({ state }),
}));
