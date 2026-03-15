/**
 * Build CLI bundle with esbuild.
 *
 * Bundles cli/entry.ts → dist-cli/entry.js (ESM, Node target).
 * External: ws (native module, resolved at runtime from node_modules).
 */

import { build } from "esbuild";

await build({
  entryPoints: ["cli/entry.ts"],
  bundle: true,
  outfile: "dist-cli/entry.js",
  platform: "node",
  target: "node20",
  format: "esm",
  external: ["ws"],
  banner: {
    js: "// Agent Deck CLI - bundled with esbuild",
  },
  sourcemap: true,
  minify: false,
});

console.log("✓ CLI built → dist-cli/entry.js");
