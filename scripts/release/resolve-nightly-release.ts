#!/usr/bin/env tsx
/**
 * resolve-nightly-release.ts — compute nightly release version metadata.
 *
 * A nightly is a prerelease of the NEXT patch of the current desktop version,
 * formatted `X.Y.(Z+1)-nightly.YYYYMMDD.N` so it sorts above the current stable
 * release.
 */

import { appendFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveStableCore(version: string): string {
  return version.replace(/[-+].*$/, "");
}

export function resolveNightlyTargetVersion(version: string): string {
  const core = resolveStableCore(version);
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(core);
  if (!match) {
    throw new Error(`Invalid desktop package version '${version}'.`);
  }
  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number(patch) + 1}`;
}

export interface NightlyReleaseMetadata {
  readonly baseVersion: string;
  readonly version: string;
  readonly tag: string;
  readonly name: string;
  readonly shortSha: string;
}

export function resolveNightlyReleaseMetadata(
  baseVersion: string,
  date: string,
  runNumber: number,
  sha: string
): NightlyReleaseMetadata {
  const shortSha = sha.slice(0, 12);
  const version = `${baseVersion}-nightly.${date}.${runNumber}`;
  return {
    baseVersion,
    version,
    tag: `v${version}`,
    name: `Skiller Nightly ${version} (${shortSha})`,
    shortSha
  };
}

function repoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function readDesktopBaseVersion(rootDir: string): string {
  const pkgPath = resolve(rootDir, "apps/desktop/package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
  if (!pkg.version) {
    throw new Error(`Missing version in ${pkgPath}`);
  }
  return resolveNightlyTargetVersion(pkg.version);
}

interface CliArgs {
  date?: string;
  runNumber?: string;
  sha?: string;
  root?: string;
  githubOutput: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { githubOutput: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--date":
        args.date = value;
        i += 1;
        break;
      case "--run-number":
        args.runNumber = value;
        i += 1;
        break;
      case "--sha":
        args.sha = value;
        i += 1;
        break;
      case "--root":
        args.root = value;
        i += 1;
        break;
      case "--github-output":
        args.githubOutput = true;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return args;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (!args.date || !/^\d{8}$/.test(args.date)) {
    throw new Error("--date must be YYYYMMDD");
  }
  const runNumber = Number(args.runNumber);
  if (!Number.isInteger(runNumber) || runNumber < 1) {
    throw new Error("--run-number must be an integer >= 1");
  }
  if (!args.sha || !/^[0-9a-f]{7,40}$/i.test(args.sha)) {
    throw new Error("--sha must be a hex commit sha");
  }

  const baseVersion = readDesktopBaseVersion(args.root ? resolve(args.root) : repoRoot());
  const meta = resolveNightlyReleaseMetadata(baseVersion, args.date, runNumber, args.sha);

  const entries: ReadonlyArray<readonly [string, string]> = [
    ["base_version", meta.baseVersion],
    ["version", meta.version],
    ["tag", meta.tag],
    ["name", meta.name],
    ["short_sha", meta.shortSha]
  ];

  if (args.githubOutput) {
    const githubOutput = process.env.GITHUB_OUTPUT;
    if (!githubOutput) {
      throw new Error("GITHUB_OUTPUT is not set");
    }
    appendFileSync(githubOutput, entries.map(([key, value]) => `${key}=${value}\n`).join(""));
  } else {
    for (const [key, value] of entries) {
      console.log(`${key}=${value}`);
    }
  }
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  main();
}
