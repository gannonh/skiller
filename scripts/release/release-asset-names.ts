import { readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const INSTALLER_RENAME_RULES: Array<{ pattern: RegExp; replace: string }> = [
  { pattern: /^Skiller-Desktop-arm64\.dmg(\.blockmap)?$/, replace: "Skiller-macOS-Apple-Silicon.dmg$1" },
  { pattern: /^Skiller-Desktop-x64\.dmg(\.blockmap)?$/, replace: "Skiller-macOS-Intel.dmg$1" },
  { pattern: /^Skiller-Desktop-arm64\.zip(\.blockmap)?$/, replace: "Skiller-macOS-Apple-Silicon.zip$1" },
  { pattern: /^Skiller-Desktop-x64\.zip(\.blockmap)?$/, replace: "Skiller-macOS-Intel.zip$1" },
  { pattern: /^Skiller-Desktop-x86_64\.AppImage$/, replace: "Skiller-Linux-x64.AppImage" },
  { pattern: /^Skiller-Desktop-amd64\.deb$/, replace: "Skiller-Linux-x64.deb" },
  { pattern: /^Skiller-Desktop-arm64\.AppImage$/, replace: "Skiller-Linux-arm64.AppImage" },
  { pattern: /^Skiller-Desktop-arm64\.deb$/, replace: "Skiller-Linux-arm64.deb" }
];

export function suggestReleaseFileName(fileName: string): string | null {
  for (const rule of INSTALLER_RENAME_RULES) {
    if (rule.pattern.test(fileName)) {
      return fileName.replace(rule.pattern, rule.replace);
    }
  }
  return null;
}

export function buildInstallerRenameMap(fileNames: readonly string[]): Map<string, string> {
  const renameMap = new Map<string, string>();
  for (const fileName of fileNames) {
    const nextName = suggestReleaseFileName(fileName);
    if (nextName) {
      renameMap.set(fileName, nextName);
    }
  }
  return renameMap;
}

export function rewriteManifestContent(content: string, renameMap: Map<string, string>): string {
  let updated = content;
  for (const [oldName, newName] of renameMap) {
    updated = updated.split(oldName).join(newName);
  }
  return updated;
}

export function releaseDownloadUrl(repository: string, tag: string, fileName: string): string {
  return `https://github.com/${repository}/releases/download/${tag}/${fileName}`;
}

function link(repository: string, tag: string, fileName: string | undefined): string {
  return fileName ? `[Download](${releaseDownloadUrl(repository, tag, fileName)})` : "—";
}

export function renderReleaseBody(input: {
  version: string;
  tag: string;
  repository: string;
  fileNames: readonly string[];
}): string {
  const names = new Set(input.fileNames);
  const pick = (...candidates: string[]) => candidates.find((candidate) => names.has(candidate));

  const macAppleSiliconDmg = pick("Skiller-macOS-Apple-Silicon.dmg");
  const macIntelDmg = pick("Skiller-macOS-Intel.dmg");
  const linuxX64AppImage = pick("Skiller-Linux-x64.AppImage");
  const linuxX64Deb = pick("Skiller-Linux-x64.deb");
  const linuxArm64AppImage = pick("Skiller-Linux-arm64.AppImage");
  const linuxArm64Deb = pick("Skiller-Linux-arm64.deb");

  const lines = [
    `## Skiller Desktop ${input.version}`,
    "",
    "### macOS",
    "",
    "| | Apple Silicon | Intel |",
    "|---|---|---|",
    `| Installer (.dmg) | ${link(input.repository, input.tag, macAppleSiliconDmg)} | ${link(input.repository, input.tag, macIntelDmg)} |`,
    "",
    "### Linux",
    "",
    "| | x64 | arm64 |",
    "|---|---|---|",
    `| AppImage | ${link(input.repository, input.tag, linuxX64AppImage)} | ${link(input.repository, input.tag, linuxArm64AppImage)} |`,
    `| Debian (.deb) | ${link(input.repository, input.tag, linuxX64Deb)} | ${link(input.repository, input.tag, linuxArm64Deb)} |`,
    "",
    "> AppImage builds support in-app auto-updates. `.deb` installs do not.",
    "",
    "All release assets, including auto-update metadata, are attached below."
  ];

  return `${lines.join("\n")}\n`;
}

export interface PrepareReleaseAssetsOptions {
  distDir: string;
  repository: string;
  tag: string;
  version: string;
}

export interface PrepareReleaseAssetsResult {
  fileNames: string[];
  body: string;
  bodyPath: string;
}

export function prepareReleaseAssets(options: PrepareReleaseAssetsOptions): PrepareReleaseAssetsResult {
  const distDir = options.distDir;
  const initialNames = readdirSync(distDir);
  const renameMap = buildInstallerRenameMap(initialNames);

  for (const fileName of initialNames) {
    if (!fileName.endsWith(".yml") || fileName === "builder-debug.yml") {
      continue;
    }

    const sourcePath = join(distDir, fileName);
    const updated = rewriteManifestContent(readFileSync(sourcePath, "utf-8"), renameMap);
    writeFileSync(sourcePath, updated, "utf-8");
  }

  for (const [oldName, newName] of renameMap) {
    renameSync(join(distDir, oldName), join(distDir, newName));
  }

  const builderDebugPath = join(distDir, "builder-debug.yml");
  rmSync(builderDebugPath, { force: true });

  const fileNames = readdirSync(distDir).sort();
  const body = renderReleaseBody({
    version: options.version,
    tag: options.tag,
    repository: options.repository,
    fileNames
  });
  const bodyPath = join(distDir, "release-body.md");
  writeFileSync(bodyPath, body, "utf-8");

  return { fileNames, body, bodyPath };
}
