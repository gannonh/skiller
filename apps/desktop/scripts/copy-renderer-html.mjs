import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(scriptDir, "..");
const source = resolve(desktopDir, "src/renderer/index.html");
const destination = resolve(desktopDir, "dist/renderer/index.html");

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
