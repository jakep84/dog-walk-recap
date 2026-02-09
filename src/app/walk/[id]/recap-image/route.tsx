import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";

export const runtime = "edge";

type LatLng = { lat: number; lng: number };

function computeEarned(durationMinutes: number): number {
  // Your rule: $20 per 30 minutes
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return 0;
  const blocks = Math.round(durationMinutes / 30); // 30 => 1, 60 => 2
  return blocks * 20;
}

function buildStaticMapUrl(params: {
  points: LatLng[];
  width: number;
  height: number;
}): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;

  const { points, width, height } = params;
  if (!points || points.length < 2) return null;

  const coords = points.map((p) => [p.lng, p.lat]);

  // Dark line like your old card
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

async function fetchWalk(id: string) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!projectId || !apiKey) return null;

  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/walks/${id}?key=${apiKey}`;

  const r = await fetch(url, { next: { revalidate: 10 } });
  if (!r.ok) return null;

  const json = await r.json();
  const f = json?.fields || {};

  const dogs = f.dogs?.stringValue || "Walk Recap";

  const durationMinutes = Number(
    f.durationMinutes?.integerValue || f.durationMinutes?.doubleValue || 0,
  );

  const distanceMiles = Number(
    f.distanceMiles?.doubleValue || f.distanceMiles?.integerValue || 0,
  );

  const tempF =
    f.tempF?.integerValue != null
      ? Number(f.tempF.integerValue)
      : f.tempF?.doubleValue != null
        ? Number(f.tempF.doubleValue)
        : null;

  const weatherSummary = f.weatherSummary?.stringValue || "";

  const notes = f.notes?.stringValue || "";

  const createdAt = f.createdAt?.timestampValue
    ? new Date(f.createdAt.timestampValue)
    : null;

  const routePoints: LatLng[] =
    f.routePoints?.arrayValue?.values?.map((v: any) => ({
      lat: Number(
        v.mapValue.fields.lat.doubleValue ?? v.mapValue.fields.lat.integerValue,
      ),
      lng: Number(
        v.mapValue.fields.lng.doubleValue ?? v.mapValue.fields.lng.integerValue,
      ),
    })) || [];

  const media =
    f.media?.arrayValue?.values?.map((v: any) => ({
      type: v.mapValue.fields.type.stringValue,
      url: v.mapValue.fields.url.stringValue,
      name: v.mapValue.fields.name?.stringValue || "",
    })) || [];

  const photoUrls = media
    .filter((m: any) => m.type === "image" && typeof m.url === "string")
    .map((m: any) => m.url)
    .slice(0, 6);

  return {
    id,
    dogs,
    durationMinutes,
    distanceMiles,
    tempF,
    weatherSummary,
    notes,
    createdAt,
    routePoints,
    photoUrls,
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const walk = await fetchWalk(id);
  if (!walk) {
    return NextResponse.json({ error: "Walk not found" }, { status: 404 });
  }

  const W = 1080;
  const H = 1920;

  const mapUrl = buildStaticMapUrl({
    points: walk.routePoints,
    width: 1080,
    height: 560,
  });

  const earned = computeEarned(walk.durationMinutes);

  const createdLabel = walk.createdAt ? walk.createdAt.toLocaleString() : "";

  // Layout sizes (matching your old card)
  const pad = 48;
  const headerH = 170;
  const mapH = 560;
  const statsH = 280;
  const gap = 24;

  const mapY = headerH + 10;
  const statsY = mapY + mapH + gap;
  const photosY = statsY + statsH + gap;
  const photosH = H - photosY - pad;

  // photo grid
  const cols = 3;
  const rows = 2;
  const cellGap = 16;
  const gridPad = 22;
  const gridX = pad + gridPad;
  const gridY = photosY + 88;
  const gridW = W - pad * 2 - gridPad * 2;
  const gridH = photosH - 110;
  const cellW = Math.floor((gridW - cellGap * (cols - 1)) / cols);
  const cellH = Math.floor((gridH - cellGap * (rows - 1)) / rows);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#0b0b0c",
        color: "white",
        padding: `${pad}px`,
        fontFamily: "Arial, Helvetica, sans-serif",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div style={{ height: `${headerH}px` }}>
        <div style={{ fontSize: 76, fontWeight: 900, lineHeight: 1 }}>
          Walk Recap
        </div>
        <div style={{ marginTop: 8, fontSize: 44, fontWeight: 800 }}>
          {walk.dogs}
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 28,
            fontWeight: 600,
            color: "rgba(255,255,255,0.7)",
          }}
        >
          {createdLabel}
        </div>
      </div>

      {/* Map */}
      <div
        style={{
          marginTop: 10,
          height: `${mapH}px`,
          borderRadius: 28,
          overflow: "hidden",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {mapUrl ? (
          <img
            src={mapUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              padding: 28,
              fontSize: 32,
              fontWeight: 800,
              color: "rgba(255,255,255,0.75)",
            }}
          >
            Map unavailable (missing token or route)
          </div>
        )}
      </div>

      {/* Stats */}
      <div
        style={{
          marginTop: `${gap}px`,
          height: `${statsH}px`,
          borderRadius: 28,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.06)",
          padding: 28,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", gap: 18 }}>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 26,
                fontWeight: 800,
                color: "rgba(255,255,255,0.65)",
              }}
            >
              Duration
            </div>
            <div style={{ marginTop: 10, fontSize: 52, fontWeight: 900 }}>
              {walk.durationMinutes} min
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 26,
                fontWeight: 800,
                color: "rgba(255,255,255,0.65)",
              }}
            >
              Distance
            </div>
            <div style={{ marginTop: 10, fontSize: 52, fontWeight: 900 }}>
              {walk.distanceMiles.toFixed(2)} mi
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 26,
                fontWeight: 800,
                color: "rgba(255,255,255,0.65)",
              }}
            >
              Weather
            </div>
            <div style={{ marginTop: 10, fontSize: 52, fontWeight: 900 }}>
              {walk.tempF != null ? `${walk.tempF}°F` : "—"}{" "}
              {walk.weatherSummary || ""}
            </div>
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: "rgba(255,255,255,0.65)",
            }}
          >
            Notes
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 30,
              fontWeight: 500,
              color: "white",
            }}
          >
            {(walk.notes || "").trim() || "—"}
          </div>

          {/* ADMIN-only info could go here later.
                For now we keep it off the image if you prefer. */}
          <div
            style={{
              marginTop: 10,
              fontSize: 24,
              fontWeight: 700,
              color: "rgba(255,255,255,0.55)",
            }}
          >
            Earned: ${earned.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Photos */}
      <div
        style={{
          marginTop: `${gap}px`,
          borderRadius: 28,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.06)",
          height: `${photosH}px`,
          padding: 22,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: "rgba(255,255,255,0.7)",
          }}
        >
          Photos
        </div>

        <div
          style={{
            position: "relative",
            flex: 1,
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, ${cellW}px)`,
            gridTemplateRows: `repeat(${rows}, ${cellH}px)`,
            gap: `${cellGap}px`,
            justifyContent: "center",
            alignContent: "start",
            paddingTop: 6,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => {
            const src = walk.photoUrls[i];
            return (
              <div
                key={i}
                style={{
                  width: `${cellW}px`,
                  height: `${cellH}px`,
                  borderRadius: 20,
                  overflow: "hidden",
                  background: "rgba(0,0,0,0.25)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {src ? (
                  <img
                    src={src}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    {
      width: W,
      height: H,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    },
  );
}
