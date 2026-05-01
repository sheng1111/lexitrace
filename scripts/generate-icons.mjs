import { writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  const canvas = createCanvas(size, size);
  drawIcon(canvas);
  await writeFile(new URL(`../public/icons/icon-${size}.png`, import.meta.url), encodePng(canvas));
}

function createCanvas(width, height) {
  return {
    width,
    height,
    pixels: new Uint8ClampedArray(width * height * 4)
  };
}

function drawIcon(canvas) {
  const s = canvas.width / 128;
  fillRoundedRect(canvas, 16 * s, 16 * s, 96 * s, 96 * s, 22 * s, [238, 246, 255, 255]);
  fillRoundedRect(canvas, 30 * s, 24 * s, 68 * s, 80 * s, 16 * s, [248, 251, 255, 255]);
  fillRoundedRect(canvas, 42 * s, 44 * s, 44 * s, 7 * s, 3 * s, [183, 215, 255, 210]);
  fillRoundedRect(canvas, 42 * s, 58 * s, 34 * s, 7 * s, 3 * s, [183, 215, 255, 210]);
  fillRoundedRect(canvas, 42 * s, 72 * s, 44 * s, 7 * s, 3 * s, [183, 215, 255, 210]);
  fillRoundedRect(canvas, 40 * s, 76 * s, 30 * s, 12 * s, 6 * s, [250, 204, 21, 235]);
  strokeCircle(canvas, 67.5 * s, 64.5 * s, 18 * s, 9 * s, [29, 78, 216, 255]);
  strokeLine(canvas, 82 * s, 79 * s, 96 * s, 93 * s, 10 * s, [8, 145, 178, 255]);
  fillCircle(canvas, 67.5 * s, 64.5 * s, 8 * s, [255, 255, 255, 245]);
  fillCircle(canvas, 46 * s, 96 * s, 5 * s, [15, 118, 110, 95]);
  fillCircle(canvas, 56 * s, 100 * s, 4 * s, [15, 118, 110, 80]);
  fillCircle(canvas, 66 * s, 101 * s, 3 * s, [15, 118, 110, 70]);
}

function fillRoundedRect(canvas, x, y, width, height, radius, color) {
  const x1 = Math.floor(x);
  const y1 = Math.floor(y);
  const x2 = Math.ceil(x + width);
  const y2 = Math.ceil(y + height);

  for (let py = y1; py < y2; py += 1) {
    for (let px = x1; px < x2; px += 1) {
      const dx = Math.max(x + radius - px, 0, px - (x + width - radius));
      const dy = Math.max(y + radius - py, 0, py - (y + height - radius));

      if (dx * dx + dy * dy <= radius * radius) {
        blendPixel(canvas, px, py, color);
      }
    }
  }
}

function fillCircle(canvas, cx, cy, radius, color) {
  const x1 = Math.floor(cx - radius);
  const y1 = Math.floor(cy - radius);
  const x2 = Math.ceil(cx + radius);
  const y2 = Math.ceil(cy + radius);

  for (let y = y1; y <= y2; y += 1) {
    for (let x = x1; x <= x2; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        blendPixel(canvas, x, y, color);
      }
    }
  }
}

function strokeCircle(canvas, cx, cy, radius, width, color) {
  const outer = radius + width / 2;
  const inner = Math.max(0, radius - width / 2);
  const x1 = Math.floor(cx - outer);
  const y1 = Math.floor(cy - outer);
  const x2 = Math.ceil(cx + outer);
  const y2 = Math.ceil(cy + outer);

  for (let y = y1; y <= y2; y += 1) {
    for (let x = x1; x <= x2; x += 1) {
      const distance = Math.hypot(x - cx, y - cy);
      if (distance >= inner && distance <= outer) {
        blendPixel(canvas, x, y, color);
      }
    }
  }
}

function strokeLine(canvas, x1, y1, x2, y2, width, color) {
  const radius = width / 2;
  const minX = Math.floor(Math.min(x1, x2) - radius);
  const maxX = Math.ceil(Math.max(x1, x2) + radius);
  const minY = Math.floor(Math.min(y1, y2) - radius);
  const maxY = Math.ceil(Math.max(y1, y2) + radius);
  const lengthSquared = (x2 - x1) ** 2 + (y2 - y1) ** 2;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const t = Math.max(
        0,
        Math.min(1, ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / lengthSquared)
      );
      const projectionX = x1 + t * (x2 - x1);
      const projectionY = y1 + t * (y2 - y1);
      if (Math.hypot(x - projectionX, y - projectionY) <= radius) {
        blendPixel(canvas, x, y, color);
      }
    }
  }
}

function blendPixel(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
    return;
  }

  const index = (Math.floor(y) * canvas.width + Math.floor(x)) * 4;
  const alpha = color[3] / 255;
  const inverse = 1 - alpha;
  canvas.pixels[index] = Math.round(color[0] * alpha + canvas.pixels[index] * inverse);
  canvas.pixels[index + 1] = Math.round(color[1] * alpha + canvas.pixels[index + 1] * inverse);
  canvas.pixels[index + 2] = Math.round(color[2] * alpha + canvas.pixels[index + 2] * inverse);
  canvas.pixels[index + 3] = Math.round(color[3] + canvas.pixels[index + 3] * inverse);
}

function encodePng(canvas) {
  const raw = Buffer.alloc((canvas.width * 4 + 1) * canvas.height);

  for (let y = 0; y < canvas.height; y += 1) {
    const rowStart = y * (canvas.width * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < canvas.width * 4; x += 1) {
      raw[rowStart + 1 + x] = canvas.pixels[y * canvas.width * 4 + x];
    }
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    createChunk("IHDR", createIhdr(canvas.width, canvas.height)),
    createChunk("IDAT", deflateSync(raw)),
    createChunk("IEND", Buffer.alloc(0))
  ]);
}

function createIhdr(width, height) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8;
  data[9] = 6;
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return data;
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
