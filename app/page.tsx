"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import { GuestExperience, type HomePerson } from "../components/world/GuestExperience";
import { fetchAuthRequestJson } from "../src/components/auth/authRequestClient";
import { fetchCompanionHomeMemoriesJson } from "../src/components/companion/companionHomeRequest";
import { persistCompanionPrimaryPreference } from "../src/components/companion/companionHomeState";
import { FirstPresenceFlow } from "../src/components/first-presence/FirstPresenceFlow";
import StaticBrandLaunch from "../src/components/launch/StaticBrandLaunch";
import { claimBrandLaunch } from "../src/components/launch/staticBrandLaunchPolicy";
import { loadOwnedMediaUrl } from "../src/components/memory/ownedMemoryClient";
import { MotionProvider } from "../src/motion";

function HomeLoadingFallback() {
  return (
    <main
      role="status"
      aria-live="polite"
      aria-label="正在加载"
      style={{ minHeight: "100dvh", display: "grid", placeItems: "center", alignContent: "center", gap: 10, background: "#0B0A08", color: "#F6EEE2" }}
    >
      <strong style={{ fontSize: 24, letterSpacing: "0.16em" }}>忆见</strong>
      <span style={{ color: "#D5B172", fontSize: 14 }}>正在加载</span>
    </main>
  );
}

const OriginalHomeLogin = dynamic(
  () => import("../components/world/OriginalHomeLogin").then((module) => module.OriginalHomeLogin),
  { ssr: false, loading: () => <HomeLoadingFallback /> }
);

const VISUAL_PREVIEW_ENABLED = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_MEMORYAI_ENABLE_PRESENCE_PREVIEW === "true";

type EntryStage = "checking" | "launch" | "home" | "login" | "preview";
type LoginIntent = "login" | "create";
type SessionPayload = { authenticated?: unknown };
type OwnerMemory = {
  id?: unknown;
  name?: unknown;
  userId?: unknown;
  photoUrl?: unknown;
  photoAssetId?: unknown;
};
type HomeState = { authenticated: boolean; ownerId: string | null; people: HomePerson[] };

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

async function loadHomeState(signal?: AbortSignal): Promise<HomeState> {
  const { response, body } = await fetchAuthRequestJson("/api/auth/session", {
    cache: "no-store",
    credentials: "same-origin",
  }, fetch, signal);
  const payload = body as SessionPayload;
  if (!response.ok || payload.authenticated !== true) {
    return { authenticated: false, ownerId: null, people: [] };
  }

  try {
    const { response: memoriesResponse, body: memoriesBody } = await fetchCompanionHomeMemoriesJson(fetch, signal);
    if (!memoriesResponse.ok || !Array.isArray(memoriesBody)) {
      return { authenticated: true, ownerId: null, people: [] };
    }
    const ownerId = asOptionalString((memoriesBody[0] as OwnerMemory | undefined)?.userId);
    const people = await Promise.all(memoriesBody.slice(0, 3).map(async (item: unknown): Promise<HomePerson | null> => {
      const memory = item as OwnerMemory;
      const id = asOptionalString(memory.id);
      const name = asOptionalString(memory.name);
      if (!id || !name) return null;
      const photoUrl = asOptionalString(memory.photoUrl);
      const assetId = asOptionalString(memory.photoAssetId);
      const image = assetId
        ? await loadOwnedMediaUrl(assetId, signal).catch(() => photoUrl)
        : photoUrl;
      return { id, name, image };
    }));
    return { authenticated: true, ownerId, people: people.filter((person): person is HomePerson => person !== null) };
  } catch {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return { authenticated: true, ownerId: null, people: [] };
  }
}

export default function HomePage() {
  const router = useRouter();
  const [stage, setStage] = useState<EntryStage>("launch");
  const [homeState, setHomeState] = useState<HomeState | null>(null);
  const [launchComplete, setLaunchComplete] = useState(false);
  const [loginIntent, setLoginIntent] = useState<LoginIntent>("login");

  useEffect(() => {
    const controller = new AbortController();
    const showLaunch = claimBrandLaunch(window.sessionStorage);
    if (!showLaunch) {
      setLaunchComplete(true);
      setStage("checking");
    }

    void loadHomeState(controller.signal)
      .then((nextState) => {
        if (!controller.signal.aborted) setHomeState(nextState);
      })
      .catch(() => {
        if (!controller.signal.aborted) setHomeState({ authenticated: false, ownerId: null, people: [] });
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!launchComplete || homeState === null) return;
    setStage("home");
  }, [homeState, launchComplete]);

  const completeLaunch = useCallback(() => setLaunchComplete(true), []);

  const openLogin = useCallback(() => {
    setLoginIntent("login");
    setStage("login");
  }, []);

  const beginCreation = useCallback(() => {
    if (homeState?.authenticated) {
      router.push("/create-memory");
      return;
    }
    setLoginIntent("create");
    setStage("login");
  }, [homeState?.authenticated, router]);

  const completeAuthentication = useCallback(async () => {
    if (loginIntent === "create") {
      router.replace("/create-memory");
      return;
    }
    setStage("checking");
    const nextState = await loadHomeState().catch(() => ({ authenticated: true, ownerId: null, people: [] }));
    setHomeState(nextState);
    setStage("home");
  }, [loginIntent, router]);

  const openCompanion = useCallback((personId: string) => {
    if (homeState?.ownerId) {
      persistCompanionPrimaryPreference(window.localStorage, homeState.ownerId, personId);
    }
    router.push("/companion");
  }, [homeState?.ownerId, router]);

  const returnHome = useCallback(() => {
    setLoginIntent("login");
    setStage("home");
  }, []);

  return (
    <MotionProvider>
      {stage === "checking" && <HomeLoadingFallback />}
      {stage === "launch" && <StaticBrandLaunch onComplete={completeLaunch} ready={homeState !== null} />}
      {stage === "home" && homeState && (
        <GuestExperience
          authenticated={homeState.authenticated}
          people={homeState.people}
          onLogin={openLogin}
          onStart={beginCreation}
          onOpenPerson={openCompanion}
        />
      )}
      {stage === "login" && <OriginalHomeLogin onAuthenticated={completeAuthentication} onBackToExperience={returnHome} onPreview={VISUAL_PREVIEW_ENABLED ? () => setStage("preview") : undefined} />}
      {stage === "preview" && <FirstPresenceFlow initialStage="preview-create" onLeaveHome={returnHome} />}
    </MotionProvider>
  );
}
