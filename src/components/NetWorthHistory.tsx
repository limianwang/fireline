import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { selectEngineViewModel, useHouseholdState } from "../state";
import { formatMoney } from "./fieldFormat";

export function NetWorthHistory() {
  const state = useHouseholdState();
  const viewModel = selectEngineViewModel(state);
  const rows = viewModel.history_chart_series;

  return (
    <section className="quant-section" aria-labelledby="history-title">
      <div className="section-title-row">
        <h2 id="history-title">Net Worth History & Forecast</h2>
      </div>

      <div className="history-panel">
        {rows.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={rows} margin={{ top: 12, right: 20, left: 12, bottom: 8 }}>
              <CartesianGrid stroke="#e1e6ee" />
              <XAxis dataKey="label" tickMargin={8} />
              <YAxis
                width={86}
                tickFormatter={(value) => formatCompactMoney(Number(value))}
              />
              <Tooltip formatter={(value) => formatMoney(Number(value))} />
              <Legend />
              <Line
                type="monotone"
                dataKey="net_worth"
                name="Net worth"
                stroke="#1d4ed8"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="investable_assets"
                name="Investable assets"
                stroke="#0f766e"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="projected_assets"
                name="Forecast"
                stroke="#b45309"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="fire_target"
                name="FIRE target"
                stroke="#111827"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty-cell">No history yet.</div>
        )}
      </div>
    </section>
  );
}

const formatCompactMoney = (value: number): string => {
  const absoluteValue = Math.abs(value);
  if (absoluteValue >= 1_000_000) {
    return `$${formatCompactNumber(value / 1_000_000)}M`;
  }
  if (absoluteValue >= 1_000) {
    return `$${formatCompactNumber(value / 1_000)}K`;
  }
  return `$${formatCompactNumber(value)}`;
};

const formatCompactNumber = (value: number): string =>
  new Intl.NumberFormat("en-CA", {
    maximumFractionDigits: 1,
  }).format(value);
