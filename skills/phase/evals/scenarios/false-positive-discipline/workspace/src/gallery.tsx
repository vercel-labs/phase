export function Gallery({ active }: { active: boolean }) {
  return (
    <div className={active ? 'will-change-transform' : ''}>
      <img className="transition-colors duration-200" alt="" />
    </div>
  );
}
