import type { formatters } from "@/i18n/format";

// Server Component: barras de venta neta y margen por mes, en SVG (sin
// librería). Los colores van por clase para que cambien con el tema.

type Month = { month: string; net: string; margin: string };

const WIDTH = 720;
const HEIGHT = 200;
const BOTTOM = 24;
const BAR_GAP = 2;

export function MonthlyChart({
  data,
  locale,
  format,
  labels,
}: {
  /** Los 12 meses en orden, con 0 donde no hubo ventas. */
  data: Month[];
  locale: string;
  format: ReturnType<typeof formatters>;
  labels: { title: string; net: string; margin: string };
}) {
  const max = Math.max(1, ...data.map((month) => Number(month.net)));
  const slot = WIDTH / data.length;
  const bar = (slot - 12) / 2;
  const plot = HEIGHT - BOTTOM;
  const height = (value: string) =>
    Math.max(0, (Number(value) / max) * (plot - 8));
  const monthName = new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-center gap-4 text-sm">
        <span className="font-medium">{labels.title}</span>
        <span className="flex items-center gap-1 text-xs opacity-80">
          <span className="inline-block size-3 rounded-sm bg-sky-600 dark:bg-sky-400" />
          {labels.net}
        </span>
        <span className="flex items-center gap-1 text-xs opacity-80">
          <span className="inline-block size-3 rounded-sm bg-emerald-600 dark:bg-emerald-400" />
          {labels.margin}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={labels.title}
        className="h-auto w-full"
      >
        <line
          x1={0}
          x2={WIDTH}
          y1={plot}
          y2={plot}
          className="stroke-current opacity-20"
        />
        {data.map((month, index) => {
          const x = index * slot + 6;
          const net = height(month.net);
          const margin = height(month.margin);
          const label = monthName.format(
            new Date(`${month.month}-01T00:00:00Z`),
          );
          return (
            <g key={month.month}>
              <title>
                {`${label}: ${labels.net} ${format.money(month.net)} · ${labels.margin} ${format.money(month.margin)}`}
              </title>
              <rect
                x={x}
                y={plot - net}
                width={bar - BAR_GAP}
                height={net}
                className="fill-sky-600 dark:fill-sky-400"
              />
              <rect
                x={x + bar}
                y={plot - margin}
                width={bar - BAR_GAP}
                height={margin}
                className="fill-emerald-600 dark:fill-emerald-400"
              />
              <text
                x={x + bar}
                y={HEIGHT - 6}
                textAnchor="middle"
                className="fill-current text-[11px] opacity-70"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
