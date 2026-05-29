import { selectEngineViewModel, useHouseholdState } from "../state";
import { formatMoney, formatPercent } from "./fieldFormat";

const lensDefinitions = {
  coast_fire:
    "Coast FIRE: current assets can grow to the full FIRE target by retirement without more contributions.",
  barista_fire:
    "Barista FIRE: portfolio withdrawals plus barista income can cover annual expenses before retirement.",
  full_fire:
    "Full FIRE: projected retirement assets meet or exceed the FIRE target.",
} as const;

export function FireStatusSection() {
  const state = useHouseholdState();
  const viewModel = selectEngineViewModel(state);
  const current = viewModel.current;
  const hasActionableStatus = current !== null && viewModel.fire.fire_target > 0;
  const progressPercent = viewModel.fire.fire_percent;
  const progressLabel = hasActionableStatus ? formatPercent(progressPercent) : "—";
  const progressValue = hasActionableStatus
    ? Math.max(0, Math.min(progressPercent, 1))
    : 0;
  const progressWidth = `${progressValue * 100}%`;
  const gap = viewModel.fire.gap_to_fire;
  const targetLabel =
    viewModel.fire.fire_target > 0 ? formatMoney(viewModel.fire.fire_target) : "Set expenses";
  const gapLabel = hasActionableStatus && gap >= 0 ? "Surplus" : "Gap";
  const gapValue = hasActionableStatus ? formatMoney(Math.abs(gap)) : "—";

  return (
    <section className="quant-section" aria-labelledby="fire-status-title">
      <div className="section-title-row">
        <h2 id="fire-status-title">4. FIRE Status</h2>
      </div>

      <div className="fire-status-grid">
        <div className="status-panel">
          <div className="status-metrics">
            <StatusMetric label="FIRE target" value={targetLabel} />
            <StatusMetric
              label="Projected assets"
              value={current ? formatMoney(current.investable_assets) : "No snapshot"}
            />
            <StatusMetric
              label={gapLabel}
              value={gapValue}
              tone={
                hasActionableStatus ? (gap >= 0 ? "positive" : "negative") : undefined
              }
            />
            <StatusMetric label="Progress" value={progressLabel} />
          </div>

          <div
            className="progress-track"
            role="progressbar"
            aria-label="FIRE progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressValue * 100)}
          >
            <div className="progress-fill" style={{ width: progressWidth }} />
          </div>
          {!hasActionableStatus ? (
            <p className="status-note">
              Add expenses and a snapshot to calculate FIRE progress.
            </p>
          ) : null}
          {hasActionableStatus && progressPercent > 1 ? (
            <p className="status-note">Target exceeded; progress is capped visually.</p>
          ) : null}
          {viewModel.warnings.length > 0 ? (
            <ul className="warning-list" aria-label="FIRE warnings">
              {viewModel.warnings.map((warning, index) => (
                <li key={`${warning.code}-${index}`}>{warning.message}</li>
              ))}
            </ul>
          ) : null}
        </div>

        <LensTimeline
          currentYear={current?.year}
          startYear={current?.year}
          endYear={viewModel.projection_rows.at(-1)?.year}
          lenses={[
            {
              key: "coast_fire",
              label: "Coast",
              date: viewModel.fire.coast_fire,
              guideline: `Guideline: current assets must grow to the ${formatMoney(viewModel.fire.fire_target)} FIRE target by retirement without more contributions.`,
              projectedPortfolio: projectedPortfolioAt(
                viewModel.projection_rows,
                viewModel.fire.coast_fire?.year,
              ),
            },
            {
              key: "barista_fire",
              label: "Barista",
              date: viewModel.fire.barista_fire,
              guideline: `Guideline: withdrawals plus ${formatMoney(state.current.assumptions.barista_combined_income)} barista income must cover ${formatMoney(state.current.assumptions.annual_expenses)} annual expenses.`,
              projectedPortfolio: projectedPortfolioAt(
                viewModel.projection_rows,
                viewModel.fire.barista_fire?.year,
              ),
            },
            {
              key: "full_fire",
              label: "Full FIRE",
              date: viewModel.fire.full_fire,
              guideline: `Guideline: projected retirement assets must reach the ${formatMoney(viewModel.fire.fire_target)} FIRE target.`,
              projectedPortfolio: projectedPortfolioAt(
                viewModel.projection_rows,
                viewModel.fire.full_fire?.year,
              ),
            },
          ]}
        />
      </div>
    </section>
  );
}

function StatusMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className={tone ? `status-metric status-metric-${tone}` : "status-metric"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LensTimeline({
  currentYear,
  startYear,
  endYear,
  lenses,
}: {
  currentYear?: number;
  startYear?: number;
  endYear?: number;
  lenses: {
    key: keyof typeof lensDefinitions;
    label: string;
    date: { year: number; age: number } | null;
    guideline: string;
    projectedPortfolio?: number;
  }[];
}) {
  const timelineStart = startYear ?? currentYear ?? lenses[0]?.date?.year ?? 0;
  const datedYears = lenses.flatMap((lens) =>
    lens.date ? [lens.date.year] : [],
  );
  const timelineEnd = Math.max(endYear ?? timelineStart + 1, ...datedYears);
  const yearRange = Math.max(1, timelineEnd - timelineStart);

  return (
    <div className="lens-panel" aria-label="FIRE lens timeline">
      {lenses.map((lens) => {
        const isReached =
          lens.date !== null && currentYear !== undefined && lens.date.year <= currentYear;
        const endLabel = lens.date
          ? `${lens.date.year}, age ${lens.date.age}`
          : "Not reached in projection";
        const status = lens.date
          ? isReached
            ? `✓ Reached · ${endLabel}`
            : endLabel
          : endLabel;
        const projectedPortfolioText =
          lens.projectedPortfolio !== undefined
            ? `Projected portfolio at this date: ${formatMoney(lens.projectedPortfolio)}`
            : "Projected portfolio at this date: unavailable";
        const atDateText =
          lens.projectedPortfolio !== undefined
            ? `At this date: ${formatMoney(lens.projectedPortfolio)}`
            : "At this date: unavailable";
        const accessibleDescription = `${lensDefinitions[lens.key]} ${lens.guideline} ${projectedPortfolioText}`;
        const markerPercent = lens.date
          ? Math.max(
              0,
              Math.min(100, ((lens.date.year - timelineStart) / yearRange) * 100),
            )
          : 0;

        return (
          <div
            key={lens.key}
            className={isReached ? "lens-item lens-reached" : "lens-item"}
            title={accessibleDescription}
            aria-label={`${lens.label}. ${status}. ${accessibleDescription}`}
          >
            <div className="lens-header">
              <span>{lens.label}</span>
              <button
                type="button"
                className="tooltip-button"
                title={accessibleDescription}
                aria-label={`${lens.label} definition: ${accessibleDescription}`}
              >
                ?
              </button>
            </div>
            <div className="lens-timeline-track" aria-hidden="true">
              <div
                className="lens-timeline-fill"
                style={{ width: `${lens.date ? markerPercent : 0}%` }}
              />
              {lens.date ? (
                <span
                  className="lens-timeline-marker"
                  style={{ left: `${markerPercent}%` }}
                />
              ) : null}
            </div>
            <span className="lens-end-label">{endLabel}</span>
            <strong>{status}</strong>
            <p className="lens-guideline">
              {lens.guideline}
              <span>{atDateText}</span>
            </p>
          </div>
        );
      })}
    </div>
  );
}

const projectedPortfolioAt = (
  rows: ReturnType<typeof selectEngineViewModel>["projection_rows"],
  year: number | undefined,
): number | undefined =>
  year === undefined
    ? undefined
    : rows.find((row) => row.year === year)?.total_balance;
