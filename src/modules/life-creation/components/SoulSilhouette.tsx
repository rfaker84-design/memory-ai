interface SoulSilhouetteProps {
  active: boolean;
}

export function SoulSilhouette({ active }: SoulSilhouetteProps) {
  return (
    <div className={`soul-silhouette${active ? " soul-silhouette--active" : ""}`} aria-hidden="true">
      <div className="soul-silhouette__halo" />
      <div className="soul-silhouette__head" />
      <div className="soul-silhouette__torso" />
      <div className="soul-silhouette__line soul-silhouette__line--left" />
      <div className="soul-silhouette__line soul-silhouette__line--right" />
      <div className="soul-silhouette__mist soul-silhouette__mist--one" />
      <div className="soul-silhouette__mist soul-silhouette__mist--two" />
    </div>
  );
}
