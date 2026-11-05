// Draws the app icon (coral map pin on navy) into PNGs without any image library.
// Run: node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";

const NAVY = [0x1f, 0x2a, 0x44];
const CORAL = [0xe7, 0x6f, 0x51];
const SAND = [0xf6, 0xf1, 0xe9];
const TEAL = [0x2a, 0x9d, 0x8f];

/** Colour at a point in unit space, `s` = artwork scale (smaller for maskable safe zone). */
function shade(x, y, s) {
  const u = (x - 0.5) / s + 0.5;
  const v = (y - 0.5) / s + 0.5;
  const cx = 0.5,
    cy = 0.42,
    r = 0.24,
    tip = 0.86;
  const d = Math.hypot(u - cx, v - cy);
  const inTail = v > cy && v < tip && Math.abs(u - cx) <= r * ((tip - v) / (tip - cy)) ** 1.15;
  if (d <= 0.095) return SAND;
  if (d <= r || inTail) return CORAL;
  // teal ground ellipse under the pin
  if (((u - 0.5) / 0.22) ** 2 + ((v - 0.9) / 0.045) ** 2 <= 1) return TEAL;
  return NAVY;
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
