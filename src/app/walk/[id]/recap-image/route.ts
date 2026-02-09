// src/app/walk/[id]/recap-image/route.tsx
import { ImageResponse } from "next/og";

export const runtime = "edge";

type LatLng = { lat: number; lng: number };

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  // Basic guard — still returns an image (not JSON) so previews don't break
  if (!projectId || !apiKey) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "#0b0b0c",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 42,
            fontWeight: 800,
          }}
        >
          Missing Firebase env vars
        </div>
      ),
      { width: 1200, height: 630 },
    );
  }

  // Fetch walk from Firestore REST (public GET only)
  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/walks/${id}?key=${apiKey}`;

  const r = await fetch(url, { next: { revalidate: 30 } });

  // If not found / unauthorized, still return an image (no ugly auth page)
  if (!r.ok) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: "#0b0b0c",
            color: "white",
            display: "flex",
            flexDirection: "column",
            padding: 64,
            gap: 18,
            justifyContent: "center",
          }}
        >
          <div style={{ fontSize: 56, fontWeight: 900 }}>Walk Recap</div>
          <div style={{ fontSize: 28, opacity: 0.8 }}>
            This walk isn’t publicly readable (rules/auth).
          </div>
          <div style={{ fontSize: 22, opacity: 0.7 }}>Walk ID: {id}</div>
        </div>
      ),
      { width: 1200, height: 630 },
    );
  }

  const json = await r.json();
  const f = json?.fields || {};

  const dogs = f.dogs?.stringValue || "Dog Walk";
  const duration = Number(
    f.durationMinutes?.integerValue || f.durationMinutes?.doubleValue || 0,
  );
  const miles = Number(
    f.distanceMiles?.doubleValue || f.distanceMiles?.integerValue || 0,
  );

  const tempF =
    f.tempF?.integerValue != null
      ? Number(f.tempF.integerValue)
      : f.tempF?.doubleValue != null
        ? Number(f.tempF.doubleValue)
        : null;

  const weather = f.weatherSummary?.stringValue || "";
  const amountDue =
    f.amountDue?.doubleValue != null
      ? Number(f.amountDue.doubleValue)
      : f.amountDue?.integerValue != null
        ? Number(f.amountDue.integerValue)
        : null;

  // Optional: read first 3 media thumbnails (images only)
  const media: Array<{ url: string; type: string }> =
    f.media?.arrayValue?.values?.map((v: any) => ({
      type: v?.mapValue?.fields?.type?.stringValue || "",
      url: v?.mapValue?.fields?.url?.stringValue || "",
    })) || [];

  const imageUrls = media.filter((m) => m.type === "image" && m.url).slice(0, 3);

  const sub =
    `Duration: ${duration} min • Distance: ${miles.toFixed(2)} mi` +
    `${tempF != null ? ` • Temp: ${tempF}°F` : ""}` +
    `${weather ? ` • ${weather}` : ""}` +
    `${amountDue != null ? ` • Due: $${amountDue.toFixed(2)}` : ""}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0b0b0c",
          color: "white",
          display: "flex",
          padding: 56,
          gap: 34,
        }}
      >
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1 }}>
            Walk Recap
          </div>
          <div style={{ fontSize: 44, fontWeight: 800 }}>{dogs}</div>
          <div style={{ fontSize: 26, opacity: 0.8 }}>{sub}</div>

          <div
            style={{
              marginTop: 20,
              display: "flex",
              gap: 12,
              opacity: 0.65,
              fontSize: 20,
            }}
          >
            ID: {id}
          </div>
        </div>

        <div style={{ width: 520, display: "flex", flexDirection: "column", gap: 14 }}>
          {imageUrls.length === 0 ? (
            <div
              style={{
                width: "100%",
                height: "100%",
                borderRadius: 24,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.10)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                opacity: 0.8,
              }}
            >
              No photos
            </div>
          ) : (
            imageUrls.map((img, idx) => (
              <img
                key={idx}
                src={img.url}
                alt=""
                style={{
                  width: "100%",
                  height: 170,
                  objectFit: "cover",
                  borderRadius: 24,
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
              />
            ))
          )}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
