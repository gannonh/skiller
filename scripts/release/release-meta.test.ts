import { describe, expect, test } from "vitest";
import {
  resolveNightlyReleaseMetadata,
  resolveNightlyTargetVersion,
  resolveStableCore
} from "./resolve-nightly-release.ts";
import { mergeManifests } from "./merge-update-manifests.ts";
import { setPackageVersion } from "./update-release-package-versions.ts";
import {
  MACOS_RELEASE_SIGNING_SECRET_NAMES,
  resolveMacOsReleaseSigning
} from "./check-macos-release-signing.ts";
import {
  buildPublishConfig,
  generateConfig,
  resolveChannelFromVersion,
  resolveProductName
} from "../build/release-config.ts";

describe("resolveStableCore", () => {
  test("strips prerelease and build metadata", () => {
    expect(resolveStableCore("0.3.2-nightly.20260619.1")).toBe("0.3.2");
    expect(resolveStableCore("0.3.2+build.7")).toBe("0.3.2");
    expect(resolveStableCore("0.3.2")).toBe("0.3.2");
  });
});

describe("resolveNightlyTargetVersion", () => {
  test("bumps patch by one", () => {
    expect(resolveNightlyTargetVersion("0.3.2")).toBe("0.3.3");
    expect(resolveNightlyTargetVersion("0.3.2-nightly.20260619.1")).toBe("0.3.3");
  });

  test("rejects non-semver core", () => {
    expect(() => resolveNightlyTargetVersion("not.a.version")).toThrow();
  });
});

describe("resolveNightlyReleaseMetadata", () => {
  test("produces version, v-prefixed tag, name, and short sha", () => {
    const meta = resolveNightlyReleaseMetadata("0.3.3", "20260619", 7, "abcdef0123456789");
    expect(meta.version).toBe("0.3.3-nightly.20260619.7");
    expect(meta.tag).toBe("v0.3.3-nightly.20260619.7");
    expect(meta.shortSha).toBe("abcdef012345");
    expect(meta.name).toContain("0.3.3-nightly.20260619.7");
    expect(meta.name).toContain("abcdef012345");
  });
});

describe("mergeManifests", () => {
  test("combines per-arch macOS file entries without path-level checksum metadata", () => {
    const merged = mergeManifests(
      "mac",
      {
        version: "0.3.3-nightly.20260621.23",
        files: [{ url: "Skiller-Desktop-arm64.zip", sha512: "arm64", size: 1 }],
        path: "Skiller-Desktop-arm64.zip",
        sha512: "arm64",
        releaseDate: "2026-06-21T22:00:00.000Z"
      },
      {
        version: "0.3.3-nightly.20260621.23",
        files: [{ url: "Skiller-Desktop-x64.zip", sha512: "x64", size: 2 }],
        path: "Skiller-Desktop-x64.zip",
        sha512: "x64",
        releaseDate: "2026-06-21T22:01:00.000Z"
      }
    );

    expect(merged.files).toEqual([
      { url: "Skiller-Desktop-arm64.zip", sha512: "arm64", size: 1 },
      { url: "Skiller-Desktop-x64.zip", sha512: "x64", size: 2 }
    ]);
    expect(merged.releaseDate).toBe("2026-06-21T22:01:00.000Z");
    expect(merged.path).toBeUndefined();
    expect(merged.sha512).toBeUndefined();
  });
});

describe("setPackageVersion", () => {
  const pkg = '{\n  "name": "x",\n  "version": "0.3.2",\n  "private": true\n}\n';

  test("replaces the first version field and preserves formatting", () => {
    const { text, changed } = setPackageVersion(pkg, "0.3.3-nightly.20260619.7");
    expect(changed).toBe(true);
    expect(text).toContain('"version": "0.3.3-nightly.20260619.7"');
    expect(text).toContain('"name": "x"');
  });

  test("is a no-op when version already matches", () => {
    const { text, changed } = setPackageVersion(pkg, "0.3.2");
    expect(changed).toBe(false);
    expect(text).toBe(pkg);
  });
});

describe("resolveMacOsReleaseSigning", () => {
  const full = {
    CSC_LINK: "base64",
    CSC_KEY_PASSWORD: "pw",
    APPLE_ID: "id@example.com",
    APPLE_APP_SPECIFIC_PASSWORD: "app-pw",
    APPLE_TEAM_ID: "TEAM"
  };

  test("ready when all secrets present", () => {
    const result = resolveMacOsReleaseSigning(full);
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
  });

  test("reports each missing secret", () => {
    const result = resolveMacOsReleaseSigning({ ...full, CSC_LINK: undefined, APPLE_TEAM_ID: "" });
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(["CSC_LINK", "APPLE_TEAM_ID"]);
  });

  test("exposes the canonical secret-name list", () => {
    expect(MACOS_RELEASE_SIGNING_SECRET_NAMES).toEqual([
      "CSC_LINK",
      "CSC_KEY_PASSWORD",
      "APPLE_ID",
      "APPLE_APP_SPECIFIC_PASSWORD",
      "APPLE_TEAM_ID"
    ]);
  });
});

describe("release-config", () => {
  test("resolves nightly channel from version", () => {
    expect(resolveChannelFromVersion("0.3.3-nightly.20260621.1")).toBe("nightly");
    expect(resolveChannelFromVersion("0.3.3")).toBe("stable");
  });

  test("builds publish config for stable and nightly", () => {
    expect(buildPublishConfig("stable", "gannonh/skiller")).toEqual({
      provider: "github",
      owner: "gannonh",
      repo: "skiller",
      releaseType: "release"
    });
    expect(buildPublishConfig("nightly", "gannonh/skiller")).toEqual({
      provider: "github",
      owner: "gannonh",
      repo: "skiller",
      releaseType: "prerelease",
      channel: "nightly"
    });
  });

  test("applies product name and publish block", () => {
    const generated = generateConfig({
      base: { appId: "com.example.app" },
      version: "0.3.3-nightly.20260621.1",
      repository: "gannonh/skiller"
    });
    expect(generated.productName).toBe("Skiller (Nightly)");
    expect(resolveProductName("stable")).toBe("Skiller");
    expect(generated.publish).toEqual([
      {
        provider: "github",
        owner: "gannonh",
        repo: "skiller",
        releaseType: "prerelease",
        channel: "nightly"
      }
    ]);
  });
});
