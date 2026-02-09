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
 * If a URL is a Firebase Storage download URL, fetch it through our same-origin proxy
 * to avoid browser CORS blocking canvas/image composition.
 */
function maybeProxyUrl(url: string): string {
  if (!url) return url;

  // Only proxy Firebase Storage download URLs
  if (url.startsWith("https://firebasestorage.googleapis.com/")) {
    return `/api/media-proxy?url=${encodeURIComponent(url)}`;
  }

  // (Optional) also proxy storage.googleapis.com if you ever use that URL style
  if (url.startsWith("https://storage.googleapis.com/")) {
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

  // IMPORTANT: Mapbox expects [lng,lat]
  const coords = points.map((p) => [p.lng, p.lat]);

  const feature = {
    type: "Feature",
    properties: { stroke: "#111111", "stroke-width": 5, "stroke-opacity": 0.9 },
    geometry: { type: "LineString", coordinates: coords },
  };

  const overlay = `geojson(${encodeURIComponent(JSON.stringify(feature))})`;

  // "auto" makes Mapbox fit the overlay automatically
  const url =
    `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/` +
    `${overlay}/auto/${width}x${height}` +
    `?padding=60&access_token=${encodeURIComponent(token)}`;

  return url;
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
  photoUrls: string[]; // only images for now
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
  const headerH = 170;
  const mapH = 620;
  const statsH = 280;
  const collageH = 700;

  // Header
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 64px Arial";
  safeText(ctx, "Walk Recap", pad, 95);

  ctx.font = "700 40px Arial";
  safeText(ctx, params.dogs || "Dogs", pad, 150);

  ctx.font = "500 28px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  safeText(ctx, params.createdAtLabel || new Date().toLocaleString(), pad, 195);

  // Map
  const mapY = headerH + 10;
  const mapUrl = buildStaticMapUrl({
    points: params.routePoints,
    width: 1080,
    height: mapH,
  });

  // Map container
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, 0 + pad, mapY, W - pad * 2, mapH, 28);
  ctx.fill();

  if (mapUrl) {
    const mapImg = await fetchImageBitmap(mapUrl);
    // draw inside rounded rect
    drawRoundedImage(ctx, mapImg, pad, mapY, W - pad * 2, mapH, 28);
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "700 32px Arial";
    safeText(
      ctx,
      "Map unavailable (missing token or route)",
      pad + 24,
      mapY + 80,
    );
  }

  // Stats block
  const statsY = mapY + mapH + 28;
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, pad, statsY, W - pad * 2, statsH, 28);
  ctx.fill();

  const leftX = pad + 28;
  const row1Y = statsY + 70;
  const row2Y = statsY + 150;

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "700 26px Arial";
  safeText(ctx, "Duration", leftX, row1Y);
  safeText(ctx, "Distance", leftX + 360, row1Y);
  safeText(ctx, "Weather", leftX + 720, row1Y);

  ctx.fillStyle = "#ffffff";
  ctx.font = "900 44px Arial";
  safeText(ctx, `${params.durationMinutes} min`, leftX, row1Y + 55);
  safeText(
    ctx,
    `${params.distanceMiles.toFixed(2)} mi`,
    leftX + 360,
    row1Y + 55,
  );

  const temp = params.weather?.temperatureF;
  const summary = params.weather?.summary || "";
  safeText(
    ctx,
    `${temp != null ? `${temp}°F` : "—"}  ${summary}`,
    leftX + 720,
    row1Y + 55,
  );

  // Notes
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "700 26px Arial";
  safeText(ctx, "Notes", leftX, row2Y + 15);

  ctx.fillStyle = "#ffffff";
  ctx.font = "500 30px Arial";
  const notesText = (params.notes || "").trim();
  wrapText(ctx, notesText || "—", leftX, row2Y + 65, W - pad * 2 - 56, 38, 3);

  // Collage
  const collageY = statsY + statsH + 28;
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, pad, collageY, W - pad * 2, collageH, 28);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "700 26px Arial";
  safeText(ctx, "Photos", pad + 28, collageY + 52);

  const gridPad = 24;
  const gridX = pad + gridPad;
  const gridY = collageY + 80;
  const gridW = W - pad * 2 - gridPad * 2;
  const gridH = collageH - 110;

  // 2x2 grid (up to 4 images)
  const cols = 3;
  const rows = 2;
  const gap = 18;
  const cellW = Math.floor((gridW - gap) / cols);
  const cellH = Math.floor((gridH - gap) / rows);

  // ✅ Important: proxy Firebase Storage URLs so fetch() isn't blocked by CORS
  const urls = (params.photoUrls || [])
    .slice(0, 6)
    .map((u) => maybeProxyUrl(u));

  if (urls.length === 0) {
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "700 32px Arial";
    safeText(ctx, "No photos uploaded", gridX, gridY + 80);
  } else {
    for (let i = 0; i < urls.length; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = gridX + c * (cellW + gap);
      const y = gridY + r * (cellH + gap);

      const img = await fetchImageBitmap(urls[i]);
      drawRoundedImage(ctx, img, x, y, cellW, cellH, 22);
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
    // image is wider
    drawH = h;
    drawW = h * imgRatio;
    dx = x - (drawW - w) / 2;
  } else {
    // image is taller
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
