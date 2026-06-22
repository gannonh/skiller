#!/usr/bin/env tsx
/**
 * merge-update-manifests.ts — merge per-arch Electron update manifests.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, stringify } from "yaml";

type Platform = "mac" | "win";

interface UpdateFile {
  url: string;
  sha512: string;
  size: number;
}

interface UpdateManifest {
  version: string;
  files: UpdateFile[];
  releaseDate: string;
  [key: string]: unknown;
}

interface CliArgs {
  platform?: Platform;
  paths: string[];
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { paths: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--platform") {
      if (value !== "mac" && value !== "win") {
        throw new Error(`--platform must be mac or win, got ${value}`);
      }
      args.platform = value;
      i += 1;
    } else if (flag?.startsWith("--")) {
      throw new Error(`Unknown argument: ${flag}`);
    } else if (flag) {
      args.paths.push(flag);
    }
  }
  return args;
}

function platformLabel(platform: Platform): string {
  return platform === "mac" ? "macOS" : "Windows";
}

export function parseManifest(raw: string, sourcePath: string, label: string): UpdateManifest {
  const manifest = parse(raw) as Partial<UpdateManifest> | null;
  if (!manifest || typeof manifest !== "object") {
    throw new Error(`Invalid ${label} update manifest at ${sourcePath}`);
  }
  if (typeof manifest.version !== "string") {
    throw new Error(`Invalid ${label} update manifest at ${sourcePath}: missing version`);
  }
  if (typeof manifest.releaseDate !== "string") {
    throw new Error(`Invalid ${label} update manifest at ${sourcePath}: missing releaseDate`);
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error(`Invalid ${label} update manifest at ${sourcePath}: missing files`);
  }
  for (const file of manifest.files) {
    if (
      !file ||
      typeof file !== "object" ||
      typeof file.url !== "string" ||
      typeof file.sha512 !== "string" ||
      typeof file.size !== "number"
    ) {
      throw new Error(`Invalid ${label} update manifest at ${sourcePath}: invalid file entry`);
    }
  }
  return manifest as UpdateManifest;
}

export function mergeManifests(
  platform: Platform,
  primary: UpdateManifest,
  secondary: UpdateManifest
): UpdateManifest {
  const label = platformLabel(platform);
  if (primary.version !== secondary.version) {
    throw new Error(
      `Cannot merge ${label} manifests with different versions (${primary.version} vs ${secondary.version})`
    );
  }

  const filesByUrl = new Map<string, UpdateFile>();
  for (const file of [...primary.files, ...secondary.files]) {
    const existing = filesByUrl.get(file.url);
    if (existing && (existing.sha512 !== file.sha512 || existing.size !== file.size)) {
      throw new Error(`Cannot merge ${label} manifests: conflicting file entry for ${file.url}`);
    }
    filesByUrl.set(file.url, file);
  }

  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries({ ...primary, ...secondary })) {
    if (key === "version" || key === "files" || key === "path" || key === "sha512" || key === "releaseDate") {
      continue;
    }
    const primaryValue = primary[key];
    const secondaryValue = secondary[key];
    if (primaryValue !== undefined && secondaryValue !== undefined && primaryValue !== secondaryValue) {
      throw new Error(`Cannot merge ${label} manifests: conflicting '${key}' values`);
    }
    extras[key] = value;
  }

  return {
    version: primary.version,
    files: [...filesByUrl.values()],
    ...extras,
    releaseDate:
      primary.releaseDate >= secondary.releaseDate ? primary.releaseDate : secondary.releaseDate
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!args.platform) {
    throw new Error("Missing --platform");
  }
  if (args.paths.length < 2 || args.paths.length > 3) {
    throw new Error("Expected primary.yml secondary.yml [out.yml]");
  }

  const [primaryArg, secondaryArg, outArg] = args.paths;
  const primaryPath = resolve(primaryArg!);
  const secondaryPath = resolve(secondaryArg!);
  const outPath = resolve(outArg ?? primaryArg!);
  const label = platformLabel(args.platform);

  const primary = parseManifest(readFileSync(primaryPath, "utf-8"), primaryPath, label);
  const secondary = parseManifest(readFileSync(secondaryPath, "utf-8"), secondaryPath, label);
  const merged = mergeManifests(args.platform, primary, secondary);

  writeFileSync(outPath, stringify(merged), "utf-8");
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  main();
}
