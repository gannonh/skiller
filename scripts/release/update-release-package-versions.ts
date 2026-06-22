#!/usr/bin/env tsx
/**
 * update-release-package-versions.ts — align package versions to a release.
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_RELEASE_PACKAGE_FILES = ["apps/desktop/package.json"] as const;

export function setPackageVersion(
  text: string,
  version: string
): { text: string; changed: boolean } {
  const re = /("version"\s*:\s*")([^"]*)(")/;
  const match = re.exec(text);
  if (!match) {
    throw new Error('No "version" field found in package.json');
  }
  if (match[2] === version) {
    return { text, changed: false };
  }
  return { text: text.replace(re, `$1${version}$3`), changed: true };
}

function repoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

interface CliArgs {
  version?: string;
  root?: string;
  files: string[];
  githubOutput: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { files: [], githubOutput: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--root":
        if (!value || value.startsWith("--")) {
          throw new Error("Missing value for --root");
        }
        args.root = value;
        i += 1;
        break;
      case "--file":
        if (!value || value.startsWith("--")) {
          throw new Error("Missing value for --file");
        }
        args.files.push(value);
        i += 1;
        break;
      case "--github-output":
        args.githubOutput = true;
        break;
      default:
        if (flag && !flag.startsWith("--") && args.version === undefined) {
          args.version = flag;
        } else {
          throw new Error(`Unknown argument: ${flag}`);
        }
    }
  }
  return args;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!args.version) {
    throw new Error("Missing positional <version> argument");
  }

  const rootDir = args.root ? resolve(args.root) : repoRoot();
  const files = args.files.length > 0 ? args.files : [...DEFAULT_RELEASE_PACKAGE_FILES];

  let changed = false;
  for (const rel of files) {
    const filePath = resolve(rootDir, rel);
    if (!existsSync(filePath)) {
      throw new Error(`Release package manifest not found: ${filePath}`);
    }
    const original = readFileSync(filePath, "utf-8");
    const result = setPackageVersion(original, args.version);
    if (result.changed) {
      writeFileSync(filePath, result.text);
      changed = true;
      console.log(`Updated ${rel} → ${args.version}`);
    }
  }

  if (!changed) {
    console.log("All package versions already match the release version.");
  }

  if (args.githubOutput) {
    const githubOutput = process.env.GITHUB_OUTPUT;
    if (!githubOutput) {
      throw new Error("GITHUB_OUTPUT is not set");
    }
    appendFileSync(githubOutput, `changed=${changed}\n`);
  }
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  main();
}
