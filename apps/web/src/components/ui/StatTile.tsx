/** Kartu angka ringkas (DaisyUI stats). `alert` menandai nilai yang perlu perhatian. */
export function StatTile({
  title,
  value,
  hint,
  alert = false,
}: {
  title: string;
  value: string | number;
  hint?: string;
  alert?: boolean;
}) {
  return (
    <div className="stats ev-stat" data-alert={alert}>
      <div className="stat ev-stat__body">
        <div className="stat-title">{title}</div>
        <div className="stat-value ev-stat__value">{value}</div>
        {hint && <div className="stat-desc">{hint}</div>}
      </div>
    </div>
  );
}
