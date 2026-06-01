# Fireline

Local-first FIRE checkpoint tool for household financial reviews.

The app helps answer three questions:

- What changed since the last snapshot?
- When do current assumptions reach Coast, Barista, and Full FIRE?
- What changes when contributions are turned on or off?

It is not a budgeting app, tax planner, bank connector, investment advisor, or retirement advice product.

## Privacy Model

- No backend.
- No authentication.
- No bank integration.
- No cloud sync.
- No hidden autosave.
- Financial data stays in the browser unless the user exports a JSON file.
- Browser-local save happens only when the user clicks `Save` or imports a valid JSON file.
- `Export JSON` downloads a portable backup file.
- `Reset` clears the browser-local save and starts from a fresh household.

## Features

- Versioned JSON import/export.
- Strict file validation with field-level errors.
- Explicit browser-local save with dirty-state tracking.
- Editable household name, owners, assumptions, accounts, and snapshots.
- Account-level nominal return, owner, FIRE inclusion, and annual/monthly/no-contribution settings.
- Snapshot-based net worth history.
- Full FIRE, Coast FIRE, and Barista FIRE projections.
- Real and nominal projection display modes.
- Projection toggle with or without future contributions.
- Withdrawal assumptions by rate or fixed annual amount.
- Post-retirement drawdown projection.
- Pure deterministic engine based on latest snapshot date, not wall-clock time.

## Development

Requires Node.js and npm.

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm test
npm run build
```

## Architecture

- `src/domain`: JSON contracts, Zod schemas, fixtures, and file import/export helpers.
- `src/engine`: pure TypeScript financial calculations and view-model derivation.
- `src/state`: React context, reducer actions, dirty-state tracking, persistence, and selectors.
- `src/components`: UI components that render state and engine outputs.

The engine must not import React, DOM APIs, storage, file IO, or wall-clock APIs. UI code should render engine outputs, not own financial formulas.

## Contributing

External contributions are not currently being accepted.

Forks are welcome under the Apache-2.0 license.

## License

Apache-2.0. See [LICENSE](LICENSE).

## Disclaimer

This project is for educational and planning purposes only. It is not financial, tax, legal, or investment advice.
