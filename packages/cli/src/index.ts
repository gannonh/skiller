#!/usr/bin/env node
import { Argument, Command } from "commander";
import { pathToFileURL } from "node:url";
import {
  MetadataStore,
  SKILLER_VERSION,
  SkillsShClient,
  checkForSkillUpdates,
  expandHome,
  installLocalSkill,
  loadConfig,
  scanTargets,
  validateSkill
} from "@skiller/core";
import { printResult } from "./output.js";

type LeaderboardType = "all-time" | "trending" | "hot";

interface DiscoverClient {
  search(query: string): Promise<{ skills: Array<Record<string, unknown>> }>;
  leaderboard(type: LeaderboardType): Promise<{ skills: Array<Record<string, unknown>> }>;
}

interface CliDependencies {
  metadataStore: typeof MetadataStore;
  loadConfig: typeof loadConfig;
  checkForSkillUpdates: typeof checkForSkillUpdates;
  expandHome: typeof expandHome;
  installLocalSkill: typeof installLocalSkill;
  scanTargets: typeof scanTargets;
  validateSkill: typeof validateSkill;
  skillsShClient: () => DiscoverClient;
  printResult: typeof printResult;
  setExitCode: (code: number) => void;
}

function defaultDependencies(): CliDependencies {
  return {
    metadataStore: MetadataStore,
    loadConfig,
    checkForSkillUpdates,
    expandHome,
    installLocalSkill,
    scanTargets,
    validateSkill,
    skillsShClient: () => new SkillsShClient(),
    printResult,
    setExitCode: (code) => {
      process.exitCode = code;
    }
  };
}

function formatUpdateSummary(result: Awaited<ReturnType<typeof checkForSkillUpdates>>): string {
  const skillLabel = result.considered.length === 1 ? "skill" : "skills";
  const updateLabel = result.available.length === 1 ? "update" : "updates";
  return `checked ${result.considered.length} ${skillLabel}, ${result.available.length} ${updateLabel} available, ${result.updated.length} updated`;
}

function formatSkillList(skills: Array<Record<string, unknown>>): string {
  return skills
    .map((skill) => {
      const name = skill.name;
      if (typeof name === "string" && name.length > 0) return name;

      const id = skill.id;
      if (typeof id === "string" && id.length > 0) return id;

      return null;
    })
    .filter((value): value is string => value !== null)
    .join("\n");
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
      const config = await deps.loadConfig();
      const skills = await new deps.metadataStore(deps.expandHome(config.libraryPath)).list();
      deps.printResult(options.json ? skills : skills.map((skill) => skill.name).join("\n"), Boolean(options.json));
    });

  program.command("scan").option("--json", "print JSON").action(async (options: { json?: boolean }) => {
    const config = await deps.loadConfig();
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
      const config = await deps.loadConfig();
      const metadata = await deps.installLocalSkill({ sourcePath, libraryPath: deps.expandHome(config.libraryPath) });
      deps.printResult(options.json ? metadata : `installed ${metadata.name}`, Boolean(options.json));
    });

  program
    .command("update")
    .argument("[skill]")
    .option("--json", "print JSON")
    .action(async (skill: string | undefined, options: { json?: boolean }) => {
      const config = await deps.loadConfig();
      const result = await deps.checkForSkillUpdates({
        libraryPath: deps.expandHome(config.libraryPath),
        config,
        skillId: skill
      });
      deps.printResult(options.json ? result : formatUpdateSummary(result), Boolean(options.json));
    });

  const discover = program.command("discover").description("Discover skills from skills.sh");

  discover
    .command("search")
    .description("Search skills.sh")
    .argument("<query>")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const result = await deps.skillsShClient().search(query);
      deps.printResult(options.json ? result : formatSkillList(result.skills), Boolean(options.json));
    });

  discover
    .command("leaderboard")
    .description("Show a skills.sh leaderboard")
    .addArgument(
      new Argument("[type]", "leaderboard type")
        .choices(["all-time", "trending", "hot"])
        .default("trending")
    )
    .option("--json", "print JSON")
    .action(async (type: LeaderboardType, options: { json?: boolean }) => {
      const result = await deps.skillsShClient().leaderboard(type);
      deps.printResult(options.json ? result : formatSkillList(result.skills), Boolean(options.json));
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
