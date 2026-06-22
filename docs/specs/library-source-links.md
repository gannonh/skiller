---
type: Plan
title: Library Source Links Implementation Plan
description: Make GitHub-backed Library Source column URLs clickable via renderer helpers and Electron IPC.
tags: [library, desktop, github]
timestamp: 2026-05-16T00:00:00Z
---

# Library Source Links Implementation Plan

Related: [Library source links design](/specs/library-source-links-design.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GitHub-backed Library Source column URLs clickable and open the source `SKILL.md` file in the user's default browser.

**Architecture:** Keep URL derivation in the renderer source helper module so display and click behavior share the same source metadata. Use the existing preload IPC bridge to ask the Electron main process to open external URLs with `shell.openExternal`. Leave local and unknown sources as text-only rows.

**Tech Stack:** React, TypeScript, Electron IPC, Vitest, pnpm.

---

## File Structure

- Modify `apps/desktop/src/renderer/lib/skill-source.ts`: add `sourceUrl(skill)` and a small path encoder helper.
- Modify `apps/desktop/src/renderer/pages/LibraryPage.test.tsx`: add helper tests for URL generation.
- Modify `apps/desktop/src/renderer/lib/api.ts`: add `openExternal` to `SkillerApi` and the browser preview API.
- Modify `apps/desktop/src/preload.cts`: expose `openExternal(url)` through `contextBridge`.
- Modify `apps/desktop/src/main/ipc.ts`: register the Electron main-process IPC handler using `shell.openExternal`.
- Modify `apps/desktop/src/renderer/pages/LibraryPage.tsx`: render a clickable source detail for GitHub-backed sources.

## Task 1: Add tested source URL derivation

**Files:**
- Modify: `apps/desktop/src/renderer/lib/skill-source.ts`
- Test: `apps/desktop/src/renderer/pages/LibraryPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add `sourceUrl` to the existing import in `apps/desktop/src/renderer/pages/LibraryPage.test.tsx`:

```ts
import { sourceLabel, sourceUrl } from "../lib/skill-source.js";
```

Add these tests inside `describe("LibraryPage helpers", () => { ... })`, near the existing source-label test:

```ts
  it("derives clickable GitHub source URLs for SKILL.md files", () => {
    expect(
      sourceUrl({
        ...skill({ id: "github-root" }),
        source: { type: "github", githubUrl: "https://github.com/example/skills" }
      })
    ).toBe("https://github.com/example/skills/blob/HEAD/SKILL.md");

    expect(
      sourceUrl({
        ...skill({ id: "github-path" }),
        source: {
          type: "github",
          githubUrl: "https://github.com/example/skills/",
          githubPath: "skills/agent browser",
          ref: "main"
        }
      })
    ).toBe("https://github.com/example/skills/blob/main/skills/agent%20browser/SKILL.md");
  });

  it("derives clickable skills registry source URLs for SKILL.md files", () => {
    expect(
      sourceUrl({
        ...skill({ id: "registry" }),
        source: {
          type: "skills.sh",
          skillsShId: "registry",
          githubUrl: "https://github.com/example/skills",
          githubPath: "skills/registry"
        }
      })
    ).toBe("https://github.com/example/skills/blob/HEAD/skills/registry/SKILL.md");
  });

  it("does not derive clickable URLs for local sources", () => {
    expect(sourceUrl(skill({ id: "local" }))).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm --filter @skiller/desktop test -- LibraryPage.test.tsx
```

Expected: FAIL because `sourceUrl` is not exported.

- [ ] **Step 3: Implement the helper**

In `apps/desktop/src/renderer/lib/skill-source.ts`, add this helper after the import:

```ts
function encodeGithubPath(value: string): string {
  return value
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
```

Add this exported function after `sourceDetail`:

```ts
export function sourceUrl(skill: SkillMetadata): string | null {
  if (skill.source.type !== "github" && skill.source.type !== "skills.sh") return null;

  const githubUrl = skill.source.githubUrl.replace(/\/+$/g, "");
  const githubPath = encodeGithubPath(skill.source.githubPath ?? "");
  const skillFilePath = githubPath ? `${githubPath}/SKILL.md` : "SKILL.md";

  return `${githubUrl}/blob/${encodeGithubPath(skill.source.ref ?? "HEAD")}/${skillFilePath}`;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```bash
pnpm --filter @skiller/desktop test -- LibraryPage.test.tsx
```

Expected: PASS for the LibraryPage helper test file.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/lib/skill-source.ts apps/desktop/src/renderer/pages/LibraryPage.test.tsx
git commit -m "test(desktop): cover library source urls"
```

## Task 2: Add external-open IPC bridge

**Files:**
- Modify: `apps/desktop/src/renderer/lib/api.ts`
- Modify: `apps/desktop/src/preload.cts`
- Modify: `apps/desktop/src/main/ipc.ts`

- [ ] **Step 1: Update the renderer API type**

In `apps/desktop/src/renderer/lib/api.ts`, add this method to `SkillerApi` after `installAppUpdate`:

```ts
  openExternal: (url: string) => Promise<void>;
```

Add this method to `createBrowserPreviewApi()` near the other app/system methods:

```ts
    openExternal: async (url) => {
      window.open(url, "_blank", "noopener,noreferrer");
    },
```

- [ ] **Step 2: Expose preload API**

In `apps/desktop/src/preload.cts`, add this method inside the `contextBridge.exposeInMainWorld("skiller", { ... })` object:

```ts
  openExternal: (url: string) => ipcRenderer.invoke("system:open-external", url),
```

Place it near the app update methods or before the event listener methods.

- [ ] **Step 3: Register the main-process handler**

In `apps/desktop/src/main/ipc.ts`, change the Electron import to:

```ts
import { dialog, ipcMain, shell } from "electron";
```

Add this handler inside `registerIpcHandlers`, near the app update handlers:

```ts
  ipcMain.handle("system:open-external", async (_event, url: string) => {
    await shell.openExternal(url);
  });
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm --filter @skiller/desktop typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/lib/api.ts apps/desktop/src/preload.cts apps/desktop/src/main/ipc.ts
git commit -m "feat(desktop): expose external link opening"
```

## Task 3: Render clickable Source URLs

**Files:**
- Modify: `apps/desktop/src/renderer/pages/LibraryPage.tsx`

- [ ] **Step 1: Import the source URL helper**

Change the import in `apps/desktop/src/renderer/pages/LibraryPage.tsx` from:

```ts
import { sourceDetail, sourceLabel } from "../lib/skill-source.js";
```

to:

```ts
import { sourceDetail, sourceLabel, sourceUrl } from "../lib/skill-source.js";
```

- [ ] **Step 2: Add a source detail renderer**

Add this component near the existing small helper functions, after `sortSkills`:

```tsx
function SourceDetail({ skill }: { skill: SkillMetadata }) {
  const detail = sourceDetail(skill);
  const url = sourceUrl(skill);

  if (!url) {
    return <span className="max-w-80 truncate text-xs text-muted-foreground">{detail}</span>;
  }

  return (
    <button
      type="button"
      className="max-w-80 truncate text-left text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      title={detail}
      aria-label={`Open source for ${skill.name || skill.id}`}
      onClick={() => void skillerApi.openExternal(url)}
    >
      {detail}
    </button>
  );
}
```

- [ ] **Step 3: Use the renderer in the Source column**

Replace this Source column detail markup:

```tsx
                        <span className="max-w-80 truncate text-xs text-muted-foreground">{sourceDetail(skill)}</span>
```

with:

```tsx
                        <SourceDetail skill={skill} />
```

- [ ] **Step 4: Run focused tests and typecheck**

Run:

```bash
pnpm --filter @skiller/desktop test -- LibraryPage.test.tsx
pnpm --filter @skiller/desktop typecheck
```

Expected: both commands pass.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/pages/LibraryPage.tsx
git commit -m "feat(desktop): make library source links clickable"
```

## Task 4: Final verification

**Files:**
- No code changes expected.

- [ ] **Step 1: Run desktop test suite**

Run:

```bash
pnpm --filter @skiller/desktop test
```

Expected: PASS.

- [ ] **Step 2: Run desktop typecheck**

Run:

```bash
pnpm --filter @skiller/desktop typecheck
```

Expected: PASS.

- [ ] **Step 3: Inspect final diff**

Run:

```bash
git status --short
git diff HEAD
```

Expected: working tree is clean if each task was committed. If there are uncommitted changes, review that they match this plan before committing them.

## Self-Review

- Spec coverage: URL derivation, GitHub path behavior, IPC bridge, UI rendering, and tests are covered by Tasks 1 through 4.
- Placeholder scan: no placeholders remain.
- Type consistency: `sourceUrl`, `openExternal`, and `SourceDetail` names match across tasks.
