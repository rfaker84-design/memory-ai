export function PresenceSpace() {
  return (
    <div className="presence-space" aria-hidden="true">
      <div className="presence-space__vignette" />
      <div className="presence-space__breath presence-space__breath--one" />
      <div className="presence-space__breath presence-space__breath--two" />
      <div className="presence-space__depth" />
    </div>
  );
}
