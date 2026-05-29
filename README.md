# FIRE Calculator

A local-first FIRE checkpoint tool for household financial reviews.

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
- Browser-local save only happens when the user clicks `Save`.

## Features

- Versioned JSON import/export.
- Strict file validation with field-level errors.
- Explicit browser-local working save.
- Account-level return and contribution assumptions.
- Snapshot-based net worth and investable asset history.
- Full FIRE, Coast FIRE, and Barista FIRE projections.
- Real/nominal display toggle.
- Projection with/without contributions.
- Pure deterministic engine based on latest snapshot date, not wall-clock time.

## Development

```bash
npm install
npm run dev
npm test
npm run build
```

## Architecture

- `src/domain`: JSON contracts, Zod schemas, fixtures, and file import/export helpers.
- `src/engine`: pure TypeScript financial calculations and view-model derivation.
- `src/state`: React context, reducer actions, dirty-state tracking, persistence, and selectors.
- `src/components`: UI components that render state and engine outputs.

The engine must not import React, DOM APIs, storage, file IO, or wall-clock APIs. UI code should render engine outputs, not own financial formulas.

## Documentation

- [Product requirements](docs/2026-05-27-fire-calculator-prd-final.md)
- [UI design pattern](docs/2026-05-27-fire-calculator-design.md)

## Contributing

External contributions are not currently being accepted.

Forks are welcome under the Apache-2.0 license.

## License

Apache-2.0. See [LICENSE](LICENSE).

## Disclaimer

This project is for educational and planning purposes only. It is not financial, tax, legal, or investment advice.
