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

  if (url.startsWith("https://firebasestorage.googleapis.com/")) {
    return `/api/media-proxy?url=${encodeURIComponent(url)}`;
  }

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

function formatMoney(n: number | null | undefined): string {
  if (typeof n !== "number" || !isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
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
  amountDue?: number | null; // show on the recap
  walkId?: string; // tiny footer id
}): Promise<Blob> {
  const W = 1080;
  const H = 1920;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;

  // ✅ Non-null assertion so TS doesn't complain inside nested functions
  const ctx = canvas.getContext("2d")!;
  if (!ctx) throw new Error("Canvas not supported");

  // Background
  ctx.fillStyle = "#0b0b0c";
  ctx.fillRect(0, 0, W, H);

  // Layout constants
  const pad = 48;
  const cardRadius = 28;

  // Header spacing tuned to avoid map collision
  const headerTop = 56;
  const headerTitleY = headerTop + 52;
  const headerSubY = headerTitleY + 52;
  const headerMetaY = headerSubY + 42;

  // Sections
  const mapY = 230;
  const mapH = 610;

  const statsY = mapY + mapH + 24;
  const statsH = 210;

  const notesY = statsY + statsH + 18;
  const notesH = 165;

  const photosY = notesY + notesH + 22;
  const photosH = H - photosY - 56;

  // ===== Header =====
  ctx.fillStyle = "#ffffff";

  ctx.font = "800 46px Arial";
  safeText(ctx, "Walk Recap", pad, headerTitleY);

  ctx.font = "900 54px Arial";
  safeText(ctx, params.dogs || "Dogs", pad, headerSubY);

  ctx.font = "600 28px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  safeText(
    ctx,
    params.createdAtLabel || new Date().toLocaleString(),
    pad,
    headerMetaY,
  );

  // ===== Map card =====
  const mapW = W - pad * 2;

  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, pad, mapY, mapW, mapH, cardRadius);
  ctx.fill();

  const mapUrl = buildStaticMapUrl({
    points: params.routePoints,
    width: 1080,
    height: mapH,
  });

  if (mapUrl) {
    const mapImg = await fetchImageBitmap(mapUrl);
    drawRoundedImage(ctx, mapImg, pad, mapY, mapW, mapH, cardRadius);
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

  // ===== Stats row card (4 columns) =====
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, pad, statsY, mapW, statsH, cardRadius);
  ctx.fill();

  const cols = 4;
  const innerPad = 28;
  const colW = (mapW - innerPad * 2) / cols;

  const statLabelY = statsY + 62;
  const statValueY = statsY + 120;

  function drawStat(
    colIdx: number,
    label: string,
    value: string,
    subValue?: string,
  ) {
    const x = pad + innerPad + colIdx * colW;

    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "800 24px Arial";
    safeText(ctx, label, x, statLabelY);

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 44px Arial";
    safeText(ctx, value, x, statValueY);

    if (subValue) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "700 28px Arial";
      safeText(ctx, subValue, x, statValueY + 40);
    }
  }

  drawStat(0, "Duration", `${params.durationMinutes} min`);
  drawStat(1, "Distance", `${params.distanceMiles.toFixed(2)} mi`);

  const temp = params.weather?.temperatureF;
  const summary = (params.weather?.summary || "").trim();
  drawStat(2, "Weather", temp != null ? `${temp}°F` : "—", summary || "—");

  drawStat(3, "Due", formatMoney(params.amountDue ?? null));

  // ===== Notes card =====
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, pad, notesY, mapW, notesH, cardRadius);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "800 26px Arial";
  safeText(ctx, "Notes", pad + innerPad, notesY + 58);

  ctx.fillStyle = "#ffffff";
  ctx.font = "500 30px Arial";
  const notesText = (params.notes || "").trim();
  wrapText(
    ctx,
    notesText || "—",
    pad + innerPad,
    notesY + 105,
    mapW - innerPad * 2,
    38,
    3,
  );

  // ===== Photos card (3x2 grid, max 6, placeholders) =====
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, pad, photosY, mapW, photosH, cardRadius);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "800 26px Arial";
  safeText(ctx, "Photos", pad + innerPad, photosY + 56);

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

  const rawUrls = (params.photoUrls || []).slice(0, photoCols * photoRows);
  const urls = rawUrls.map((u) => maybeProxyUrl(u));

  const maxSlots = photoCols * photoRows;
  for (let i = 0; i < maxSlots; i++) {
    const r = Math.floor(i / photoCols);
    const c = i % photoCols;
    const x = gridX + c * (cellW + gap);
    const y = gridY + r * (cellH + gap);

    const slotRadius = 22;

    if (i < urls.length && urls[i]) {
      try {
        const img = await fetchImageBitmap(urls[i]);
        drawRoundedImage(ctx, img, x, y, cellW, cellH, slotRadius);
      } catch {
        drawPlaceholderTile(
          ctx,
          x,
          y,
          cellW,
          cellH,
          slotRadius,
          "Image failed",
        );
      }
    } else {
      drawPlaceholderTile(ctx, x, y, cellW, cellH, slotRadius, "");
    }
  }

  // ===== Footer tiny ID =====
  if (params.walkId) {
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "600 20px Arial";
    const txt = `ID: ${params.walkId}`;
    const tw = ctx.measureText(txt).width;
    safeText(ctx, txt, W - pad - tw, H - 26);
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

function drawPlaceholderTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  label: string,
) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();

  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

  if (label) {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "700 22px Arial";
    const tw = ctx.measureText(label).width;
    safeText(ctx, label, x + (w - tw) / 2, y + h / 2);
  }

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
