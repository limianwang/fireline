import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

type SourceFile = {
  path: string;
  text: string;
};

const srcDir = dirname(fileURLToPath(import.meta.url));

describe("architecture boundaries", () => {
  it("keeps the engine free of React, DOM, file IO, storage, and wall-clock access", () => {
    const engineSources = readSources(join(srcDir, "engine"));
    const forbiddenPatterns = [
      {
        label: "React import",
        pattern: /from\s+["'](?:react|react-dom)(?:["/'])/,
      },
      {
        label: "DOM global",
        pattern: /\b(?:window|document|HTMLElement|Blob|File)\b/,
      },
      {
        label: "file IO import",
        pattern: /from\s+["'](?:node:fs|fs|node:path|path)["']/,
      },
      {
        label: "browser storage",
        pattern: /\b(?:localStorage|sessionStorage|indexedDB)\b/,
      },
      {
        label: "wall-clock access",
        pattern: /\b(?:new\s+Date\s*\(|Date\.(?:now|UTC|parse)\s*\()/,
      },
    ];

    const violations = engineSources.flatMap((source) =>
      forbiddenPatterns
        .filter(({ pattern }) => pattern.test(source.text))
        .map(({ label }) => `${relative(srcDir, source.path)}: ${label}`),
    );

    expect(violations).toEqual([]);
  });

  it("keeps UI components out of core financial projection formulas", () => {
    const componentSources = readSources(join(srcDir, "components"));
    const forbiddenPatterns = [
      {
        label: "direct core engine module import",
        pattern:
          /from\s+["']\.\.\/engine\/(?:projection|fireLenses|balanceChange|snapshots)["']/,
      },
      {
        label: "core projection formula call",
        pattern:
          /\b(?:projectBalances|calculateFireTarget|calculateFullFireDate|calculateCoastFireDate|calculateBaristaFireDate|calculateFirePercent|fisherRealReturn)\b/,
      },
      {
        label: "Fisher real-return formula",
        pattern: /\(\s*1\s*\+\s*[^)]*Return[^)]*\)\s*\/\s*\(\s*1\s*\+\s*[^)]*inflation/i,
      },
    ];

    const violations = componentSources.flatMap((source) =>
      forbiddenPatterns
        .filter(({ pattern }) => pattern.test(source.text))
        .map(({ label }) => `${relative(srcDir, source.path)}: ${label}`),
    );

    expect(violations).toEqual([]);
  });
});

const readSources = (directory: string): SourceFile[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      return readSources(path);
    }

    if (!/\.(?:ts|tsx)$/.test(entry) || /\.test\.(?:ts|tsx)$/.test(entry)) {
      return [];
    }

    return [{ path, text: readFileSync(path, "utf8") }];
  });
