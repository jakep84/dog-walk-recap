import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

async function fetchWalk(id: string) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY!;

  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/walks/${id}?key=${apiKey}`;

  const r = await fetch(url, { next: { revalidate: 30 } });
  if (!r.ok) return null;

  const json = await r.json();
  const f = json.fields || {};

  return {
    dogs: f.dogs?.stringValue || "Dog Walk",
    duration: Number(
      f.durationMinutes?.integerValue || f.durationMinutes?.doubleValue || 0,
    ),
    miles: Number(
      f.distanceMiles?.doubleValue || f.distanceMiles?.integerValue || 0,
    ),
    tempF: f.tempF?.integerValue ?? f.tempF?.doubleValue ?? null,
    weather: f.weatherSummary?.stringValue || "",
  };
}

// ✅ Next 16: params is a Promise
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const data = await fetchWalk(id);

  const title = data ? data.dogs : "Dog Walk Recap";
  const line = data
    ? `Duration ${data.duration} min  •  Distance ${data.miles.toFixed(2)} mi` +
      `${data.tempF !== null ? `  •  Temp ${data.tempF}°F` : ""}` +
      `${data.weather ? `  •  ${data.weather}` : ""}`
    : "Walk details";

  return new ImageResponse(
    <div
      style={{
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "60px",
        background: "#0b0b0c",
        color: "white",
        fontSize: 48,
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 64 }}>{title}</div>
      <div style={{ marginTop: 22, opacity: 0.9, fontSize: 42 }}>{line}</div>
      <div style={{ marginTop: 44, opacity: 0.6, fontSize: 32 }}>
        Dog Walk Recap
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
