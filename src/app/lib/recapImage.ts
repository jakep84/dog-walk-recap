// src/app/lib/recapImage.ts
import type { LatLng } from "./geo";

type WeatherNow = { temperatureF: number | null; summary: string };

function safeText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
) {
  ctx.fillText(text ?? "", x, y);
}

/**
 * Proxy Firebase Storage URLs through our own domain to avoid browser CORS
 * when fetching into canvas.
 */
function maybeProxyUrl(url: string): string {
  if (!url) return url;

  if (
    url.startsWith("https://firebasestorage.googleapis.com/") ||
    url.startsWith("https://storage.googleapis.com/")
  ) {
    return `/api/media-proxy?url=${encodeURIComponent(url)}`;
  }

  return url;
}

// Create a Mapbox Static image URL with a GeoJSON line overlay and auto-fit.
export function buildStaticMapUrl(params: {
  points: LatLng[];
  width: number;
  height: number;
}): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;

  const { points, width, height } = params;
  if (!points || points.length < 2) return null;

  const coords = points.map((p) => [p.lng, p.lat]);

  const feature = {
    type: "Feature",
    properties: {
      stroke: "#111111",
      "stroke-width": 5,
      "stroke-opacity": 0.9,
    },
    geometry: { type: "LineString", coordinates: coords },
  };

  const overlay = `geojson(${encodeURIComponent(JSON.stringify(feature))})`;

  return (
    `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/` +
    `${overlay}/auto/${width}x${height}` +
    `?padding=60&access_token=${encodeURIComponent(token)}`
  );
}

async function fetchImageBitmap(url: string): Promise<ImageBitmap> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Failed to fetch image: ${r.status}`);
  const blob = await r.blob();
  return await createImageBitmap(blob);
}

export async function generateWalkRecapPng(params: {
  dogs: string;
  durationMinutes: number;
  distanceMiles: number;
  weather: WeatherNow | null;
  notes: string;
  createdAtLabel?: string;
  routePoints: LatLng[];
  photoUrls: string[];
  walkId?: string; // optional tiny footer id (safe)
}): Promise<Blob> {
  const W = 1080;
  const H = 1920;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d")!;
  if (!ctx) throw new Error("Canvas not supported");

  // Background
  ctx.fillStyle = "#0b0b0c";
  ctx.fillRect(0, 0, W, H);

  const pad = 48;
  const radius = 28;

  // ===== Header =====
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 46px Arial";
  safeText(ctx, "Walk Recap", pad, 108);

  ctx.font = "900 54px Arial";
  safeText(ctx, params.dogs || "Dogs", pad, 162);

  ctx.font = "600 28px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  safeText(ctx, params.createdAtLabel || new Date().toLocaleString(), pad, 204);

  // ===== Map =====
  const mapY = 230;
  const mapH = 610;
  const mapW = W - pad * 2;

  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, pad, mapY, mapW, mapH, radius);
  ctx.fill();

  const mapUrl = buildStaticMapUrl({
    points: params.routePoints,
    width: 1080,
    height: mapH,
  });

  if (mapUrl) {
    const mapImg = await fetchImageBitmap(mapUrl);
    drawRoundedImage(ctx, mapImg, pad, mapY, mapW, mapH, radius);
  }

  // ===== Stats (3 columns) =====
  const statsY = mapY + mapH + 24;
  const statsH = 210;

  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, pad, statsY, mapW, statsH, radius);
  ctx.fill();

  const cols = 3;
  const inner = 28;
  const colW = (mapW - inner * 2) / cols;

  function stat(col: number, label: string, value: string, sub?: string) {
    const x = pad + inner + col * colW;

    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "800 24px Arial";
    safeText(ctx, label, x, statsY + 62);

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 44px Arial";
    safeText(ctx, value, x, statsY + 120);

    if (sub) {
      ctx.font = "700 28px Arial";
      safeText(ctx, sub, x, statsY + 160);
    }
  }

  stat(0, "Duration", `${params.durationMinutes} min`);
  stat(1, "Distance", `${params.distanceMiles.toFixed(2)} mi`);

  const temp = params.weather?.temperatureF;
  const summary = params.weather?.summary || "—";
  stat(2, "Weather", temp != null ? `${temp}°F` : "—", summary);

  // ===== Notes =====
  const notesY = statsY + statsH + 18;
  const notesH = 165;

  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, pad, notesY, mapW, notesH, radius);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "800 26px Arial";
  safeText(ctx, "Notes", pad + inner, notesY + 58);

  ctx.fillStyle = "#ffffff";
  ctx.font = "500 30px Arial";
  wrapText(
    ctx,
    (params.notes || "—").trim(),
    pad + inner,
    notesY + 105,
    mapW - inner * 2,
    38,
    3,
  );

  // ===== Photos (3x2 grid) =====
  const photosY = notesY + notesH + 22;
  const photosH = H - photosY - 56;

  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, pad, photosY, mapW, photosH, radius);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "800 26px Arial";
  safeText(ctx, "Photos", pad + inner, photosY + 56);

  const gridPad = 24;
  const gridX = pad + gridPad;
  const gridY = photosY + 86;
  const gridW = mapW - gridPad * 2;
  const gridH = photosH - 110;

  const photoCols = 3;
  const photoRows = 2;
  const gap = 16;

  const cellW = Math.floor((gridW - gap * (photoCols - 1)) / photoCols);
  const cellH = Math.floor((gridH - gap * (photoRows - 1)) / photoRows);

  const urls = params.photoUrls.slice(0, 6).map(maybeProxyUrl);

  for (let i = 0; i < 6; i++) {
    const r = Math.floor(i / photoCols);
    const c = i % photoCols;
    const x = gridX + c * (cellW + gap);
    const y = gridY + r * (cellH + gap);

    if (urls[i]) {
      try {
        const img = await fetchImageBitmap(urls[i]);
        drawRoundedImage(ctx, img, x, y, cellW, cellH, 22);
      } catch {
        drawPlaceholder(ctx, x, y, cellW, cellH);
      }
    } else {
      drawPlaceholder(ctx, x, y, cellW, cellH);
    }
  }

  // ===== Footer ID (optional, subtle) =====
  if (params.walkId) {
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "600 20px Arial";
    const txt = `ID: ${params.walkId}`;
    const tw = ctx.measureText(txt).width;
    safeText(ctx, txt, W - pad - tw, H - 26);
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG export failed"))),
      "image/png",
    );
  });
}

// ---------- helpers ----------
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawRoundedImage(
  ctx: CanvasRenderingContext2D,
  img: ImageBitmap,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();

  const ir = img.width / img.height;
  const br = w / h;
  let dw = w;
  let dh = h;
  let dx = x;
  let dy = y;

  if (ir > br) {
    dh = h;
    dw = h * ir;
    dx -= (dw - w) / 2;
  } else {
    dw = w;
    dh = w / ir;
    dy -= (dh - h) / 2;
  }

  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(x, y, w, h);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = text.split(/\s+/);
  let line = "";
  let lines = 0;

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      line = word;
      lines++;
      if (lines >= maxLines) {
        ctx.fillText(line + "…", x, y + lines * lineHeight);
        return;
      }
    } else {
      line = test;
    }
  }

  ctx.fillText(line, x, y + lines * lineHeight);
}
