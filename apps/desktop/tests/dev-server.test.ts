import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { findAvailablePort, parseDevServerPort, rendererDevServerArgs, rendererDevServerUrl } from "../src/main/dev-server.js";

const servers: net.Server[] = [];

async function listen(port = 0, host = "127.0.0.1") {
  const server = net.createServer();
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP test server");
  return { server, port: address.port };
}

async function close(server: net.Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

describe("desktop dev server helpers", () => {
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => close(server)));
  });

  it("selects an available renderer port when the preferred port is in use", async () => {
    const { port } = await listen();
    const availablePort = await findAvailablePort({ host: "127.0.0.1", startPort: port });

    expect(availablePort).toBeGreaterThan(port);
    await listen(availablePort);
  });

  it("rejects invalid renderer dev server ports before probing", () => {
    expect(parseDevServerPort("abc")).toEqual({ ok: false, error: "Invalid SKILLER_DEV_PORT: abc" });
    expect(parseDevServerPort("70000")).toEqual({ ok: false, error: "Invalid SKILLER_DEV_PORT: 70000" });
  });

  it("formats the renderer dev server URL for Electron", () => {
    expect(rendererDevServerUrl("127.0.0.1", 5175)).toBe("http://127.0.0.1:5175/");
  });

  it("passes the selected port to Vite without a literal separator argument", () => {
    expect(rendererDevServerArgs("127.0.0.1", 5175)).toEqual([
      "run",
      "dev:renderer",
      "--host",
      "127.0.0.1",
      "--port",
      "5175",
      "--strictPort"
    ]);
  });
});
