import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { buildProjectionDisplayModel } from "../engine";
import { useHouseholdState } from "../state";
import type { ContributionMode, DisplayMode } from "./AssumptionsSection";
import { formatMoney } from "./fieldFormat";

type ProjectionTab = "chart" | "table";

const accountColors = [
  "#1d4ed8",
  "#0f766e",
  "#b45309",
  "#7c3aed",
  "#be123c",
  "#0369a1",
];

export function ProjectionSection({
  displayMode,
  contributionMode,
}: {
  displayMode: DisplayMode;
  contributionMode: ContributionMode;
}) {
  const state = useHouseholdState();
  const [activeTab, setActiveTab] = useState<ProjectionTab>("chart");
  const projection = useMemo(
    () =>
      buildProjectionDisplayModel(state.current, {
        displayMode,
        includeContributions: contributionMode === "with",
      }),
    [state.current, displayMode, contributionMode],
  );

  return (
    <section className="quant-section" aria-labelledby="projection-title">
      <div className="section-title-row">
        <h2 id="projection-title">5. Projection</h2>
        <div className="segmented-control" aria-label="Projection view">
          <button
            type="button"
            aria-pressed={activeTab === "chart"}
            onClick={() => setActiveTab("chart")}
          >
            Chart
          </button>
          <button
            type="button"
            aria-pressed={activeTab === "table"}
            onClick={() => setActiveTab("table")}
          >
            Table
          </button>
        </div>
      </div>

      {activeTab === "chart" ? (
        <ProjectionChart projection={projection} />
      ) : (
        <ProjectionTable projection={projection} />
      )}
    </section>
  );
}

function ProjectionChart({
  projection,
}: {
  projection: ReturnType<typeof buildProjectionDisplayModel>;
}) {
  if (projection.rows.length === 0) {
    return <div className="empty-cell">No projection available.</div>;
  }

  return (
    <div className="projection-panel" aria-label="Projection chart">
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart
          data={projection.chart_series}
          margin={{ top: 16, right: 24, left: 12, bottom: 8 }}
        >
          <CartesianGrid stroke="#e1e6ee" />
          <XAxis dataKey="year" tickMargin={8} />
          <YAxis width={86} tickFormatter={(value) => formatCompactMoney(Number(value))} />
          <Tooltip
            formatter={(value, name) => [
              formatMoney(Number(value)),
              formatTooltipName(String(name), projection.accounts),
            ]}
            labelFormatter={(label) => `Year ${label}`}
          />
          <Legend />
          {projection.accounts.map((account, index) => (
            <Area
              key={account.id}
              type="monotone"
              dataKey={account.id}
              name={account.name}
              stackId="fire"
              stroke={accountColors[index % accountColors.length]}
              fill={accountColors[index % accountColors.length]}
              fillOpacity={0.62}
            />
          ))}
          <Line
            type="monotone"
            dataKey="fire_target"
            name="FIRE target"
            stroke="#111827"
            strokeDasharray="6 4"
            strokeWidth={2}
            dot={false}
          />
          {projection.markers.map((marker) => (
            <ReferenceLine
              key={`${marker.key}-${marker.year}`}
              x={marker.year}
              stroke="#667085"
              strokeDasharray="3 3"
              label={{ value: marker.label, position: "top", fontSize: 11 }}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProjectionTable({
  projection,
}: {
  projection: ReturnType<typeof buildProjectionDisplayModel>;
}) {
  if (projection.rows.length === 0) {
    return <div className="empty-cell">No projection available.</div>;
  }

  return (
    <div className="table-scroll projection-table-scroll">
      <table className="quant-table projection-table">
        <thead>
          <tr>
            <th>Year</th>
            <th>Age</th>
            {projection.accounts.map((account) => (
              <th key={account.id}>{account.name}</th>
            ))}
            <th>Total</th>
            <th>FIRE target</th>
            <th>Marker</th>
          </tr>
        </thead>
        <tbody>
          {projection.rows.map((row) => (
            <tr key={row.year} className={row.markers.length > 0 ? "marker-row" : undefined}>
              <td>{row.year}</td>
              <td>{row.age}</td>
              {projection.accounts.map((account) => (
                <td key={account.id} className="numeric-cell">
                  {formatMoney(row.account_balances[account.id] ?? 0)}
                </td>
              ))}
              <td className="numeric-cell">{formatMoney(row.total_balance)}</td>
              <td className="numeric-cell">{formatMoney(row.fire_target)}</td>
              <td>{row.markers.length > 0 ? row.markers.join(", ") : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const formatTooltipName = (
  key: string,
  accounts: ReturnType<typeof buildProjectionDisplayModel>["accounts"],
): string => accounts.find((account) => account.id === key)?.name ?? key;

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
