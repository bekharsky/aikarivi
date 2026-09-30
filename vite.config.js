import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));
const webRoot = resolve(repositoryRoot, "web");
const outputDirectory = resolve(repositoryRoot, "docs/write");

function offlineShell() {
  return {
    name: "aikarivi-offline-shell",
    writeBundle(_options, bundle) {
      const shellFiles = [...new Set([
        "./",
        "./index.html",
        "./manifest.webmanifest",
        "../favicon.ico?v=timeline-2",
        "../favicon-16.png?v=timeline-2",
        "../favicon-32.png?v=timeline-2",
        "../favicon.svg?v=timeline-2",
        ...Object.keys(bundle)
          .sort()
          .filter((fileName) => fileName !== "sw.js")
          .map((fileName) => `./${fileName}`),
      ])];
      const template = readFileSync(resolve(webRoot, "sw-template.js"), "utf8");
      const digest = createHash("sha256")
        .update(template)
        .update(shellFiles.join("\n"))
        .digest("hex")
        .slice(0, 12);
      const serviceWorker = template
        .replace("__CACHE_NAME__", `aikarivi-web-shell-${digest}`)
        .replace("__SHELL_FILES__", JSON.stringify(shellFiles));

      mkdirSync(outputDirectory, { recursive: true });
      writeFileSync(resolve(outputDirectory, "sw.js"), serviceWorker);
      copyFileSync(resolve(webRoot, "README.md"), resolve(outputDirectory, "README.md"));
    },
  };
}

export default defineConfig({
  root: webRoot,
  base: "./",
  publicDir: resolve(webRoot, "public"),
  plugins: [react(), offlineShell()],
  build: {
    outDir: outputDirectory,
    emptyOutDir: true,
    assetsDir: "assets",
  },
  test: {
    environment: "jsdom",
    setupFiles: [resolve(webRoot, "tests/setup.js")],
    restoreMocks: true,
    clearMocks: true,
  },
});
