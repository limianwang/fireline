import "./styles.css";
import { useState } from "react";

import { AccountsSection } from "./components/AccountsSection";
import {
  AssumptionsSection,
  type ContributionMode,
  type DisplayMode,
} from "./components/AssumptionsSection";
import { FireStatusSection } from "./components/FireStatusSection";
import { HeaderStrip } from "./components/HeaderStrip";
import { NetWorthHistory } from "./components/NetWorthHistory";
import { ProjectionSection } from "./components/ProjectionSection";
import { SnapshotsSection } from "./components/SnapshotsSection";

function App() {
  const [displayMode, setDisplayMode] = useState<DisplayMode>("real");
  const [contributionMode, setContributionMode] =
    useState<ContributionMode>("with");

  return (
    <main className="app-shell" aria-label="FIRE Calculator">
      <HeaderStrip />
      <AssumptionsSection
        displayMode={displayMode}
        contributionMode={contributionMode}
        onDisplayModeChange={setDisplayMode}
        onContributionModeChange={setContributionMode}
      />
      <AccountsSection />
      <SnapshotsSection />
      <NetWorthHistory />
      <FireStatusSection />
      <ProjectionSection
        displayMode={displayMode}
        contributionMode={contributionMode}
      />
    </main>
  );
}

export default App;
