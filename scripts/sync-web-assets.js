const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "www");
const files = ["index.html", "styles.css", "app.js", "manifest.json", "sw.js"];
const assetDir = path.join(root, "assets");

fs.rmSync(outDir, { force: true, recursive: true });
fs.mkdirSync(outDir, { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(outDir, file));
}

if (fs.existsSync(assetDir)) {
  fs.cpSync(assetDir, path.join(outDir, "assets"), { recursive: true });
}

console.log(`Synced web assets to ${path.relative(root, outDir)}`);
