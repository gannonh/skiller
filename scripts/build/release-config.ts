#!/usr/bin/env tsx
/**
 * release-config.ts — generate the per-build electron-builder publish config.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

export type Channel = "stable" | "nightly";

export const NIGHTLY_VERSION = /-nightly\./;

export function resolveChannelFromVersion(version: string): Channel {
  return NIGHTLY_VERSION.test(version) ? "nightly" : "stable";
}

export interface GitHubPublishConfig {
  provider: "github";
  owner: string;
  repo: string;
  releaseType: "release" | "prerelease";
  channel?: "nightly";
}

export function buildPublishConfig(channel: Channel, repository: string): GitHubPublishConfig {
  const parts = repository.split("/");
  const [owner, repo] = parts;
  if (parts.length !== 2 || !owner || !repo) {
    throw new Error(`Invalid GITHUB_REPOSITORY "${repository}" (expected "owner/repo")`);
  }
  return {
    provider: "github",
    owner,
    repo,
    releaseType: channel === "nightly" ? "prerelease" : "release",
    ...(channel === "nightly" ? { channel: "nightly" as const } : {})
  };
}

const APP_BASE_NAME = "Skiller";

export function resolveProductName(channel: Channel, base = APP_BASE_NAME): string {
  return channel === "nightly" ? `${base} (Nightly)` : base;
}

export interface GenerateOptions {
  base: Record<string, unknown>;
  version: string;
  repository: string;
  channel?: Channel;
}

export function generateConfig(opts: GenerateOptions): Record<string, unknown> {
  const channel = opts.channel ?? resolveChannelFromVersion(opts.version);
  return {
    ...opts.base,
    productName: resolveProductName(channel),
    publish: [buildPublishConfig(channel, opts.repository)]
  };
}

interface CliArgs {
  version?: string;
  channel?: Channel;
  repository?: string;
  base?: string;
  out?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--version":
        args.version = value;
        i += 1;
        break;
      case "--channel":
        if (value !== "stable" && value !== "nightly") {
          throw new Error(`--channel must be "stable" or "nightly", got "${value}"`);
        }
        args.channel = value;
        i += 1;
        break;
      case "--repository":
        args.repository = value;
        i += 1;
        break;
      case "--base":
        args.base = value;
        i += 1;
        break;
      case "--out":
        args.out = value;
        i += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return args;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const basePath = args.base ?? resolve(repoRoot, "apps/desktop/electron-builder.yml");
  const outPath = args.out ?? resolve(repoRoot, "apps/desktop/electron-builder.generated.yml");

  const version = args.version ?? process.env.RELEASE_VERSION;
  if (!version) {
    throw new Error("Missing --version (or RELEASE_VERSION env)");
  }

  const repository = args.repository ?? process.env.GITHUB_REPOSITORY;
  if (!repository) {
    throw new Error("Missing --repository (or GITHUB_REPOSITORY env)");
  }

  const base = parse(readFileSync(basePath, "utf-8")) as Record<string, unknown>;
  const generated = generateConfig({ base, version, repository, channel: args.channel });

  writeFileSync(outPath, stringify(generated), "utf-8");
  console.log(outPath);
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  main();
}
