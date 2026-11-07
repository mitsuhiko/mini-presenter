// Builds the browser bundles into dist/client and the CLI into dist/cli.js.
//
//   node scripts/build.ts                      production build
//   node scripts/build.ts --dev                development build (Solid dev runtime)
//   node scripts/build.ts --watch              rebuild client bundles on change
//   node scripts/build.ts --watch --serve DIR  ... and run the server for DIR

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { transform } from "@solidjs/compiler";
import * as esbuild from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "dist");
const clientOut = path.join(outDir, "client");

const { values } = parseArgs({
  options: { watch: { type: "boolean" }, dev: { type: "boolean" }, serve: { type: "string" } },
});
const watch = values.watch ?? false;
const dev = watch || (values.dev ?? false);

const solidPlugin: esbuild.Plugin = {
  name: "solid",
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async (args) => {
      const source = await fs.readFile(args.path, "utf8");
      const result = transform(source, { filename: args.path, generate: "dom", dev, sourceMap: dev });
      let contents = result.code;
      if (result.map) {
        contents += `\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(result.map).toString("base64")}`;
      }
      return { contents, loader: "ts" };
    });
  },
};

const pagesPlugin: esbuild.Plugin = {
  name: "pages",
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length > 0) {
        return;
      }
      const pagesDir = path.join(root, "src/client/pages");
      for (const name of await fs.readdir(pagesDir)) {
        await fs.copyFile(path.join(pagesDir, name), path.join(clientOut, name));
      }
    });
  },
};

const common: esbuild.BuildOptions = {
  bundle: true,
  target: ["chrome111", "firefox115", "safari16.4"],
  minify: !dev,
  sourcemap: dev ? "inline" : false,
  legalComments: "none",
  logLevel: "info",
  define: { "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production") },
};

const clientBuilds: esbuild.BuildOptions[] = [
  {
    // Classic scripts: injected into arbitrary decks / embedded from a CDN.
    ...common,
    entryPoints: {
      display: "src/client/display/index.ts",
      standalone: "src/client/standalone.ts",
    },
    format: "iife",
    outdir: clientOut,
  },
  {
    ...common,
    entryPoints: {
      presenter: "src/client/presenter/index.tsx",
      questions: "src/client/questions/index.tsx",
      qr: "src/client/qr/index.ts",
      ui: "src/client/ui/ui.css",
    },
    format: "esm",
    splitting: true,
    chunkNames: "chunks/[name]-[hash]",
    outdir: clientOut,
    conditions: dev ? ["development"] : [],
    plugins: [solidPlugin, pagesPlugin],
  },
];

const cliBuild: esbuild.BuildOptions = {
  ...common,
  entryPoints: { cli: "src/cli.ts" },
  platform: "node",
  format: "esm",
  target: "node22",
  minify: false,
  packages: "external",
  outdir: outDir,
};

process.chdir(root);
await fs.rm(clientOut, { recursive: true, force: true });
await fs.mkdir(clientOut, { recursive: true });

if (watch) {
  for (const options of clientBuilds) {
    const context = await esbuild.context(options);
    await context.watch();
  }
  if (values.serve) {
    const child = spawn(
      process.execPath,
      ["--watch-path=src/server", "--watch-path=src/shared", "src/cli.ts", values.serve, "--watch"],
      { stdio: "inherit" },
    );
    process.on("SIGINT", () => {
      child.kill("SIGINT");
      process.exit(0);
    });
  }
} else {
  await Promise.all([...clientBuilds, cliBuild].map((options) => esbuild.build(options)));
  await fs.chmod(path.join(outDir, "cli.js"), 0o755);
}
