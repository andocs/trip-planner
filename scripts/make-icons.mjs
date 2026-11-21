// Draws the app icon (white eight-ray sun on teal) into PNGs without any image library.
// The glyph is the same one as public/icons/icon.svg and the side panel logo (24-unit grid).
// Run: node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";

const TEAL = [0x0e, 0x6b, 0x5c];
const WHITE = [0xff, 0xff, 0xff];

const RAYS = [
  [12, 2.5, 12, 5.5],
  [12, 18.5, 12, 21.5],
  [2.5, 12, 5.5, 12],
  [18.5, 12, 21.5, 12],
  [5.3, 5.3, 7.4, 7.4],
  [16.6, 16.6, 18.7, 18.7],
  [18.7, 5.3, 16.6, 7.4],
  [7.4, 16.6, 5.3, 18.7],
];
const GLYPH = 0.034; // tile units per glyph unit (the rays span about 65% of the tile)
const HALF_STROKE = 1.15; // a little heavier than the 1 of the 24 px line icons, so it holds at 16 px

function distToSegment(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1,
    dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Colour at a point in unit space, `s` = artwork scale (smaller for maskable safe zone). */
function shade(x, y, s) {
  const u = (x - 0.5) / s + 0.5;
  const v = (y - 0.5) / s + 0.5;
  const gx = (u - 0.5) / GLYPH + 12;
  const gy = (v - 0.5) / GLYPH + 12;
  if (Math.abs(Math.hypot(gx - 12, gy - 12) - 3.6) <= HALF_STROKE) return WHITE;
  if (RAYS.some((r) => distToSegment(gx, gy, r) <= HALF_STROKE)) return WHITE;
  return TEAL;
}

function png(size, scale) {
  const SS = 4; // supersampling for smooth edges
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let rr = 0,
        gg = 0,
        bb = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const [r, g, b] = shade((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, scale);
          rr += r;
          gg += g;
          bb += b;
        }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      raw[o] = rr / SS ** 2;
      raw[o + 1] = gg / SS ** 2;
      raw[o + 2] = bb / SS ** 2;
      raw[o + 3] = 255;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", png(192, 0.9));
writeFileSync("public/icons/icon-512.png", png(512, 0.9));
writeFileSync("public/icons/maskable-512.png", png(512, 0.68));
writeFileSync("public/icons/apple-touch-icon.png", png(180, 0.8));
console.log("Icons written to public/icons/");
