import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { HouseholdProvider, loadLocalHousehold } from "./state";

const initialEnvelope = loadLocalHousehold() ?? undefined;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HouseholdProvider initialEnvelope={initialEnvelope}>
      <App />
    </HouseholdProvider>
  </StrictMode>
);
