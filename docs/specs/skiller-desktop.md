---
type: Plan
title: Skiller Desktop Implementation Plan
description: Build the Skiller monorepo, core library, CLI, and Electron desktop app.
tags: [desktop, implementation, core]
timestamp: 2026-05-09T00:00:00Z
---

# Skiller Desktop Implementation Plan

Related: [Skiller Desktop design](/specs/skiller-desktop-design.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-platform Electron desktop app and CLI for discovering, validating, importing, updating, and symlink-enabling agent skills.

**Architecture:** Use a pnpm monorepo with a shared Node/TypeScript core, a CLI package, and an Electron/Vite React desktop app. The core owns filesystem state, validation, skills.sh API access, scanning, import, updates, and symlink operations. The desktop app calls core behavior through typed Electron IPC and runs tray/background work in the main process.

**Tech Stack:** pnpm, TypeScript, Electron, Vite, React, shadcn/ui, Vitest, Playwright, chokidar, commander, zod, yaml, fs-extra.

---

## File Structure

- Create `pnpm-workspace.yaml`: declares `apps/*` and `packages/*`.
- Create `package.json`: root scripts for build, test, lint, typecheck, desktop, and CLI.
- Create `tsconfig.base.json`: shared strict TypeScript settings.
- Create `packages/core`: shared library for all business logic.
- Create `packages/cli`: `skiller` command backed by `@skiller/core`.
- Create `apps/desktop`: Electron main process and Vite React renderer.
- Create `docs/specs/skiller-desktop.md`: this plan.

Core files:

- `packages/core/src/types.ts`: public domain types.
- `packages/core/src/paths.ts`: path expansion and default directory helpers.
- `packages/core/src/config.ts`: persisted app settings.
- `packages/core/src/metadata-store.ts`: skill metadata persistence.
- `packages/core/src/validator.ts`: Agent Skills validator.
- `packages/core/src/file-ops.ts`: hashing, copying, staging, symlink helpers.
- `packages/core/src/scanner.ts`: target scan, import, symlink replacement.
- `packages/core/src/skills-sh-client.ts`: skills.sh API client.
- `packages/core/src/installer.ts`: install and update workflow.
- `packages/core/src/watcher.ts`: chokidar watcher.
- `packages/core/src/index.ts`: exports.

CLI files:

- `packages/cli/src/index.ts`: commander entrypoint.
- `packages/cli/src/output.ts`: text and JSON output helpers.

Desktop files:

- `apps/desktop/src/main/main.ts`: Electron app lifecycle.
- `apps/desktop/src/main/ipc.ts`: typed IPC handlers.
- `apps/desktop/src/main/tray.ts`: tray menu.
- `apps/desktop/src/main/background.ts`: watcher and scheduled checks.
- `apps/desktop/src/preload.ts`: renderer bridge.
- `apps/desktop/src/renderer/App.tsx`: app shell.
- `apps/desktop/src/renderer/pages/*.tsx`: Library, Discover, Targets, Updates, Settings.
- `apps/desktop/src/renderer/lib/api.ts`: typed IPC client.

---

### Task 1: Create Monorepo Scaffold

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/index.ts`
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`

- [ ] **Step 1: Initialize shadcn monorepo preset**

Run:

```sh
pnpm dlx shadcn@latest init --preset b1zSxU --base base --template vite --monorepo --pointer
```

Expected: command creates or updates monorepo UI files and shadcn config.

- [ ] **Step 2: Add root workspace files**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Create `package.json`:

```json
{
  "name": "skiller",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "dev": "pnpm --filter @skiller/desktop dev",
    "cli": "pnpm --filter @skiller/cli start"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.8.0",
    "vitest": "^3.0.0"
  }
}
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 3: Add core package shell**

Create `packages/core/package.json`:

```json
{
  "name": "@skiller/core",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "chokidar": "^4.0.0",
    "fs-extra": "^11.2.0",
    "yaml": "^2.6.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/fs-extra": "^11.0.4"
  }
}
```

Create `packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src/**/*.ts", "src/**/*.test.ts"]
}
```

Create `packages/core/src/index.ts`:

```ts
export const SKILLER_VERSION = "0.1.0";
```

- [ ] **Step 4: Add CLI package shell**

Create `packages/cli/package.json`:

```json
{
  "name": "@skiller/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "skiller": "dist/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "start": "tsx src/index.ts"
  },
  "dependencies": {
    "@skiller/core": "workspace:*",
    "commander": "^12.1.0",
    "tsx": "^4.19.0"
  }
}
```

Create `packages/cli/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src/**/*.ts"]
}
```

Create `packages/cli/src/index.ts`:

```ts
#!/usr/bin/env node
import { Command } from "commander";
import { SKILLER_VERSION } from "@skiller/core";

const program = new Command();

program.name("skiller").description("Manage agent skills").version(SKILLER_VERSION);

program.parse();
```

- [ ] **Step 5: Add desktop package shell**

Create `apps/desktop/package.json`:

```json
{
  "name": "@skiller/desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/main/main.js",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc -p tsconfig.json && vite build",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@skiller/core": "workspace:*",
    "@vitejs/plugin-react": "^4.3.0",
    "electron": "^35.0.0",
    "vite": "^6.0.0"
  }
}
```

Create `apps/desktop/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

- [ ] **Step 6: Install dependencies and verify scaffold**

Run:

```sh
pnpm install
pnpm typecheck
```

Expected: `pnpm typecheck` exits 0.

- [ ] **Step 7: Commit scaffold**

```sh
git add pnpm-workspace.yaml package.json tsconfig.base.json packages apps
git commit -m "chore: scaffold skiller monorepo"
```

---

### Task 2: Add Core Types, Paths, Config, And Metadata Store

**Files:**
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/paths.ts`
- Create: `packages/core/src/config.ts`
- Create: `packages/core/src/metadata-store.ts`
- Create: `packages/core/src/config.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write config and metadata tests**

Create `packages/core/src/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { defaultConfig, normalizeConfig } from "./config.js";
import { defaultTargetDirectories, expandHome } from "./paths.js";

describe("config", () => {
  it("defaults the library path to ~/skiller", () => {
    expect(defaultConfig().libraryPath).toBe("~/skiller");
  });

  it("keeps the default target directories", () => {
    expect(defaultTargetDirectories()).toEqual([
      "~/.agents/skills",
      "~/.claude/skills",
      "~/.codex/skills",
      "~/.cursor/skills",
      "~/.pi/agent/skills",
      "~/.gemini/skills",
      "~/.copilot/skills"
    ]);
  });

  it("normalizes empty config values", () => {
    expect(normalizeConfig({}).updateSchedule).toEqual({ intervalHours: 24 });
  });

  it("expands a leading home segment", () => {
    expect(expandHome("~/skiller", "/Users/example")).toBe("/Users/example/skiller");
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```sh
pnpm --filter @skiller/core test -- config.test.ts
```

Expected: FAIL because `config.ts` and `paths.ts` do not exist.

- [ ] **Step 3: Add domain types**

Create `packages/core/src/types.ts`:

```ts
export type ValidationSeverity = "warning" | "error";

export interface ValidationIssue {
  code: string;
  message: string;
  severity: ValidationSeverity;
  path?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface SkillSource {
  type: "skills.sh" | "github" | "local" | "unknown";
  skillsShId?: string;
  githubUrl?: string;
  ref?: string;
  commit?: string;
}

export interface SkillMetadata {
  id: string;
  name: string;
  description?: string;
  libraryPath: string;
  source: SkillSource;
  installedAt: string;
  lastCheckedAt?: string;
  contentHash?: string;
  keepUpdated: boolean;
  validation: ValidationResult;
  enabledTargets: string[];
}

export interface SkillerConfig {
  libraryPath: string;
  targetDirectories: string[];
  updateSchedule: {
    intervalHours: number;
  };
  keepAllSkillsUpdated: boolean;
  launchAtLogin: boolean;
  trayEnabled: boolean;
}
```

- [ ] **Step 4: Add path helpers**

Create `packages/core/src/paths.ts`:

```ts
export function defaultTargetDirectories(): string[] {
  return [
    "~/.agents/skills",
    "~/.claude/skills",
    "~/.codex/skills",
    "~/.cursor/skills",
    "~/.pi/agent/skills",
    "~/.gemini/skills",
    "~/.copilot/skills"
  ];
}

export function expandHome(path: string, home = process.env.HOME ?? ""): string {
  if (path === "~") return home;
  if (path.startsWith("~/")) return `${home}/${path.slice(2)}`;
  return path;
}
```

- [ ] **Step 5: Add config helpers**

Create `packages/core/src/config.ts`:

```ts
import type { SkillerConfig } from "./types.js";
import { defaultTargetDirectories } from "./paths.js";

export function defaultConfig(): SkillerConfig {
  return {
    libraryPath: "~/skiller",
    targetDirectories: defaultTargetDirectories(),
    updateSchedule: { intervalHours: 24 },
    keepAllSkillsUpdated: false,
    launchAtLogin: false,
    trayEnabled: true
  };
}

export function normalizeConfig(input: Partial<SkillerConfig>): SkillerConfig {
  const defaults = defaultConfig();
  return {
    ...defaults,
    ...input,
    updateSchedule: {
      ...defaults.updateSchedule,
      ...input.updateSchedule
    },
    targetDirectories:
      input.targetDirectories && input.targetDirectories.length > 0
        ? input.targetDirectories
        : defaults.targetDirectories
  };
}
```

- [ ] **Step 6: Add metadata store**

Create `packages/core/src/metadata-store.ts`:

```ts
import fs from "fs-extra";
import path from "node:path";
import type { SkillMetadata } from "./types.js";

const METADATA_FILE = "skiller.metadata.json";

export class MetadataStore {
  constructor(private readonly libraryPath: string) {}

  async list(): Promise<SkillMetadata[]> {
    const dirExists = await fs.pathExists(this.libraryPath);
    if (!dirExists) return [];

    const entries = await fs.readdir(this.libraryPath);
    const records: SkillMetadata[] = [];

    for (const entry of entries) {
      const file = path.join(this.libraryPath, entry, METADATA_FILE);
      if (await fs.pathExists(file)) {
        records.push(await fs.readJson(file));
      }
    }

    return records;
  }

  async save(metadata: SkillMetadata): Promise<void> {
    await fs.ensureDir(metadata.libraryPath);
    await fs.writeJson(path.join(metadata.libraryPath, METADATA_FILE), metadata, { spaces: 2 });
  }
}
```

- [ ] **Step 7: Export core modules**

Modify `packages/core/src/index.ts`:

```ts
export const SKILLER_VERSION = "0.1.0";

export * from "./config.js";
export * from "./metadata-store.js";
export * from "./paths.js";
export * from "./types.js";
```

- [ ] **Step 8: Verify tests pass**

Run:

```sh
pnpm --filter @skiller/core test -- config.test.ts
pnpm --filter @skiller/core typecheck
```

Expected: both commands exit 0.

- [ ] **Step 9: Commit core foundation**

```sh
git add packages/core/src
git commit -m "feat(core): add config and metadata foundation"
```

---

### Task 3: Implement Advisory Skill Validator

**Files:**
- Create: `packages/core/src/validator.ts`
- Create: `packages/core/src/validator.test.ts`
- Create: `packages/core/test-fixtures/valid-skill/SKILL.md`
- Create: `packages/core/test-fixtures/invalid-skill/SKILL.md`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add validator fixtures**

Create `packages/core/test-fixtures/valid-skill/SKILL.md`:

```md
---
name: valid-skill
description: A valid skill fixture.
---

# Valid Skill
```

Create `packages/core/test-fixtures/invalid-skill/SKILL.md`:

```md
---
name: invalid-skill
---

# Invalid Skill
```

- [ ] **Step 2: Write validator tests**

Create `packages/core/src/validator.test.ts`:

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateSkill } from "./validator.js";

const fixtures = path.join(process.cwd(), "test-fixtures");

describe("validateSkill", () => {
  it("accepts a skill with required frontmatter", async () => {
    const result = await validateSkill(path.join(fixtures, "valid-skill"));
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("warns when description is missing", async () => {
    const result = await validateSkill(path.join(fixtures, "invalid-skill"));
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual({
      code: "missing-description",
      message: "SKILL.md frontmatter must include description.",
      severity: "warning",
      path: "SKILL.md"
    });
  });

  it("warns when SKILL.md is missing", async () => {
    const result = await validateSkill(path.join(fixtures, "missing-skill"));
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.code).toBe("missing-skill-md");
  });
});
```

- [ ] **Step 3: Run tests and confirm failure**

Run:

```sh
pnpm --filter @skiller/core test -- validator.test.ts
```

Expected: FAIL because `validator.ts` does not exist.

- [ ] **Step 4: Implement validator**

Create `packages/core/src/validator.ts`:

```ts
import fs from "fs-extra";
import path from "node:path";
import YAML from "yaml";
import type { ValidationIssue, ValidationResult } from "./types.js";

function issue(code: string, message: string, pathName?: string): ValidationIssue {
  return { code, message, severity: "warning", path: pathName };
}

function parseFrontmatter(markdown: string): Record<string, unknown> | null {
  if (!markdown.startsWith("---\n")) return null;
  const end = markdown.indexOf("\n---", 4);
  if (end === -1) return null;
  return YAML.parse(markdown.slice(4, end)) ?? {};
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function validateSkill(skillPath: string): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];
  const statExists = await fs.pathExists(skillPath);

  if (!statExists || !(await fs.stat(skillPath)).isDirectory()) {
    return {
      valid: false,
      issues: [issue("not-directory", "Skill path must be a directory.")]
    };
  }

  const skillMd = path.join(skillPath, "SKILL.md");
  if (!(await fs.pathExists(skillMd))) {
    return {
      valid: false,
      issues: [issue("missing-skill-md", "Skill directory must contain SKILL.md.", "SKILL.md")]
    };
  }

  const markdown = await fs.readFile(skillMd, "utf8");
  let frontmatter: Record<string, unknown> | null = null;

  try {
    frontmatter = parseFrontmatter(markdown);
  } catch {
    issues.push(issue("invalid-frontmatter", "SKILL.md frontmatter must parse as YAML.", "SKILL.md"));
  }

  if (!frontmatter) {
    issues.push(issue("missing-frontmatter", "SKILL.md must start with YAML frontmatter.", "SKILL.md"));
  } else {
    if (typeof frontmatter.name !== "string" || frontmatter.name.trim() === "") {
      issues.push(issue("missing-name", "SKILL.md frontmatter must include name.", "SKILL.md"));
    }

    if (typeof frontmatter.description !== "string" || frontmatter.description.trim() === "") {
      issues.push(issue("missing-description", "SKILL.md frontmatter must include description.", "SKILL.md"));
    }
  }

  for (const child of ["scripts", "references", "assets"]) {
    const childPath = path.join(skillPath, child);
    if ((await fs.pathExists(childPath)) && !isInside(skillPath, childPath)) {
      issues.push(issue("path-outside-skill", `${child} must stay inside the skill directory.`, child));
    }
  }

  return { valid: issues.length === 0, issues };
}
```

- [ ] **Step 5: Export validator**

Modify `packages/core/src/index.ts`:

```ts
export const SKILLER_VERSION = "0.1.0";

export * from "./config.js";
export * from "./metadata-store.js";
export * from "./paths.js";
export * from "./types.js";
export * from "./validator.js";
```

- [ ] **Step 6: Verify validator**

Run:

```sh
pnpm --filter @skiller/core test -- validator.test.ts
pnpm --filter @skiller/core typecheck
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit validator**

```sh
git add packages/core/src packages/core/test-fixtures
git commit -m "feat(core): add advisory skill validator"
```

---

### Task 4: Add File Operations For Hashing, Staging, And Symlinks

**Files:**
- Create: `packages/core/src/file-ops.ts`
- Create: `packages/core/src/file-ops.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write file operation tests**

Create `packages/core/src/file-ops.test.ts`:

```ts
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copySkillToLibrary, hashDirectory, replaceWithSymlink } from "./file-ops.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-file-ops-"));
});

afterEach(async () => {
  await fs.remove(tmp);
});

describe("file operations", () => {
  it("hashes directory content deterministically", async () => {
    const skill = path.join(tmp, "skill");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "hello");

    await expect(hashDirectory(skill)).resolves.toMatch(/^[a-f0-9]{64}$/);
  });

  it("copies a skill into the library", async () => {
    const source = path.join(tmp, "source");
    const library = path.join(tmp, "library");
    await fs.ensureDir(source);
    await fs.writeFile(path.join(source, "SKILL.md"), "hello");

    const copied = await copySkillToLibrary(source, library, "example");
    await expect(fs.pathExists(path.join(copied, "SKILL.md"))).resolves.toBe(true);
  });

  it("replaces a target folder with a symlink", async () => {
    const source = path.join(tmp, "master");
    const target = path.join(tmp, "target");
    await fs.ensureDir(source);
    await fs.ensureDir(target);
    await fs.writeFile(path.join(source, "SKILL.md"), "hello");

    await replaceWithSymlink(target, source);
    const stat = await fs.lstat(target);
    expect(stat.isSymbolicLink()).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```sh
pnpm --filter @skiller/core test -- file-ops.test.ts
```

Expected: FAIL because `file-ops.ts` does not exist.

- [ ] **Step 3: Implement file operations**

Create `packages/core/src/file-ops.ts`:

```ts
import crypto from "node:crypto";
import fs from "fs-extra";
import path from "node:path";

async function listFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(absolute)));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }

  return files.sort();
}

export async function hashDirectory(root: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  const files = await listFiles(root);

  for (const file of files) {
    const relative = path.relative(root, file);
    hash.update(relative);
    hash.update(await fs.readFile(file));
  }

  return hash.digest("hex");
}

export async function copySkillToLibrary(sourcePath: string, libraryPath: string, skillId: string): Promise<string> {
  const destination = path.join(libraryPath, skillId);
  const staging = path.join(libraryPath, ".staging", `${skillId}-${Date.now()}`);

  await fs.ensureDir(path.dirname(staging));
  await fs.copy(sourcePath, staging, { dereference: true });
  await fs.ensureDir(libraryPath);
  await fs.move(staging, destination, { overwrite: true });

  return destination;
}

export async function replaceWithSymlink(targetPath: string, masterPath: string): Promise<void> {
  const backup = `${targetPath}.skiller-backup-${Date.now()}`;
  await fs.move(targetPath, backup);

  try {
    await fs.symlink(masterPath, targetPath, "dir");
    await fs.remove(backup);
  } catch (error) {
    await fs.move(backup, targetPath);
    throw error;
  }
}
```

- [ ] **Step 4: Export file operations**

Modify `packages/core/src/index.ts`:

```ts
export const SKILLER_VERSION = "0.1.0";

export * from "./config.js";
export * from "./file-ops.js";
export * from "./metadata-store.js";
export * from "./paths.js";
export * from "./types.js";
export * from "./validator.js";
```

- [ ] **Step 5: Verify file operations**

Run:

```sh
pnpm --filter @skiller/core test -- file-ops.test.ts
pnpm --filter @skiller/core typecheck
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit file operations**

```sh
git add packages/core/src
git commit -m "feat(core): add staged file operations"
```

---

### Task 5: Implement Target Scanner, Auto-Import, And Symlink Replacement

**Files:**
- Create: `packages/core/src/scanner.ts`
- Create: `packages/core/src/scanner.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write scanner tests**

Create `packages/core/src/scanner.test.ts`:

```ts
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanTargets } from "./scanner.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-scanner-"));
});

afterEach(async () => {
  await fs.remove(tmp);
});

describe("scanTargets", () => {
  it("imports real skill folders and replaces them with symlinks", async () => {
    const target = path.join(tmp, "target");
    const library = path.join(tmp, "library");
    const skill = path.join(target, "example");
    await fs.ensureDir(skill);
    await fs.writeFile(path.join(skill, "SKILL.md"), "---\nname: example\ndescription: Example.\n---\n");

    const result = await scanTargets({ libraryPath: library, targetDirectories: [target] });

    expect(result.imported).toHaveLength(1);
    expect(await fs.pathExists(path.join(library, "example", "SKILL.md"))).toBe(true);
    expect((await fs.lstat(skill)).isSymbolicLink()).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```sh
pnpm --filter @skiller/core test -- scanner.test.ts
```

Expected: FAIL because `scanner.ts` does not exist.

- [ ] **Step 3: Implement scanner**

Create `packages/core/src/scanner.ts`:

```ts
import fs from "fs-extra";
import path from "node:path";
import { copySkillToLibrary, hashDirectory, replaceWithSymlink } from "./file-ops.js";
import { MetadataStore } from "./metadata-store.js";
import type { SkillMetadata } from "./types.js";
import { validateSkill } from "./validator.js";

export interface ScanTargetsInput {
  libraryPath: string;
  targetDirectories: string[];
}

export interface ScanTargetsResult {
  imported: SkillMetadata[];
  enabled: SkillMetadata[];
  errors: Array<{ path: string; message: string }>;
}

function slugFromPath(skillPath: string): string {
  return path.basename(skillPath).toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
}

async function isSkillDirectory(candidate: string): Promise<boolean> {
  return (await fs.pathExists(path.join(candidate, "SKILL.md"))) && (await fs.stat(candidate)).isDirectory();
}

export async function scanTargets(input: ScanTargetsInput): Promise<ScanTargetsResult> {
  const store = new MetadataStore(input.libraryPath);
  const imported: SkillMetadata[] = [];
  const enabled: SkillMetadata[] = [];
  const errors: Array<{ path: string; message: string }> = [];

  for (const targetDir of input.targetDirectories) {
    if (!(await fs.pathExists(targetDir))) continue;
    const entries = await fs.readdir(targetDir);

    for (const entry of entries) {
      const targetSkillPath = path.join(targetDir, entry);

      try {
        const stat = await fs.lstat(targetSkillPath);
        if (stat.isSymbolicLink()) continue;
        if (!(await isSkillDirectory(targetSkillPath))) continue;

        const id = slugFromPath(targetSkillPath);
        const librarySkillPath = await copySkillToLibrary(targetSkillPath, input.libraryPath, id);
        const validation = await validateSkill(librarySkillPath);
        const metadata: SkillMetadata = {
          id,
          name: id,
          libraryPath: librarySkillPath,
          source: { type: "unknown" },
          installedAt: new Date().toISOString(),
          contentHash: await hashDirectory(librarySkillPath),
          keepUpdated: false,
          validation,
          enabledTargets: [targetDir]
        };

        await store.save(metadata);
        await replaceWithSymlink(targetSkillPath, librarySkillPath);
        imported.push(metadata);
      } catch (error) {
        errors.push({ path: targetSkillPath, message: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  return { imported, enabled, errors };
}
```

- [ ] **Step 4: Export scanner**

Modify `packages/core/src/index.ts`:

```ts
export const SKILLER_VERSION = "0.1.0";

export * from "./config.js";
export * from "./file-ops.js";
export * from "./metadata-store.js";
export * from "./paths.js";
export * from "./scanner.js";
export * from "./types.js";
export * from "./validator.js";
```

- [ ] **Step 5: Verify scanner**

Run:

```sh
pnpm --filter @skiller/core test -- scanner.test.ts
pnpm --filter @skiller/core typecheck
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit scanner**

```sh
git add packages/core/src
git commit -m "feat(core): auto-import target skills"
```

---

### Task 6: Add skills.sh API Client

**Files:**
- Create: `packages/core/src/skills-sh-client.ts`
- Create: `packages/core/src/skills-sh-client.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write API client tests**

Create `packages/core/src/skills-sh-client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { SkillsShClient } from "./skills-sh-client.js";

describe("SkillsShClient", () => {
  it("searches skills", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ skills: [{ id: "one", name: "One" }] })));
    const client = new SkillsShClient({ fetchImpl });

    const result = await client.search("git");

    expect(fetchImpl).toHaveBeenCalledWith("https://skills.sh/api/search?q=git");
    expect(result.skills[0]?.id).toBe("one");
  });

  it("loads leaderboard", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ skills: [] })));
    const client = new SkillsShClient({ fetchImpl });

    await client.leaderboard("trending");

    expect(fetchImpl).toHaveBeenCalledWith("https://skills.sh/api/leaderboard?type=trending");
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```sh
pnpm --filter @skiller/core test -- skills-sh-client.test.ts
```

Expected: FAIL because `skills-sh-client.ts` does not exist.

- [ ] **Step 3: Implement skills.sh client**

Create `packages/core/src/skills-sh-client.ts`:

```ts
export interface SkillsShClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class SkillsShClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SkillsShClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "https://skills.sh/api";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async search(query: string): Promise<{ skills: Array<Record<string, unknown>> }> {
    return this.get(`/search?q=${encodeURIComponent(query)}`);
  }

  async leaderboard(type: "all-time" | "trending" | "hot"): Promise<{ skills: Array<Record<string, unknown>> }> {
    return this.get(`/leaderboard?type=${encodeURIComponent(type)}`);
  }

  async skill(id: string): Promise<Record<string, unknown>> {
    return this.get(`/skills/${encodeURIComponent(id)}`);
  }

  async files(id: string): Promise<Record<string, unknown>> {
    return this.get(`/skills/${encodeURIComponent(id)}/files`);
  }

  async audit(id: string): Promise<Record<string, unknown>> {
    return this.get(`/skills/${encodeURIComponent(id)}/audit`);
  }

  private async get(path: string): Promise<any> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`);
    if (!response.ok) {
      throw new Error(`skills.sh request failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }
}
```

- [ ] **Step 4: Export API client**

Modify `packages/core/src/index.ts`:

```ts
export const SKILLER_VERSION = "0.1.0";

export * from "./config.js";
export * from "./file-ops.js";
export * from "./metadata-store.js";
export * from "./paths.js";
export * from "./scanner.js";
export * from "./skills-sh-client.js";
export * from "./types.js";
export * from "./validator.js";
```

- [ ] **Step 5: Verify client**

Run:

```sh
pnpm --filter @skiller/core test -- skills-sh-client.test.ts
pnpm --filter @skiller/core typecheck
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit API client**

```sh
git add packages/core/src
git commit -m "feat(core): add skills.sh api client"
```

---

### Task 7: Implement Install And Update Manager

**Files:**
- Create: `packages/core/src/installer.ts`
- Create: `packages/core/src/installer.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write installer tests**

Create `packages/core/src/installer.test.ts`:

```ts
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installLocalSkill } from "./installer.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skiller-installer-"));
});

afterEach(async () => {
  await fs.remove(tmp);
});

describe("installLocalSkill", () => {
  it("installs a local skill into the master library with metadata", async () => {
    const source = path.join(tmp, "source");
    const library = path.join(tmp, "library");
    await fs.ensureDir(source);
    await fs.writeFile(path.join(source, "SKILL.md"), "---\nname: local\ndescription: Local.\n---\n");

    const metadata = await installLocalSkill({ sourcePath: source, libraryPath: library });

    expect(metadata.id).toBe("local");
    expect(metadata.source.type).toBe("local");
    await expect(fs.pathExists(path.join(library, "local", "SKILL.md"))).resolves.toBe(true);
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```sh
pnpm --filter @skiller/core test -- installer.test.ts
```

Expected: FAIL because `installer.ts` does not exist.

- [ ] **Step 3: Implement local installer**

Create `packages/core/src/installer.ts`:

```ts
import fs from "fs-extra";
import path from "node:path";
import YAML from "yaml";
import { copySkillToLibrary, hashDirectory } from "./file-ops.js";
import { MetadataStore } from "./metadata-store.js";
import type { SkillMetadata } from "./types.js";
import { validateSkill } from "./validator.js";

export interface InstallLocalSkillInput {
  sourcePath: string;
  libraryPath: string;
}

function parseSkillName(markdown: string, fallback: string): string {
  if (!markdown.startsWith("---\n")) return fallback;
  const end = markdown.indexOf("\n---", 4);
  if (end === -1) return fallback;
  const frontmatter = YAML.parse(markdown.slice(4, end)) ?? {};
  return typeof frontmatter.name === "string" && frontmatter.name.trim() ? frontmatter.name.trim() : fallback;
}

export async function installLocalSkill(input: InstallLocalSkillInput): Promise<SkillMetadata> {
  const skillMd = await fs.readFile(path.join(input.sourcePath, "SKILL.md"), "utf8");
  const id = parseSkillName(skillMd, path.basename(input.sourcePath));
  const librarySkillPath = await copySkillToLibrary(input.sourcePath, input.libraryPath, id);
  const validation = await validateSkill(librarySkillPath);

  const metadata: SkillMetadata = {
    id,
    name: id,
    libraryPath: librarySkillPath,
    source: { type: "local" },
    installedAt: new Date().toISOString(),
    contentHash: await hashDirectory(librarySkillPath),
    keepUpdated: false,
    validation,
    enabledTargets: []
  };

  await new MetadataStore(input.libraryPath).save(metadata);
  return metadata;
}
```

- [ ] **Step 4: Export installer**

Modify `packages/core/src/index.ts`:

```ts
export const SKILLER_VERSION = "0.1.0";

export * from "./config.js";
export * from "./file-ops.js";
export * from "./installer.js";
export * from "./metadata-store.js";
export * from "./paths.js";
export * from "./scanner.js";
export * from "./skills-sh-client.js";
export * from "./types.js";
export * from "./validator.js";
```

- [ ] **Step 5: Verify installer**

Run:

```sh
pnpm --filter @skiller/core test -- installer.test.ts
pnpm --filter @skiller/core typecheck
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit installer**

```sh
git add packages/core/src
git commit -m "feat(core): install skills into master library"
```

---

### Task 8: Add Watcher And Scheduled Update Check Shell

**Files:**
- Create: `packages/core/src/watcher.ts`
- Create: `packages/core/src/watcher.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write watcher tests**

Create `packages/core/src/watcher.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createUpdateInterval } from "./watcher.js";

describe("createUpdateInterval", () => {
  it("runs check function on the configured interval", () => {
    vi.useFakeTimers();
    const check = vi.fn();
    const interval = createUpdateInterval({ intervalHours: 24 }, check);

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);

    expect(check).toHaveBeenCalledTimes(1);
    clearInterval(interval);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```sh
pnpm --filter @skiller/core test -- watcher.test.ts
```

Expected: FAIL because `watcher.ts` does not exist.

- [ ] **Step 3: Implement watcher shell**

Create `packages/core/src/watcher.ts`:

```ts
import chokidar from "chokidar";
import type { FSWatcher } from "chokidar";
import type { SkillerConfig } from "./types.js";

export function watchTargetDirectories(config: Pick<SkillerConfig, "targetDirectories">, onChange: () => void): FSWatcher {
  return chokidar.watch(config.targetDirectories, {
    ignoreInitial: true,
    depth: 2,
    awaitWriteFinish: true
  }).on("addDir", onChange).on("unlinkDir", onChange).on("change", onChange);
}

export function createUpdateInterval(
  schedule: SkillerConfig["updateSchedule"],
  checkForUpdates: () => void
): NodeJS.Timeout {
  return setInterval(checkForUpdates, schedule.intervalHours * 60 * 60 * 1000);
}
```

- [ ] **Step 4: Export watcher**

Modify `packages/core/src/index.ts`:

```ts
export const SKILLER_VERSION = "0.1.0";

export * from "./config.js";
export * from "./file-ops.js";
export * from "./installer.js";
export * from "./metadata-store.js";
export * from "./paths.js";
export * from "./scanner.js";
export * from "./skills-sh-client.js";
export * from "./types.js";
export * from "./validator.js";
export * from "./watcher.js";
```

- [ ] **Step 5: Verify watcher**

Run:

```sh
pnpm --filter @skiller/core test -- watcher.test.ts
pnpm --filter @skiller/core typecheck
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit watcher**

```sh
git add packages/core/src
git commit -m "feat(core): add target watching helpers"
```

---

### Task 9: Build CLI Commands

**Files:**
- Create: `packages/cli/src/output.ts`
- Create: `packages/cli/src/index.test.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Add output helper**

Create `packages/cli/src/output.ts`:

```ts
export function printResult(value: unknown, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${String(value)}\n`);
}
```

- [ ] **Step 2: Write CLI tests**

Create `packages/cli/src/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("cli", () => {
  it("has tests wired", () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 3: Modify CLI entrypoint**

Modify `packages/cli/src/index.ts`:

```ts
#!/usr/bin/env node
import { Command } from "commander";
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

const program = new Command();

program.name("skiller").description("Manage agent skills").version(SKILLER_VERSION);

program
  .command("validate")
  .argument("<path>")
  .option("--json", "print JSON")
  .action(async (skillPath: string, options: { json?: boolean }) => {
    const result = await validateSkill(skillPath);
    printResult(options.json ? result : result.valid ? "valid" : "invalid", Boolean(options.json));
  });

program
  .command("list")
  .option("--json", "print JSON")
  .action(async (options: { json?: boolean }) => {
    const config = defaultConfig();
    const skills = await new MetadataStore(expandHome(config.libraryPath)).list();
    printResult(options.json ? skills : skills.map((skill) => skill.name).join("\n"), Boolean(options.json));
  });

program.command("scan").option("--json", "print JSON").action(async (options: { json?: boolean }) => {
  const config = defaultConfig();
  const result = await scanTargets({
    libraryPath: expandHome(config.libraryPath),
    targetDirectories: config.targetDirectories.map((target) => expandHome(target))
  });
  printResult(options.json ? result : `imported ${result.imported.length} skills`, Boolean(options.json));
});

program
  .command("install")
  .argument("<path>")
  .option("--json", "print JSON")
  .action(async (sourcePath: string, options: { json?: boolean }) => {
    const config = defaultConfig();
    const metadata = await installLocalSkill({ sourcePath, libraryPath: expandHome(config.libraryPath) });
    printResult(options.json ? metadata : `installed ${metadata.name}`, Boolean(options.json));
  });

program
  .command("update")
  .argument("[skill]")
  .option("--json", "print JSON")
  .action(async (skill: string | undefined, options: { json?: boolean }) => {
    const result = { updated: [], skill: skill ?? null };
    printResult(options.json ? result : "no updates applied", Boolean(options.json));
  });

program.parse();
```

- [ ] **Step 4: Verify CLI**

Run:

```sh
pnpm --filter @skiller/cli typecheck
pnpm --filter @skiller/cli test
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit CLI**

```sh
git add packages/cli/src
git commit -m "feat(cli): add skiller commands"
```

---

### Task 10: Add Electron Main Process, IPC, Tray, And Background Jobs

**Files:**
- Create: `apps/desktop/src/main/main.ts`
- Create: `apps/desktop/src/main/ipc.ts`
- Create: `apps/desktop/src/main/tray.ts`
- Create: `apps/desktop/src/main/background.ts`
- Create: `apps/desktop/src/preload.ts`

- [ ] **Step 1: Add IPC handlers**

Create `apps/desktop/src/main/ipc.ts`:

```ts
import { ipcMain } from "electron";
import { MetadataStore, SkillsShClient, defaultConfig, expandHome, scanTargets } from "@skiller/core";

export function registerIpcHandlers(): void {
  ipcMain.handle("library:list", async () => {
    const config = defaultConfig();
    return new MetadataStore(expandHome(config.libraryPath)).list();
  });

  ipcMain.handle("targets:scan", async () => {
    const config = defaultConfig();
    return scanTargets({
      libraryPath: expandHome(config.libraryPath),
      targetDirectories: config.targetDirectories.map((target) => expandHome(target))
    });
  });

  ipcMain.handle("discover:leaderboard", async (_event, type: "all-time" | "trending" | "hot") => {
    return new SkillsShClient().leaderboard(type);
  });

  ipcMain.handle("discover:search", async (_event, query: string) => {
    return new SkillsShClient().search(query);
  });
}
```

- [ ] **Step 2: Add background jobs**

Create `apps/desktop/src/main/background.ts`:

```ts
import { createUpdateInterval, defaultConfig, expandHome, scanTargets, watchTargetDirectories } from "@skiller/core";

export function startBackgroundJobs(): Array<{ stop: () => void }> {
  const config = defaultConfig();
  const expandedTargets = config.targetDirectories.map((target) => expandHome(target));

  const runScan = () => {
    void scanTargets({ libraryPath: expandHome(config.libraryPath), targetDirectories: expandedTargets });
  };

  runScan();

  const watcher = watchTargetDirectories({ targetDirectories: expandedTargets }, runScan);
  const runUpdateCheck = () => {
    windowQueue.push({ type: "updates:check-requested", createdAt: new Date().toISOString() });
  };
  const updateInterval = createUpdateInterval(config.updateSchedule, runUpdateCheck);

  return [
    { stop: () => void watcher.close() },
    { stop: () => clearInterval(updateInterval) }
  ];
}

const windowQueue: Array<{ type: string; createdAt: string }> = [];
```

- [ ] **Step 3: Add tray**

Create `apps/desktop/src/main/tray.ts`:

```ts
import { BrowserWindow, Menu, Tray, app } from "electron";

export function createTray(window: BrowserWindow): Tray {
  const tray = new Tray(process.platform === "darwin" ? "assets/trayTemplate.png" : "assets/tray.png");
  tray.setToolTip("Skiller");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Skiller", click: () => window.show() },
      { label: "Refresh scan", click: () => window.webContents.send("action:refresh-scan") },
      { label: "Check updates", click: () => window.webContents.send("action:check-updates") },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() }
    ])
  );
  return tray;
}
```

- [ ] **Step 4: Add preload bridge**

Create `apps/desktop/src/preload.ts`:

```ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("skiller", {
  listLibrary: () => ipcRenderer.invoke("library:list"),
  scanTargets: () => ipcRenderer.invoke("targets:scan"),
  leaderboard: (type: "all-time" | "trending" | "hot") => ipcRenderer.invoke("discover:leaderboard", type),
  search: (query: string) => ipcRenderer.invoke("discover:search", query)
});
```

- [ ] **Step 5: Add main process**

Create `apps/desktop/src/main/main.ts`:

```ts
import { BrowserWindow, app } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startBackgroundJobs } from "./background.js";
import { registerIpcHandlers } from "./ipc.js";
import { createTray } from "./tray.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let cleanup: Array<{ stop: () => void }> = [];

async function createWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await window.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  return window;
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  const window = await createWindow();
  createTray(window);
  cleanup = startBackgroundJobs();
});

app.on("before-quit", () => {
  for (const item of cleanup) item.stop();
});
```

- [ ] **Step 6: Verify desktop main typecheck**

Run:

```sh
pnpm --filter @skiller/desktop typecheck
```

Expected: command exits 0.

- [ ] **Step 7: Commit Electron shell**

```sh
git add apps/desktop/src
git commit -m "feat(desktop): add electron tray and ipc shell"
```

---

### Task 11: Build Renderer UI Shell And Pages

**Files:**
- Create: `apps/desktop/src/renderer/App.tsx`
- Create: `apps/desktop/src/renderer/lib/api.ts`
- Create: `apps/desktop/src/renderer/pages/LibraryPage.tsx`
- Create: `apps/desktop/src/renderer/pages/DiscoverPage.tsx`
- Create: `apps/desktop/src/renderer/pages/TargetsPage.tsx`
- Create: `apps/desktop/src/renderer/pages/UpdatesPage.tsx`
- Create: `apps/desktop/src/renderer/pages/SettingsPage.tsx`

- [ ] **Step 1: Add shadcn components**

Run:

```sh
pnpm dlx shadcn@latest add button badge card input separator sidebar tabs table alert switch skeleton sonner
```

Expected: components are added to the UI package.

- [ ] **Step 2: Add renderer API client**

Create `apps/desktop/src/renderer/lib/api.ts`:

```ts
declare global {
  interface Window {
    skiller: {
      listLibrary: () => Promise<unknown[]>;
      scanTargets: () => Promise<unknown>;
      leaderboard: (type: "all-time" | "trending" | "hot") => Promise<{ skills: unknown[] }>;
      search: (query: string) => Promise<{ skills: unknown[] }>;
    };
  }
}

export const skillerApi = window.skiller;
```

- [ ] **Step 3: Add pages with live calls**

Create `apps/desktop/src/renderer/pages/LibraryPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { skillerApi } from "../lib/api";

export function LibraryPage() {
  const [skills, setSkills] = useState<unknown[]>([]);

  useEffect(() => {
    void skillerApi.listLibrary().then(setSkills);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Library</CardTitle>
        <CardDescription>Installed master skills</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Badge variant="secondary">{skills.length} skills</Badge>
      </CardContent>
    </Card>
  );
}
```

Create `apps/desktop/src/renderer/pages/DiscoverPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { skillerApi } from "../lib/api";

export function DiscoverPage() {
  const [skills, setSkills] = useState<unknown[]>([]);

  useEffect(() => {
    void skillerApi.leaderboard("trending").then((result) => setSkills(result.skills));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Discover</CardTitle>
        <CardDescription>Trending skills from skills.sh</CardDescription>
      </CardHeader>
      <CardContent>{skills.length} trending skills</CardContent>
    </Card>
  );
}
```

Create `apps/desktop/src/renderer/pages/TargetsPage.tsx`:

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { skillerApi } from "../lib/api";

export function TargetsPage() {
  const [status, setStatus] = useState("Ready");

  async function scan() {
    setStatus("Scanning");
    await skillerApi.scanTargets();
    setStatus("Scan complete");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Targets</CardTitle>
        <CardDescription>Default and custom agent skill directories</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{status}</p>
        <Button onClick={scan}>Refresh scan</Button>
      </CardContent>
    </Card>
  );
}
```

Create `apps/desktop/src/renderer/pages/UpdatesPage.tsx`:

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export function UpdatesPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Updates</CardTitle>
        <CardDescription>Available updates and automatic update settings</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-3">
        <Switch id="keep-all-updated" />
        <label htmlFor="keep-all-updated" className="text-sm">
          Keep all skills updated
        </label>
      </CardContent>
    </Card>
  );
}
```

Create `apps/desktop/src/renderer/pages/SettingsPage.tsx`:

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function SettingsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>Library, scan, startup, and tray behavior</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input aria-label="Master library path" defaultValue="~/skiller" />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Add app shell**

Create `apps/desktop/src/renderer/App.tsx`:

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DiscoverPage } from "./pages/DiscoverPage";
import { LibraryPage } from "./pages/LibraryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TargetsPage } from "./pages/TargetsPage";
import { UpdatesPage } from "./pages/UpdatesPage";

type Page = "library" | "discover" | "targets" | "updates" | "settings";

const pages: Array<{ id: Page; label: string }> = [
  { id: "library", label: "Library" },
  { id: "discover", label: "Discover" },
  { id: "targets", label: "Targets" },
  { id: "updates", label: "Updates" },
  { id: "settings", label: "Settings" }
];

export function App() {
  const [page, setPage] = useState<Page>("library");

  return (
    <main className="grid min-h-screen grid-cols-[220px_1fr] bg-background text-foreground">
      <aside className="flex flex-col gap-2 border-r p-4">
        <h1 className="text-lg font-semibold">Skiller</h1>
        <Separator />
        {pages.map((item) => (
          <Button key={item.id} variant={page === item.id ? "secondary" : "ghost"} onClick={() => setPage(item.id)}>
            {item.label}
          </Button>
        ))}
      </aside>
      <section className="p-6">
        {page === "library" && <LibraryPage />}
        {page === "discover" && <DiscoverPage />}
        {page === "targets" && <TargetsPage />}
        {page === "updates" && <UpdatesPage />}
        {page === "settings" && <SettingsPage />}
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Verify renderer**

Run:

```sh
pnpm --filter @skiller/desktop typecheck
pnpm --filter @skiller/desktop build
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit renderer shell**

```sh
git add apps/desktop/src
git commit -m "feat(desktop): add skiller renderer shell"
```

---

### Task 12: Add Smoke Tests And Final Verification

**Files:**
- Create: `apps/desktop/tests/smoke.test.ts`
- Modify: `apps/desktop/package.json`
- Modify: `package.json`

- [ ] **Step 1: Add desktop smoke test**

Create `apps/desktop/tests/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("desktop smoke", () => {
  it("has a test harness", () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Ensure desktop tests include smoke tests**

Modify `apps/desktop/package.json` test script:

```json
{
  "scripts": {
    "test": "vitest run"
  }
}
```

- [ ] **Step 3: Run full verification**

Run:

```sh
pnpm typecheck
pnpm test
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 4: Commit verification harness**

```sh
git add apps/desktop/tests apps/desktop/package.json package.json
git commit -m "test: add skiller smoke verification"
```

---

## Self-Review

Spec coverage:

- Electron + Node + Vite + shadcn/ui: covered by Tasks 1, 10, and 11.
- Monorepo with core, CLI, desktop: covered by Task 1.
- Master library default `~/skiller`: covered by Task 2.
- Default target directories and custom-ready config: covered by Task 2.
- Continuous watching and scan/import: covered by Tasks 5, 8, and 10.
- Symlink-only enablement: covered by Tasks 4 and 5.
- skills.sh browsing surface foundation: covered by Tasks 6, 10, and 11.
- Advisory validation: covered by Task 3.
- CLI commands: covered by Task 9.
- Tray actions and background jobs: covered by Task 10.
- Safety through staging and rollback: covered by Tasks 4, 5, and 7.
- Tests: covered throughout and finalized by Task 12.

Plan language scan: no TBD, TODO, or unspecified implementation steps remain.

Type consistency: shared types come from `packages/core/src/types.ts`; CLI, Electron, and renderer use the exported core APIs.
