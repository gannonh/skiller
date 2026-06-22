import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  buildInstallerRenameMap,
  prepareReleaseAssets,
  renderReleaseBody,
  rewriteManifestContent,
  suggestReleaseFileName
} from "./release-asset-names.ts";

describe("suggestReleaseFileName", () => {
  test("maps macOS and Linux installers to platform-prefixed names", () => {
    expect(suggestReleaseFileName("Skiller-Desktop-arm64.dmg")).toBe("Skiller-macOS-Apple-Silicon.dmg");
    expect(suggestReleaseFileName("Skiller-Desktop-x64.zip")).toBe("Skiller-macOS-Intel.zip");
    expect(suggestReleaseFileName("Skiller-Desktop-x86_64.AppImage")).toBe("Skiller-Linux-x64.AppImage");
    expect(suggestReleaseFileName("Skiller-Desktop-amd64.deb")).toBe("Skiller-Linux-x64.deb");
    expect(suggestReleaseFileName("Skiller-Desktop-arm64.deb")).toBe("Skiller-Linux-arm64.deb");
    expect(suggestReleaseFileName("nightly-mac.yml")).toBeNull();
  });
});

describe("rewriteManifestContent", () => {
  test("updates manifest file references", () => {
    const renameMap = buildInstallerRenameMap([
      "Skiller-Desktop-arm64.zip",
      "Skiller-Desktop-x64.zip"
    ]);
    const raw = [
      "version: 0.3.3",
      "files:",
      "  - url: Skiller-Desktop-arm64.zip",
      "  - url: Skiller-Desktop-x64.zip",
      "path: Skiller-Desktop-arm64.zip"
    ].join("\n");

    const updated = rewriteManifestContent(raw, renameMap);
    expect(updated).toContain("Skiller-macOS-Apple-Silicon.zip");
    expect(updated).toContain("Skiller-macOS-Intel.zip");
  });
});

describe("renderReleaseBody", () => {
  test("renders macOS and Linux download tables", () => {
    const body = renderReleaseBody({
      version: "0.3.3-nightly.20260622.2",
      tag: "v0.3.3-nightly.20260622.2",
      repository: "gannonh/skiller",
      fileNames: [
        "Skiller-macOS-Apple-Silicon.dmg",
        "Skiller-macOS-Intel.dmg",
        "Skiller-Linux-x64.AppImage",
        "Skiller-Linux-x64.deb",
        "Skiller-Linux-arm64.AppImage",
        "Skiller-Linux-arm64.deb"
      ]
    });

    expect(body).toContain("### macOS");
    expect(body).toContain("### Linux");
    expect(body).toContain("Skiller-macOS-Apple-Silicon.dmg");
    expect(body).toContain("Skiller-Linux-x64.AppImage");
    expect(body).toContain("AppImage builds support in-app auto-updates");
  });
});

describe("prepareReleaseAssets", () => {
  test("renames installers, updates manifests, and removes builder-debug.yml", () => {
    const distDir = mkdtempSync(join(tmpdir(), "skiller-release-"));
    writeFileSync(join(distDir, "Skiller-Desktop-arm64.dmg"), "dmg");
    writeFileSync(join(distDir, "Skiller-Desktop-x64.zip"), "zip");
    writeFileSync(
      join(distDir, "nightly-mac.yml"),
      "files:\n  - url: Skiller-Desktop-arm64.zip\n  - url: Skiller-Desktop-x64.zip\n"
    );
    writeFileSync(join(distDir, "builder-debug.yml"), "debug");

    const result = prepareReleaseAssets({
      distDir,
      repository: "gannonh/skiller",
      tag: "v0.3.3-nightly.20260622.2",
      version: "0.3.3-nightly.20260622.2"
    });

    expect(readdirSync(distDir)).toEqual([
      "Skiller-macOS-Apple-Silicon.dmg",
      "Skiller-macOS-Intel.zip",
      "nightly-mac.yml",
      "release-body.md"
    ]);
    expect(readFileSync(join(distDir, "nightly-mac.yml"), "utf-8")).toContain("Skiller-macOS-Intel.zip");
    expect(result.body).toContain("### macOS");
  });
});
