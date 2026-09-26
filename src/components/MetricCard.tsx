const toneClass: Record<string, string> = {
  ok: "status-ok",
  watch: "status-watch",
  danger: "status-danger",
};

export function MetricCard({
  label,
  value,
  unit,
  tone = "ok",
  hint,
}: {
  label: string;
  value: string | number;
  unit?: string;
  tone?: "ok" | "watch" | "danger";
  hint?: string;
}) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>
        {value}
        {unit ? <em>{unit}</em> : null}
      </strong>
      {hint ? <p className="metric-hint">{hint}</p> : null}
      <i className={toneClass[tone]} />
    </article>
  );
}
