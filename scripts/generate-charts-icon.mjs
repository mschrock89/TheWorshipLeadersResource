import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const OUT_DIR = path.resolve("public/charts");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rgba(hex, alpha = 255) {
  const normalized = hex.replace("#", "");
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
    a: alpha,
  };
}

function blendPixel(buffer, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const index = (y * size + x) * 4;
  const alpha = color.a / 255;
  const inv = 1 - alpha;
  buffer[index] = Math.round(color.r * alpha + buffer[index] * inv);
  buffer[index + 1] = Math.round(color.g * alpha + buffer[index + 1] * inv);
  buffer[index + 2] = Math.round(color.b * alpha + buffer[index + 2] * inv);
  buffer[index + 3] = 255;
}

function fill(size, painter) {
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const color = painter(x, y);
      const idx = (y * size + x) * 4;
      pixels[idx] = color.r;
      pixels[idx + 1] = color.g;
      pixels[idx + 2] = color.b;
      pixels[idx + 3] = color.a;
    }
  }

  return pixels;
}

function drawRoundedRect(buffer, size, rect, color) {
  const { x, y, width, height, radius } = rect;
  const r = radius;
  for (let py = Math.floor(y); py < Math.ceil(y + height); py += 1) {
    for (let px = Math.floor(x); px < Math.ceil(x + width); px += 1) {
      let inside = false;
      const left = x + r;
      const right = x + width - r;
      const top = y + r;
      const bottom = y + height - r;

      if (px >= left && px < right && py >= y && py < y + height) inside = true;
      if (py >= top && py < bottom && px >= x && px < x + width) inside = true;

      const corners = [
        [left, top],
        [right - 1, top],
        [left, bottom - 1],
        [right - 1, bottom - 1],
      ];

      if (!inside) {
        inside = corners.some(([cx, cy]) => ((px - cx) ** 2 + (py - cy) ** 2) <= r ** 2);
      }

      if (inside) {
        blendPixel(buffer, size, px, py, color);
      }
    }
  }
}

function drawLine(buffer, size, x1, y1, x2, y2, thickness, color) {
  const minX = Math.floor(Math.min(x1, x2) - thickness);
  const maxX = Math.ceil(Math.max(x1, x2) + thickness);
  const minY = Math.floor(Math.min(y1, y2) - thickness);
  const maxY = Math.ceil(Math.max(y1, y2) + thickness);

  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy || 1;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const t = clamp(((x - x1) * dx + (y - y1) * dy) / lengthSquared, 0, 1);
      const projX = x1 + t * dx;
      const projY = y1 + t * dy;
      const distance = Math.hypot(x - projX, y - projY);
      if (distance <= thickness / 2) {
        blendPixel(buffer, size, x, y, color);
      }
    }
  }
}

function drawCircle(buffer, size, cx, cy, radius, color) {
  const minX = Math.floor(cx - radius);
  const maxX = Math.ceil(cx + radius);
  const minY = Math.floor(cy - radius);
  const maxY = Math.ceil(cy + radius);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) {
        blendPixel(buffer, size, x, y, color);
      }
    }
  }
}

function writePng(filePath, width, height, rgbaPixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgbaPixels.copy(
      raw,
      y * (width * 4 + 1) + 1,
      y * width * 4,
      (y + 1) * width * 4,
    );
  }

  const compressed = zlib.deflateSync(raw);

  const chunks = [
    pngChunk("IHDR", (() => {
      const buf = Buffer.alloc(13);
      buf.writeUInt32BE(width, 0);
      buf.writeUInt32BE(height, 4);
      buf[8] = 8;
      buf[9] = 6;
      buf[10] = 0;
      buf[11] = 0;
      buf[12] = 0;
      return buf;
    })()),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ];

  fs.writeFileSync(filePath, Buffer.concat([signature, ...chunks]));
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createIcon(size) {
  const dark = rgba("#0F1418");
  const blue = rgba("#35B0E5");
  const teal = rgba("#008DB3");
  const navy = rgba("#27749D");
  const yellow = rgba("#FFB838");
  const white = rgba("#FFFFFF");
  const panel = rgba("#111B21");

  const pixels = fill(size, (x, y) => {
    const t = (x + y) / (size * 2);
    return {
      r: Math.round(blue.r * (1 - t) + teal.r * t * 0.9 + navy.r * t * 0.4),
      g: Math.round(blue.g * (1 - t) + teal.g * t * 0.9 + navy.g * t * 0.4),
      b: Math.round(blue.b * (1 - t) + teal.b * t * 0.9 + navy.b * t * 0.4),
      a: 255,
    };
  });

  drawRoundedRect(pixels, size, {
    x: size * 0.055,
    y: size * 0.055,
    width: size * 0.89,
    height: size * 0.89,
    radius: size * 0.22,
  }, dark);

  drawRoundedRect(pixels, size, {
    x: size * 0.12,
    y: size * 0.12,
    width: size * 0.76,
    height: size * 0.76,
    radius: size * 0.15,
  }, panel);

  drawRoundedRect(pixels, size, {
    x: size * 0.215,
    y: size * 0.28,
    width: size * 0.53,
    height: size * 0.42,
    radius: size * 0.06,
  }, rgba("#091015", 220));

  const lines = [
    [0.29, 0.40, 0.67],
    [0.29, 0.48, 0.61],
    [0.29, 0.56, 0.67],
    [0.29, 0.64, 0.54],
  ];

  lines.forEach(([x1, y, x2], index) => {
    drawLine(
      pixels,
      size,
      size * x1,
      size * y,
      size * x2,
      size * y,
      size * 0.03,
      rgba(index === 0 ? "#5EC5F2" : "#35B0E5"),
    );
  });

  drawCircle(pixels, size, size * 0.76, size * 0.245, size * 0.075, teal);
  drawLine(pixels, size, size * 0.76, size * 0.205, size * 0.76, size * 0.285, size * 0.017, white);
  drawLine(pixels, size, size * 0.72, size * 0.245, size * 0.80, size * 0.245, size * 0.017, white);

  const star = [
    [0, -1],
    [0.225, -0.31],
    [0.95, -0.31],
    [0.36, 0.12],
    [0.59, 0.83],
    [0, 0.39],
    [-0.59, 0.83],
    [-0.36, 0.12],
    [-0.95, -0.31],
    [-0.225, -0.31],
  ];

  const centerX = size * 0.59;
  const centerY = size * 0.40;
  const radius = size * 0.09;
  for (let y = Math.floor(centerY - radius); y <= Math.ceil(centerY + radius); y += 1) {
    for (let x = Math.floor(centerX - radius); x <= Math.ceil(centerX + radius); x += 1) {
      let inside = false;
      for (let i = 0, j = star.length - 1; i < star.length; j = i, i += 1) {
        const xi = centerX + star[i][0] * radius;
        const yi = centerY + star[i][1] * radius;
        const xj = centerX + star[j][0] * radius;
        const yj = centerY + star[j][1] * radius;
        const intersect = ((yi > y) !== (yj > y))
          && (x < ((xj - xi) * (y - yi)) / (yj - yi + 0.00001) + xi);
        if (intersect) inside = !inside;
      }
      if (inside) blendPixel(pixels, size, x, y, yellow);
    }
  }

  return pixels;
}

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const size of [192, 512, 1024]) {
  const filePath = path.join(OUT_DIR, `icon-${size}.png`);
  writePng(filePath, size, size, createIcon(size));
  console.log(`Wrote ${filePath}`);
}
