import { build } from "esbuild";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

const packageRoot = resolve(process.cwd(), "node_modules/genlayer-js");

function resolveSource(specifier) {
  const base = resolve(packageRoot, "src", specifier);
  for (const candidate of [`${base}.ts`, `${base}.js`, resolve(base, "index.ts"), base]) {
    if (existsSync(candidate)) return candidate;
  }
  return base;
}

await build({
  entryPoints: [resolve(packageRoot, "src/index.ts"), resolve(packageRoot, "src/chains/index.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outbase: resolve(packageRoot, "src"),
  splitting: true,
  outdir: resolve(packageRoot, "dist"),
  plugins: [{
    name: "genlayer-source-alias",
    setup(buildApi) {
      buildApi.onResolve({ filter: /^@\// }, (args) => ({ path: resolveSource(args.path.slice(2)) }));
    },
  }],
});
