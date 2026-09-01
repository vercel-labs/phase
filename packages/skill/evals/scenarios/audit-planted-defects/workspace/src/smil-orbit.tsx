export function SmilOrbit() {
  return (
    <svg viewBox="0 0 100 100" aria-label="Syncing">
      <circle cx="50" cy="12" r="5">
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 50 50"
          to="360 50 50"
          dur="1.5s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}
