#!/usr/bin/env tsx
/**
 * prepare-github-release.ts — rename installers, refresh updater manifests, and render release notes.
 */

import { prepareReleaseAssets } from "./release-asset-names.ts";

interface CliArgs {
  dist?: string;
  repository?: string;
  tag?: string;
  version?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--dist":
        args.dist = value;
        i += 1;
        break;
      case "--repository":
        args.repository = value;
        i += 1;
        break;
      case "--tag":
        args.tag = value;
        i += 1;
        break;
      case "--version":
        args.version = value;
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
  if (!args.dist || !args.repository || !args.tag || !args.version) {
    throw new Error("Usage: prepare-github-release.ts --dist <dir> --repository owner/repo --tag vX.Y.Z --version X.Y.Z");
  }

  const result = prepareReleaseAssets({
    distDir: args.dist,
    repository: args.repository,
    tag: args.tag,
    version: args.version
  });

  console.log(result.bodyPath);
  for (const fileName of result.fileNames) {
    if (fileName !== "release-body.md") {
      console.log(fileName);
    }
  }
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  main();
}
