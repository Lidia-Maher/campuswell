/**
 * Chart.js charts in the GP1 style (Table 4.22): line for mood trends, bar for study hours,
 * doughnut for mood distribution.
 */
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";

ChartJS.register(ArcElement, BarElement, CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip);
ChartJS.defaults.font.family = '"Inter", system-ui, sans-serif';
ChartJS.defaults.color = "#6b7280";

const BLUE = "#2e75b6";
const GREEN = "#52b788";
const GRID = "#eef1f5";

/** Mood over time: the daily average, plus the 7-day moving average as a dashed line. */
export function MoodLineChart({ labels, values, average, label = "Mood trend over time" }: {
  labels: string[]; values: (number | null)[]; average?: (number | null)[]; label?: string;
}) {
  return (
    <div className="chart-box" role="img" aria-label={label}>
      <Line
        data={{
          labels,
          datasets: [
            {
              label: "Daily mood",
              data: values,
              borderColor: BLUE,
              backgroundColor: (ctx) => {
                const { chart } = ctx;
                if (!chart.chartArea) return "rgba(46,117,182,0.15)";
                const g = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom);
                g.addColorStop(0, "rgba(46,117,182,0.28)");
                g.addColorStop(1, "rgba(46,117,182,0.02)");
                return g;
              },
              fill: true,
              tension: 0.4,
              pointRadius: 3,
              pointBackgroundColor: BLUE,
              spanGaps: true,
            },
            ...(average
              ? [{
                  label: "7-day average",
                  data: average,
                  borderColor: GREEN,
                  borderDash: [6, 4],
                  borderWidth: 2,
                  pointRadius: 0,
                  tension: 0.4,
                  fill: false,
                  spanGaps: true,
                }]
              : []),
          ],
        }}
        options={{
          maintainAspectRatio: false,
          plugins: { legend: { display: Boolean(average), position: "bottom", labels: { boxWidth: 12 } } },
          scales: {
            y: { min: 1, max: 5, ticks: { stepSize: 1 }, grid: { color: GRID } },
            x: { grid: { display: false } },
          },
        }}
      />
    </div>
  );
}

/** Several series on one axis, e.g. average mood per school. */
export function MultiLineChart({ labels, series, label, min, max }: {
  labels: string[]; series: { name: string; values: (number | null)[]; color: string }[]; label: string; min?: number; max?: number;
}) {
  return (
    <div className="chart-box tall" role="img" aria-label={label}>
      <Line
        data={{
          labels,
          datasets: series.map((s) => ({
            label: s.name, data: s.values, borderColor: s.color, backgroundColor: s.color,
            tension: 0.35, pointRadius: 2, spanGaps: true,
          })),
        }}
        options={{
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { boxWidth: 12 } } },
          scales: { y: { min, max, grid: { color: GRID } }, x: { grid: { display: false } } },
        }}
      />
    </div>
  );
}

export function BarChart({ labels, values, label, color = BLUE, unit = "" }: {
  labels: string[]; values: number[]; label: string; color?: string; unit?: string;
}) {
  return (
    <div className="chart-box" role="img" aria-label={label}>
      <Bar
        data={{ labels, datasets: [{ label, data: values, backgroundColor: color, borderRadius: 6, maxBarThickness: 48 }] }}
        options={{
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (item) => `${item.formattedValue}${unit}` } },
          },
          scales: { y: { beginAtZero: true, grid: { color: GRID } }, x: { grid: { display: false } } },
        }}
      />
    </div>
  );
}

/** Mood bars with a mood line on a second axis (GP1 "Stress vs. Productivity Correlation"). */
export function ComboChart({ labels, bars, line, barLabel, lineLabel }: {
  labels: string[]; bars: number[]; line: (number | null)[]; barLabel: string; lineLabel: string;
}) {
  return (
    <div className="chart-box tall" role="img" aria-label={`${barLabel} and ${lineLabel} per day`}>
      <Bar
        data={{
          labels,
          datasets: [
            { type: "bar" as const, label: barLabel, data: bars, backgroundColor: "rgba(82,183,136,0.35)", borderRadius: 4, yAxisID: "y", order: 2 },
            // @ts-expect-error a line dataset inside a bar chart is supported by Chart.js
            { type: "line" as const, label: lineLabel, data: line, borderColor: BLUE, backgroundColor: BLUE, tension: 0.4, pointRadius: 2, yAxisID: "mood", order: 1, spanGaps: true },
          ],
        }}
        options={{
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { boxWidth: 12 } } },
          scales: {
            y: { beginAtZero: true, grid: { color: GRID }, title: { display: true, text: barLabel } },
            mood: { position: "right", min: 1, max: 5, grid: { display: false }, title: { display: true, text: lineLabel } },
            x: { grid: { display: false } },
          },
        }}
      />
    </div>
  );
}

export function DoughnutChart({ labels, values, colors, label }: {
  labels: string[]; values: number[]; colors: string[]; label: string;
}) {
  return (
    <div className="chart-box short" role="img" aria-label={label}>
      <Doughnut
        data={{ labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 3, borderColor: "#fff" }] }}
        options={{ maintainAspectRatio: false, cutout: "72%", plugins: { legend: { display: false } } }}
      />
    </div>
  );
}
