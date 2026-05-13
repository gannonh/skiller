import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { fileURLToPath } from "node:url";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 5173;
const DEFAULT_MAX_PORT_ATTEMPTS = 100;
const DEFAULT_SERVER_TIMEOUT_MS = 30_000;

export interface FindAvailablePortOptions {
  host?: string;
  startPort?: number;
  maxAttempts?: number;
}

export async function isPortAvailable(host: string, port: number): Promise<boolean> {
  const server = net.createServer();

  return new Promise((resolve, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE" || error.code === "EACCES") {
        resolve(false);
        return;
      }
      reject(error);
    });
    server.once("listening", () => {
      server.close((error) => {
        if (error) reject(error);
        else resolve(true);
      });
    });
    server.listen(port, host);
  });
}

export async function findAvailablePort(options: FindAvailablePortOptions = {}): Promise<number> {
  const host = options.host ?? DEFAULT_HOST;
  const startPort = options.startPort ?? DEFAULT_PORT;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_PORT_ATTEMPTS;

  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const port = startPort + offset;
    if (await isPortAvailable(host, port)) return port;
  }

  throw new Error(`No available renderer dev server port found from ${startPort} through ${startPort + maxAttempts - 1}`);
}

export function rendererDevServerUrl(host: string, port: number): string {
  return `http://${host}:${port}/`;
}

export function rendererDevServerArgs(host: string, port: number): string[] {
  return ["run", "dev:renderer", "--host", host, "--port", String(port), "--strictPort"];
}

async function waitForServer(url: string, timeoutMs = DEFAULT_SERVER_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await canReach(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Timed out waiting for renderer dev server at ${url}`);
}

async function canReach(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve((response.statusCode ?? 500) < 500);
    });
    request.once("error", () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

function packageBin(command: string): string {
  return process.platform === "win32" ? `${command}.cmd` : command;
}

function stop(child: ChildProcess | undefined) {
  if (child && child.exitCode === null && !child.killed) {
    child.kill("SIGTERM");
  }
}

export async function runDesktopDev(): Promise<void> {
  const host = process.env.SKILLER_DEV_HOST ?? DEFAULT_HOST;
  const startPort = Number(process.env.SKILLER_DEV_PORT ?? DEFAULT_PORT);
  const port = await findAvailablePort({ host, startPort });
  const url = rendererDevServerUrl(host, port);
  const renderer = spawn(packageBin("pnpm"), rendererDevServerArgs(host, port), {
    stdio: "inherit",
    env: process.env
  });
  let electron: ChildProcess | undefined;
  let shuttingDown = false;

  const shutdown = (exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    stop(electron);
    stop(renderer);
    process.exit(exitCode);
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => shutdown(0));
  }

  renderer.once("exit", (code) => {
    if (!shuttingDown && !electron) shutdown(code ?? 1);
  });

  await waitForServer(url);
  electron = spawn(packageBin("electron"), ["."], {
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: url
    }
  });
  electron.once("exit", (code) => shutdown(code ?? 0));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runDesktopDev().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
