/*
 * icons/*.svg から PNG を作る。
 *
 *   npm i playwright-core     （このリポジトリには入れていない。手元にある分を使う）
 *   node tools/make-icons.mjs
 *
 * 端末に入っている Chromium をそのまま使う。CHROME で場所を変えられる。
 */
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executablePath = process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const JOBS = [
  ["icon.svg", "icon-512.png", 512],
  ["icon.svg", "icon-192.png", 192],
  ["icon.svg", "apple-touch-180.png", 180],
  ["icon.svg", "favicon-32.png", 32],
  ["icon-maskable.svg", "maskable-512.png", 512],
];

const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
for (const [source, output, size] of JOBS) {
  const svg = readFileSync(path.join(root, "icons", source), "utf8");
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(
    `<!DOCTYPE html><meta charset="utf-8">
     <style>html,body{margin:0;padding:0;overflow:hidden}
     svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
  );
  await page.screenshot({ path: path.join(root, "icons", output) });
  await page.close();
  console.log(`${output}  ${size}x${size}`);
}
await browser.close();
