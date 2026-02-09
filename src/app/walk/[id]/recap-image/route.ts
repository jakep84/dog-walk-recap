import { ImageResponse } from "next/og";

export const runtime = "edge";

type FirestoreFields = Record<string, any>;

function numField(f: any): number {
  if (!f) return 0;
  const v = f.doubleValue ?? f.integerValue ?? f.stringValue ?? 0;
  return Number(v) || 0;
}

function strField(f: any): string {
  if (!f) return "";
  return String(f.stringValue ?? f.integerValue ?? f.doubleValue ?? "");
}

function parseRoutePoints(fields: FirestoreFields): { lat: number; lng: number }[] {
  // routePoints stored as an array of objects {lat,lng}
  const arr = fields.routePoints?.arrayValue?.values;
  if (!Array.isArray(arr)) return [];
  const pts: { lat: number; lng: number }[] = [];
  for (const item of arr) {
    const m = item?.mapValue?.fields;
    if (!m) continue;
    const lat = numField(m.lat);
    const lng = numField(m.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) pts.push({ lat, lng });
  }
  return pts;
}

function parseMedia(fields: FirestoreFields): { url: string; type: string }[] {
  const arr = fields.media?.arrayValue?.values;
  if (!Array.isArray(arr)) return [];
  const out: { url: string; type: string }[] = [];
  for (const item of arr) {
    const m = item?.mapValue?.fields;
    const url = strField(m?.url);
    const type = strField(m?.type) || "image";
    if (url) out.push({ url, type });
  }
  return out;
}

// Simple “route thumbnail”: project lat/lng into a box and draw an SVG polyline
function routeSvg(points: { lat: number; lng: number }[], w: number, h: number) {
  if (!points || points.length < 2) return null;

  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }

  const pad = 10;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  const lngSpan = Math.max(1e-9, maxLng - minLng);
  const latSpan = Math.max(1e-9, maxLat - minLat);

  const pts = points.map((p) => {
    const x = pad + ((p.lng - minLng) / lngSpan) * innerW;
    // invert Y so north is up
    const y = pad + (1 - (p.lat - minLat) / latSpan) * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  // If the route is super “flat” (all same lat/lng), it’ll look like a dot
  // still fine for MVP

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <rect x="0" y="0" width={w} height={h} rx="16" fill="rgba(255,255,255,0.06)" />
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="white"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.95"
      />
      {/* start/end dots */}
      <circle cx={Number(pts[0].split(",")[0])} cy={Number(pts[0].split(",")[1])} r="7" fill="white" opacity="0.9" />
      <circle
        cx={Number(pts[pts.length - 1].split(",")[0])}
        cy={Number(pts[pts.length - 1].split(",")[1])}
        r="7"
        fill="white"
        opacity="0.9"
      />
    </svg>
  );
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> } // ✅ Next 16 expects params as Promise in route handlers
) {
  const { id } = await context.params;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY!;

  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/walks/${id}?key=${apiKey}`;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) {
    return new ImageResponse(
      <div style={{ width: "1200px", height: "630px", background: "#0b0b0c", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48, fontWeight: 900 }}>
        Walk not found
      </div>,
      { width: 1200, height: 630 }
    );
  }

  const json = await r.json();
  const f: FirestoreFields = json.fields || {};

  const dogs = strField(f.dogs) || "Dog Walk";
  const duration = numField(f.durationMinutes);
  const miles = numField(f.distanceMiles);
  const tempF = f.tempF ? numField(f.tempF) : null;
  const weather = strField(f.weatherSummary);

  const points = parseRoutePoints(f);
  const media = parseMedia(f).slice(0, 3); // collage up to 3

  const mapW = 560;
  const mapH = 360;

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "#0b0b0c",
          color: "white",
          padding: 36,
          display: "flex",
          flexDirection: "column",
          gap: 18,
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 46, fontWeight: 900, letterSpacing: -1 }}>{dogs}</div>
            <div style={{ opacity: 0.7, fontSize: 22 }}>Dog Walk Recap</div>
          </div>
          <div style={{ opacity: 0.65, fontSize: 18 }}>smartWalk</div>
        </div>

        {/* Body row */}
        <div style={{ display: "flex", gap: 18, flex: 1 }}>
          {/* Left: stats + route */}
          <div style={{ width: 600, display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Stats block */}
            <div style={{ display: "flex", gap: 12 }}>
              {[
                { k: "Duration", v: `${Math.round(duration)} min` },
                { k: "Distance", v: `${miles.toFixed(2)} mi` },
                { k: "Temp", v: tempF === null ? "—" : `${Math.round(tempF)}°F` },
                { k: "Weather", v: weather || "—" },
              ].map((x) => (
                <div
                  key={x.k}
                  style={{
                    flex: x.k === "Weather" ? 2 : 1,
                    padding: "14px 16px",
                    borderRadius: 16,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }}
                >
                  <div style={{ fontSize: 16, opacity: 0.7, fontWeight: 800 }}>{x.k}</div>
                  <div style={{ fontSize: 24, fontWeight: 900 }}>{x.v}</div>
                </div>
              ))}
            </div>

            {/* Route box */}
            <div
              style={{
                flex: 1,
                padding: 14,
                borderRadius: 18,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.10)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 900 }}>Route</div>
              <div style={{ width: mapW, height: mapH }}>
                {routeSvg(points, mapW, mapH) ?? (
                  <div style={{ width: mapW, height: mapH, borderRadius: 16, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.7 }}>
                    No route recorded
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: collage */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 20, fontWeight: 900 }}>Photos & Videos</div>

            <div style={{ display: "flex", gap: 12, flex: 1 }}>
              {media.length === 0 ? (
                <div
                  style={{
                    flex: 1,
                    borderRadius: 18,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: 0.7,
                    fontSize: 22,
                    fontWeight: 800,
                  }}
                >
                  No media uploaded
                </div>
              ) : (
                media.map((m, idx) => (
                  <div
                    key={m.url + idx}
                    style={{
                      flex: 1,
                      borderRadius: 18,
                      overflow: "hidden",
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.06)",
                      display: "flex",
                    }}
                  >
                    {/* For videos we still show the thumbnail frame if the URL is an image; otherwise we just show “VIDEO” */}
                    {m.type === "video" ? (
                      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, opacity: 0.85 }}>
                        VIDEO
                      </div>
                    ) : (
                      // next/og supports external images
                      <img src={m.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
