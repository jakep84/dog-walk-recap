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
 * Create a Mapbox Static image URL with a GeoJSON line overlay and auto-fit.
 * NOTE: Mapbox expects [lng,lat]
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
      stroke: "#2b6fff",
      "stroke-width": 6,
      "stroke-opacity": 0.95,
    },
    geometry: { type: "LineString", coordinates: coords },
  };

  const overlay = `geojson(${encodeURIComponent(JSON.stringify(feature))})`;

  // "auto" fits overlay automatically
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
  walkId?: string;
}): Promise<Blob> {
  const W = 1080;
  const H = 1920;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // Background
  ctx.fillStyle = "#0b0b0c";
  ctx.fillRect(0, 0, W, H);

  // Layout
  const pad = 48;

  const headerH = 220;
  const mapH = 520;
  const statsH = 240;

  const cardGap = 24;

  // ---------- Header ----------
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 74px Arial";
  safeText(ctx, "Walk Recap", pad, 95);

  ctx.font = "800 44px Arial";
  safeText(ctx, params.dogs || "Dogs", pad, 150);

  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "600 28px Arial";
  safeText(ctx, params.createdAtLabel || new Date().toLocaleString(), pad, 198);

  // ---------- Map Card ----------
  const mapY = headerH;
  const mapX = pad;
  const mapW = W - pad * 2;

  // Card background
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, mapX, mapY, mapW, mapH, 28);
  ctx.fill();

  // Map image inside card
  const mapUrl = buildStaticMapUrl({
    points: params.routePoints,
    width: 900,
    height: 520,
  });

  if (mapUrl) {
    try {
      const mapImg = await fetchImageBitmap(mapUrl);
      drawRoundedImage(ctx, mapImg, mapX, mapY, mapW, mapH, 28);
    } catch {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "800 30px Arial";
      safeText(ctx, "Map failed to load", mapX + 24, mapY + 70);
    }
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "800 30px Arial";
    safeText(ctx, "Map unavailable", mapX + 24, mapY + 70);
  }

  // ---------- Stats Card ----------
  const statsY = mapY + mapH + cardGap;
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, pad, statsY, W - pad * 2, statsH, 28);
  ctx.fill();

  // 3 columns
  const innerPad = 28;
  const colW = (W - pad * 2 - innerPad * 2) / 3;

  const statLabelY = statsY + 62;
  const statValueY = statsY + 118;

  const labels = ["Duration", "Distance", "Weather"];
  const values = [
    `${params.durationMinutes} min`,
    `${params.distanceMiles.toFixed(2)} mi`,
    `${params.weather?.temperatureF != null ? `${params.weather.temperatureF}°F` : "—"} ${
      params.weather?.summary || ""
    }`.trim(),
  ];

  for (let i = 0; i < 3; i++) {
    const x = pad + innerPad + i * colW;

    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "800 24px Arial";
    safeText(ctx, labels[i], x, statLabelY);

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 44px Arial";
    safeText(ctx, values[i], x, statValueY);
  }

  // Notes section (small)
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "800 24px Arial";
  safeText(ctx, "Notes", pad + innerPad, statsY + 168);

  ctx.fillStyle = "#ffffff";
  ctx.font = "500 28px Arial";
  const notesText = (params.notes || "").trim() || "—";
  wrapText(
    ctx,
    notesText,
    pad + innerPad,
    statsY + 210,
    mapW - innerPad * 2,
    34,
    2,
  );

  // ---------- Collage Card ----------
  const collageY = statsY + statsH + cardGap;
  const collageH = H - collageY - pad;

  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, pad, collageY, W - pad * 2, collageH, 28);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "800 26px Arial";
  safeText(ctx, "Photos", pad + 28, collageY + 54);

  const gridPad = 22;
  const gridX = pad + gridPad;
  const gridY = collageY + 84;
  const gridW = W - pad * 2 - gridPad * 2;
  const gridH = collageH - 110;

  const urls = (params.photoUrls || []).slice(0, 8);

  if (urls.length === 0) {
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "800 32px Arial";
    safeText(ctx, "No photos uploaded", gridX, gridY + 80);
  } else {
    // 8 max: use 2 rows x 4 cols for 5–8, or 2x3 for 6, or 2x2 for <=4
    let cols = 2;
    let rows = 2;

    if (urls.length <= 4) {
      cols = 2;
      rows = 2;
    } else if (urls.length <= 6) {
      cols = 3;
      rows = 2;
    } else {
      cols = 4;
      rows = 2;
    }

    const gap = 16;
    const cellW = Math.floor((gridW - gap * (cols - 1)) / cols);
    const cellH = Math.floor((gridH - gap * (rows - 1)) / rows);

    for (let i = 0; i < urls.length; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      if (r >= rows) break;

      const x = gridX + c * (cellW + gap);
      const y = gridY + r * (cellH + gap);

      try {
        const img = await fetchImageBitmap(urls[i]);
        drawRoundedImage(ctx, img, x, y, cellW, cellH, 20);
      } catch {
        // fallback box
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        roundRect(ctx, x, y, cellW, cellH, 20);
        ctx.fill();
      }
    }
  }

  // Export
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
