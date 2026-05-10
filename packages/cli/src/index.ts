#!/usr/bin/env node
import { Command } from "commander";
import { pathToFileURL } from "node:url";
import {
  MetadataStore,
  SKILLER_VERSION,
  defaultConfig,
  expandHome,
  installLocalSkill,
  scanTargets,
  validateSkill
} from "@skiller/core";
import { printResult } from "./output.js";

interface CliDependencies {
  metadataStore: typeof MetadataStore;
  defaultConfig: typeof defaultConfig;
  expandHome: typeof expandHome;
  installLocalSkill: typeof installLocalSkill;
  scanTargets: typeof scanTargets;
  validateSkill: typeof validateSkill;
  printResult: typeof printResult;
  setExitCode: (code: number) => void;
}

function defaultDependencies(): CliDependencies {
  return {
    metadataStore: MetadataStore,
    defaultConfig,
    expandHome,
    installLocalSkill,
    scanTargets,
    validateSkill,
    printResult,
    setExitCode: (code) => {
      process.exitCode = code;
    }
  };
}

export function createProgram(dependencies: Partial<CliDependencies> = {}): Command {
  const deps = { ...defaultDependencies(), ...dependencies };
  const program = new Command();

  program.name("skiller").description("Manage agent skills").version(SKILLER_VERSION);

  program
    .command("validate")
    .argument("<path>")
    .option("--json", "print JSON")
    .action(async (skillPath: string, options: { json?: boolean }) => {
      const result = await deps.validateSkill(skillPath);
      if (!result.valid) deps.setExitCode(1);
      deps.printResult(options.json ? result : result.valid ? "valid" : "invalid", Boolean(options.json));
    });

  program
    .command("list")
    .option("--json", "print JSON")
    .action(async (options: { json?: boolean }) => {
      const config = deps.defaultConfig();
      const skills = await new deps.metadataStore(deps.expandHome(config.libraryPath)).list();
      deps.printResult(options.json ? skills : skills.map((skill) => skill.name).join("\n"), Boolean(options.json));
    });

  program.command("scan").option("--json", "print JSON").action(async (options: { json?: boolean }) => {
    const config = deps.defaultConfig();
    const result = await deps.scanTargets({
      libraryPath: deps.expandHome(config.libraryPath),
      targetDirectories: config.targetDirectories.map((target) => deps.expandHome(target))
    });
    deps.printResult(options.json ? result : `imported ${result.imported.length} skills`, Boolean(options.json));
  });

  program
    .command("install")
    .argument("<path>")
    .option("--json", "print JSON")
    .action(async (sourcePath: string, options: { json?: boolean }) => {
      const config = deps.defaultConfig();
      const metadata = await deps.installLocalSkill({ sourcePath, libraryPath: deps.expandHome(config.libraryPath) });
      deps.printResult(options.json ? metadata : `installed ${metadata.name}`, Boolean(options.json));
    });

  program
    .command("update")
    .argument("[skill]")
    .option("--json", "print JSON")
    .action(async (skill: string | undefined, options: { json?: boolean }) => {
      const result = { updated: [], skill: skill ?? null };
      deps.printResult(options.json ? result : "no updates applied", Boolean(options.json));
    });

  return program;
}

export async function runCli(argv = process.argv): Promise<void> {
  await createProgram().parseAsync(argv);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
