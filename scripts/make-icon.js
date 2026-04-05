// Generates placeholder clock icons for AIClocker.
// Produces icon.png (256x256 RGBA) and icon.ico (multi-resolution).
// Zero dependencies — uses Node built-ins only.
//
// Usage: node scripts/make-icon.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ----- PNG generation -----

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeData = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeData));
  return Buffer.concat([len, typeData, crc]);
}

function makeClockPixels(size) {
  // Returns raw RGBA pixel buffer for a clock icon.
  const raw = Buffer.alloc(size * size * 4);
  const cx = size / 2 - 0.5;
  const cy = size / 2 - 0.5;
  const outerR = size * 0.47;
  const innerR = size * 0.40;
  const tickInner = size * 0.36;
  const tickOuter = size * 0.44;

  // Brand colors
  const BG = [14, 17, 23, 255];        // #0e1117 dark
  const RIM = [110, 64, 201, 255];     // #6e40c9 purple
  const FACE = [22, 27, 34, 255];      // #161b22
  const TICK = [139, 148, 158, 255];   // #8b949e
  const HAND = [224, 228, 233, 255];   // #e0e4e9
  const CENTER = [110, 64, 201, 255];  // purple center dot

  // Clock hands (fixed at ~10:10 for visual appeal)
  // Hour hand: points to 10 (60 degrees from top, counter-clockwise)
  // Minute hand: points to 2 (60 degrees from top, clockwise)
  const hourAngle = -Math.PI / 2 - Math.PI / 3;   // 10 o'clock
  const minuteAngle = -Math.PI / 2 + Math.PI / 3; // 2 o'clock
  const hourLen = size * 0.24;
  const minuteLen = size * 0.33;
  const handWidth = Math.max(1.5, size * 0.025);

  function setPixel(x, y, color, alpha = 1) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    const a = Math.round(color[3] * alpha);
    if (a === 0) return;
    // Alpha blend over existing
    const existingA = raw[i + 3];
    if (existingA === 0) {
      raw[i] = color[0];
      raw[i + 1] = color[1];
      raw[i + 2] = color[2];
      raw[i + 3] = a;
    } else {
      const srcA = a / 255;
      const dstA = existingA / 255;
      const outA = srcA + dstA * (1 - srcA);
      raw[i] = Math.round((color[0] * srcA + raw[i] * dstA * (1 - srcA)) / outA);
      raw[i + 1] = Math.round((color[1] * srcA + raw[i + 1] * dstA * (1 - srcA)) / outA);
      raw[i + 2] = Math.round((color[2] * srcA + raw[i + 2] * dstA * (1 - srcA)) / outA);
      raw[i + 3] = Math.round(outA * 255);
    }
  }

  function distToLine(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx2 = x1 + t * dx;
    const cy2 = y1 + t * dy;
    return Math.hypot(px - cx2, py - cy2);
  }

  // 1. Base circle — rim (outer ring) and face (inner)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < innerR - 0.5) {
        // Face
        setPixel(x, y, FACE);
      } else if (dist < innerR + 0.5) {
        // Edge of face (AA)
        const alpha = innerR + 0.5 - dist;
        setPixel(x, y, FACE, alpha);
        setPixel(x, y, RIM, 1 - alpha);
      } else if (dist < outerR - 0.5) {
        // Rim
        setPixel(x, y, RIM);
      } else if (dist < outerR + 0.5) {
        // Outer edge (AA to transparent)
        const alpha = outerR + 0.5 - dist;
        setPixel(x, y, RIM, alpha);
      }
    }
  }

  // 2. Hour ticks (12 ticks around the face)
  for (let i = 0; i < 12; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI / 6);
    const x1 = cx + Math.cos(angle) * tickInner;
    const y1 = cy + Math.sin(angle) * tickInner;
    const x2 = cx + Math.cos(angle) * tickOuter;
    const y2 = cy + Math.sin(angle) * tickOuter;
    const tickW = (i % 3 === 0) ? handWidth * 1.2 : handWidth * 0.6;

    const minX = Math.max(0, Math.floor(Math.min(x1, x2) - tickW - 1));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(x1, x2) + tickW + 1));
    const minY = Math.max(0, Math.floor(Math.min(y1, y2) - tickW - 1));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(y1, y2) + tickW + 1));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const d = distToLine(x, y, x1, y1, x2, y2);
        if (d < tickW) {
          const alpha = Math.min(1, tickW - d);
          setPixel(x, y, TICK, alpha);
        }
      }
    }
  }

  // 3. Clock hands
  function drawHand(angle, length, width) {
    const hx = cx + Math.cos(angle) * length;
    const hy = cy + Math.sin(angle) * length;
    const minX = Math.max(0, Math.floor(Math.min(cx, hx) - width - 1));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(cx, hx) + width + 1));
    const minY = Math.max(0, Math.floor(Math.min(cy, hy) - width - 1));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(cy, hy) + width + 1));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const d = distToLine(x, y, cx, cy, hx, hy);
        if (d < width) {
          const alpha = Math.min(1, width - d);
          setPixel(x, y, HAND, alpha);
        }
      }
    }
  }

  drawHand(hourAngle, hourLen, handWidth);
  drawHand(minuteAngle, minuteLen, handWidth * 0.85);

  // 4. Center dot
  const dotR = handWidth * 1.4;
  for (let y = Math.floor(cy - dotR - 1); y <= Math.ceil(cy + dotR + 1); y++) {
    for (let x = Math.floor(cx - dotR - 1); x <= Math.ceil(cx + dotR + 1); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < dotR) {
        const alpha = Math.min(1, dotR - d);
        setPixel(x, y, CENTER, alpha);
      }
    }
  }

  return raw;
}

function encodePng(rawRgba, size) {
  // Prepend filter byte (0) to each row
  const withFilter = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    withFilter[y * (size * 4 + 1)] = 0;
    rawRgba.copy(withFilter, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const deflated = zlib.deflateSync(withFilter);

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflated),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ----- ICO generation -----
// Windows ICO format — multi-resolution container that embeds PNGs for sizes >= 256
// and BMP for smaller sizes. We'll just embed PNGs for all sizes (supported by Vista+).

function makeIco(sizes) {
  // sizes is array of { size: N, pngBuffer: Buffer }
  const count = sizes.length;
  const headerSize = 6;
  const entrySize = 16;
  const dataStart = headerSize + entrySize * count;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // type = 1 (icon)
  header.writeUInt16LE(count, 4);  // number of images

  const entries = [];
  const pngData = [];
  let offset = dataStart;

  for (const { size, pngBuffer } of sizes) {
    const entry = Buffer.alloc(entrySize);
    entry[0] = size >= 256 ? 0 : size;  // width (0 = 256)
    entry[1] = size >= 256 ? 0 : size;  // height
    entry[2] = 0;                        // color palette
    entry[3] = 0;                        // reserved
    entry.writeUInt16LE(1, 4);           // color planes
    entry.writeUInt16LE(32, 6);          // bits per pixel
    entry.writeUInt32LE(pngBuffer.length, 8);  // image size
    entry.writeUInt32LE(offset, 12);     // offset
    entries.push(entry);
    pngData.push(pngBuffer);
    offset += pngBuffer.length;
  }

  return Buffer.concat([header, ...entries, ...pngData]);
}

// ----- Main -----

const outDir = path.join(__dirname, '..');
const sizes = [16, 32, 48, 64, 128, 256];
const pngs = {};

console.log('Generating clock icon...');
for (const size of sizes) {
  const raw = makeClockPixels(size);
  pngs[size] = encodePng(raw, size);
  console.log(`  ${size}x${size} PNG: ${pngs[size].length} bytes`);
}

// Write main icon.png (use 256x256 as the master)
fs.writeFileSync(path.join(outDir, 'icon.png'), pngs[256]);
console.log(`\nWrote icon.png (256x256)`);

// Write icon.ico with all sizes
const icoEntries = sizes.map(size => ({ size, pngBuffer: pngs[size] }));
const ico = makeIco(icoEntries);
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico);
console.log(`Wrote icon.ico (${sizes.join(', ')}) — ${ico.length} bytes`);

console.log('\nDone.');
