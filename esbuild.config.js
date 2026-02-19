const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const isWatch = process.argv.includes("--watch");

function inlineUI() {
  const js = fs.readFileSync("dist/ui_bundle.js", "utf8");
  const css = fs.readFileSync("src/ui/styles.css", "utf8");
  const html = `<!DOCTYPE html>
<html>
<head><style>${css}</style></head>
<body><div id="root"></div><script>${js}</script></body>
</html>`;
  fs.writeFileSync("dist/ui.html", html);
}

async function build() {
  if (!fs.existsSync("dist")) {
    fs.mkdirSync("dist");
  }

  const sandboxOptions = {
    entryPoints: ["src/code.ts"],
    bundle: true,
    outfile: "dist/code.js",
    target: "es2017",
    format: "iife",
    logOverride: { "direct-eval": "silent" },
  };

  const uiOptions = {
    entryPoints: ["src/ui/App.tsx"],
    bundle: true,
    outfile: "dist/ui_bundle.js",
    target: "es2020",
    format: "iife",
    loader: { ".tsx": "tsx", ".ts": "ts" },
    define: { "process.env.NODE_ENV": '"production"' },
    minify: !isWatch,
  };

  if (isWatch) {
    const sandboxCtx = await esbuild.context(sandboxOptions);
    const uiCtx = await esbuild.context(uiOptions);

    await sandboxCtx.rebuild();
    await uiCtx.rebuild();
    inlineUI();
    console.log("Initial build complete");

    await sandboxCtx.watch();
    await uiCtx.watch();

    fs.watchFile("dist/ui_bundle.js", { interval: 500 }, () => {
      try {
        inlineUI();
        console.log("UI re-inlined");
      } catch (e) {
        console.error("Inline error:", e.message);
      }
    });

    fs.watchFile("src/ui/styles.css", { interval: 500 }, () => {
      try {
        inlineUI();
        console.log("CSS re-inlined");
      } catch (e) {
        console.error("Inline error:", e.message);
      }
    });

    console.log("Watching for changes...");
  } else {
    esbuild.buildSync(sandboxOptions);
    esbuild.buildSync(uiOptions);
    inlineUI();
    console.log("Build complete");
  }
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
