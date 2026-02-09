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
 * Mapbox Static image URL with GeoJSON line overlay and auto-fit.
 * Mapbox expects [lng,lat].
 */
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
      "stroke-width": 6,
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
  photoUrls: string[]; // images only
}): Promise<Blob> {
  // Portrait recap
  const W = 1080;
  const H = 1920;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // ---------- Background ----------
  ctx.fillStyle = "#0b0b0c";
  ctx.fillRect(0, 0, W, H);

  const pad = 48;
  const gap = 24;

  // Card radii
  const cardR = 28;

  // Layout sizes (matches old card proportions)
  const headerH = 170;
  const mapH = 560;
  const statsH = 280;

  const mapY = headerH + 10;
  const statsY = mapY + mapH + gap;
  const collageY = statsY + statsH + gap;
  const collageH = H - collageY - pad;

  // ---------- Header ----------
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 76px Arial";
  safeText(ctx, "Walk Recap", pad, 92);

  ctx.font = "800 44px Arial";
  safeText(ctx, params.dogs || "Dogs", pad, 145);

  ctx.fillStyle = "rgba(255,255,255,0.70)";
  ctx.font = "600 28px Arial";
  safeText(ctx, params.createdAtLabel || new Date().toLocaleString(), pad, 190);

  // ---------- Map Card ----------
  const cardX = pad;
  const cardW = W - pad * 2;

  // Card bg
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, cardX, mapY, cardW, mapH, cardR);
  ctx.fill();

  const mapUrl = buildStaticMapUrl({
    points: params.routePoints,
    width: 1000,
    height: 560,
  });

  if (mapUrl) {
    try {
      const mapImg = await fetchImageBitmap(mapUrl);
      drawRoundedImage(ctx, mapImg, cardX, mapY, cardW, mapH, cardR);
    } catch {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "800 32px Arial";
      safeText(ctx, "Map failed to load", cardX + 24, mapY + 80);
    }
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "800 32px Arial";
    safeText(ctx, "Map unavailable", cardX + 24, mapY + 80);
  }

  // ---------- Stats Card ----------
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, cardX, statsY, cardW, statsH, cardR);
  ctx.fill();

  // 3 columns like old card
  const inner = 28;
  const colW = (cardW - inner * 2) / 3;

  const labelY = statsY + 72;
  const valueY = statsY + 128;

  const temp = params.weather?.temperatureF;
  const summary = params.weather?.summary || "";

  const labels = ["Duration", "Distance", "Weather"];
  const values = [
    `${params.durationMinutes} min`,
    `${params.distanceMiles.toFixed(2)} mi`,
    `${temp != null ? `${temp}°F` : "—"}  ${summary}`.trim(),
  ];

  for (let i = 0; i < 3; i++) {
    const x = cardX + inner + i * colW;

    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = "800 26px Arial";
    safeText(ctx, labels[i], x, labelY);

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 52px Arial";
    safeText(ctx, values[i], x, valueY);
  }

  // Notes (left aligned under columns)
  const notesLabelY = statsY + 185;
  const notesTextY = statsY + 235;

  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = "800 26px Arial";
  safeText(ctx, "Notes", cardX + inner, notesLabelY);

  ctx.fillStyle = "#ffffff";
  ctx.font = "500 30px Arial";
  wrapText(
    ctx,
    (params.notes || "").trim() || "—",
    cardX + inner,
    notesTextY,
    cardW - inner * 2,
    38,
    2,
  );

  // ---------- Photos / Collage Card ----------
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, cardX, collageY, cardW, collageH, cardR);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.70)";
  ctx.font = "800 28px Arial";
  safeText(ctx, "Photos", cardX + 28, collageY + 58);

  const gridPad = 22;
  const gridX = cardX + gridPad;
  const gridY = collageY + 88;
  const gridW = cardW - gridPad * 2;
  const gridH = collageH - 110;

  const urls = (params.photoUrls || []).slice(0, 8);

  if (urls.length === 0) {
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "800 32px Arial";
    safeText(ctx, "No photos uploaded", gridX, gridY + 80);
  } else {
    // 7–8 images = 4 columns x 2 rows
    const cols = urls.length <= 6 ? 3 : 4;
    const rows = 2;

    const cellGap = 16;
    const cellW = Math.floor((gridW - cellGap * (cols - 1)) / cols);
    const cellH = Math.floor((gridH - cellGap * (rows - 1)) / rows);

    for (let i = 0; i < urls.length; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      if (r >= rows) break;

      const x = gridX + c * (cellW + cellGap);
      const y = gridY + r * (cellH + cellGap);

      try {
        const img = await fetchImageBitmap(urls[i]);
        drawRoundedImage(ctx, img, x, y, cellW, cellH, 20);
      } catch {
        // fallback block
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        roundRect(ctx, x, y, cellW, cellH, 20);
        ctx.fill();
      }
    }
  }

  // ---------- Export ----------
  return await new Promise<Blob>((resolve, reject) => {
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

  // cover fit
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;

  let drawW = w;
  let drawH = h;
  let dx = x;
  let dy = y;

  if (imgRatio > boxRatio) {
    drawH = h;
    drawW = h * imgRatio;
    dx = x - (drawW - w) / 2;
  } else {
    drawW = w;
    drawH = w / imgRatio;
    dy = y - (drawH - h) / 2;
  }

  ctx.drawImage(img, dx, dy, drawW, drawH);
  ctx.restore();
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

  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    const w = ctx.measureText(test).width;

    if (w > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      lines++;
      line = words[i];

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
