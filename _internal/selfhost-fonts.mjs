import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const CSS_URL = "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=DM+Sans:wght@400;500;700&family=Orbitron:wght@800;900&display=swap";
const KEEP_SUBSETS = new Set(['latin', 'latin-ext']);
const OUT_DIR = 'assets/fonts';

fs.mkdirSync(OUT_DIR, { recursive: true });

const res = await fetch(CSS_URL, { headers: { 'User-Agent': UA } });
if (!res.ok) throw new Error(`CSS fetch failed: ${res.status}`);
const css = await res.text();

const blockRe = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
const blocks = [];
let m;
while ((m = blockRe.exec(css))) {
  const subset = m[1];
  const body = m[2];
  const pick = (prop) => {
    const r = new RegExp(`${prop}\\s*:\\s*([^;]+);`);
    const hit = body.match(r);
    return hit ? hit[1].trim() : null;
  };
  const urlMatch = body.match(/url\((https:\/\/[^)]+\.woff2)\)/);
  blocks.push({
    subset,
    family: pick('font-family')?.replace(/['"]/g, ''),
    style: pick('font-style'),
    weight: pick('font-weight'),
    unicodeRange: pick('unicode-range'),
    url: urlMatch ? urlMatch[1] : null,
  });
}

const slug = (s) => s.toLowerCase().replace(/\s+/g, '-');
const kept = blocks.filter((b) => KEEP_SUBSETS.has(b.subset) && b.url);
if (!kept.length) throw new Error('No font blocks parsed');

const seen = new Map();
const faceRules = [];
for (const b of kept) {
  const file = `${slug(b.family)}-${b.weight}-${b.subset}.woff2`;
  if (!seen.has(b.url)) {
    const bin = await fetch(b.url, { headers: { 'User-Agent': UA } });
    if (!bin.ok) throw new Error(`font download failed ${b.url}: ${bin.status}`);
    const buf = Buffer.from(await bin.arrayBuffer());
    fs.writeFileSync(path.join(OUT_DIR, file), buf);
    seen.set(b.url, { file, bytes: buf.length });
  }
  const { file: fileName } = seen.get(b.url);
  faceRules.push(
    `@font-face {\r\n` +
    `  font-family: '${b.family}';\r\n` +
    `  font-style: ${b.style};\r\n` +
    `  font-weight: ${b.weight};\r\n` +
    `  font-display: swap;\r\n` +
    `  src: url('${OUT_DIR}/${fileName}') format('woff2');\r\n` +
    `  unicode-range: ${b.unicodeRange};\r\n` +
    `}\r\n`
  );
}

const banner =
  `/* ── Self-hosted web fonts ───────────────────────────────────────────────────\r\n` +
  `   Orbitron (800, 900), Barlow Condensed (600, 700, 800) and DM Sans\r\n` +
  `   (400, 500, 700), each in the latin and latin-ext subsets, served from this\r\n` +
  `   origin instead of fonts.googleapis.com. Loading fonts from Google's servers\r\n` +
  `   sends every visitor's IP address to Google before they can consent, which\r\n` +
  `   courts in the EU have treated as a data-protection breach. All three\r\n` +
  `   families are licensed under the SIL Open Font License 1.1.\r\n` +
  `   Generated from the Google Fonts CSS API; re-run the generator to refresh.\r\n` +
  `   ────────────────────────────────────────────────────────────────────────── */\r\n`;

const generated = banner + faceRules.join('');

const blockPath = path.join(os.tmpdir(), 'fonts-block.css');
fs.writeFileSync(blockPath, generated);
console.log(`block written: ${blockPath}`);

console.log(`parsed blocks: ${blocks.length}`);
console.log(`kept subsets:  ${[...new Set(kept.map((b) => b.subset))].join(', ')}`);
console.log(`files written: ${seen.size}`);
let total = 0;
for (const [url, info] of seen) {
  total += info.bytes;
  console.log(`  ${String(info.bytes).padStart(6)} B  ${info.file}`);
}
console.log(`total bytes:   ${total}`);
console.log(`css bytes:     ${Buffer.byteLength(generated)}`);
