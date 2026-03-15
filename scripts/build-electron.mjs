/**
 * Build script for Electron app.
 *
 * 1. Vite build (frontend → dist/)
 * 2. esbuild (electron/main.ts → dist-electron/main.cjs)
 * 3. esbuild (electron/preload.ts → dist-electron/preload.cjs)
 * 4. esbuild (server/index.ts → dist-electron/server.cjs)
 */

import { build } from "esbuild";
import { execSync } from "child_process";
import fs from "fs";

const outdir = "dist-electron";

// Clean
if (fs.existsSync(outdir)) {
  fs.rmSync(outdir, { recursive: true });
}
fs.mkdirSync(outdir, { recursive: true });

// Common esbuild options
const commonOpts = {
  bundle: true,
  platform: "node",
  format: "cjs",
  sourcemap: true,
  logLevel: "info",
  // Handle import.meta.url in ESM → CJS conversion
  define: {
    "import.meta.url": "import_meta_url",
  },
  banner: {
    js: `const import_meta_url = require("url").pathToFileURL(__filename).toString();`,
  },
};

// 1. Build frontend
console.log("\n📦 Building frontend (Vite)...");
execSync("npm run build", { stdio: "inherit" });

// 2. Build Electron main
console.log("\n⚡ Building electron/main.ts...");
await build({
  ...commonOpts,
  entryPoints: ["electron/main.ts"],
  outfile: `${outdir}/main.cjs`,
  external: ["electron"],
  // main.ts uses require() for server.cjs — don't try to resolve it
  plugins: [
    {
      name: "externalize-server",
      setup(build) {
        // Mark relative .cjs requires as external
        build.onResolve({ filter: /\.cjs$/ }, (args) => ({
          path: args.path,
          external: true,
        }));
      },
    },
  ],
});

// 3. Build preload
console.log("\n⚡ Building electron/preload.ts...");
await build({
  ...commonOpts,
  entryPoints: ["electron/preload.ts"],
  outfile: `${outdir}/preload.cjs`,
  external: ["electron"],
});

// 4. Build server bundle
console.log("\n⚡ Building server/index.ts...");
await build({
  ...commonOpts,
  entryPoints: ["server/index.ts"],
  outfile: `${outdir}/server.cjs`,
  external: [
    "better-sqlite3",
    // Optional native deps from ws
    "bufferutil",
    "utf-8-validate",
  ],
});

console.log("\n✅ Electron build complete!");
console.log(`   ${outdir}/main.cjs`);
console.log(`   ${outdir}/preload.cjs`);
console.log(`   ${outdir}/server.cjs`);
console.log(`   dist/index.html (frontend)`);
