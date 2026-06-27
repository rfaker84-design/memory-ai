import FilmController from "@/components/cinematic/FilmController";
import BackgroundLayer from "@/components/cinematic/layers/BackgroundLayer";
import HeartLightLayer from "@/components/cinematic/layers/HeartLightLayer";
import TransitionLayer from "@/components/cinematic/layers/TransitionLayer";
import UILayer from "@/components/cinematic/layers/UILayer";

export default function CinematicRoot() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black">
      <BackgroundLayer />
      <FilmController />
      <HeartLightLayer />
      <TransitionLayer />
      <UILayer />
    </main>
  );
}
