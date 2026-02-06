import { NextResponse } from "next/server";

export const runtime = "edge"; // optional, works fine on Vercel

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY!;

  if (!projectId || !apiKey) {
    return NextResponse.json(
      { error: "Missing Firebase env vars on server." },
      { status: 500 },
    );
  }

  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/walks/${id}?key=${apiKey}`;

  const r = await fetch(url, { next: { revalidate: 10 } });

  if (!r.ok) {
    const txt = await r.text();
    return NextResponse.json(
      { error: "Firestore fetch failed", status: r.status, body: txt },
      { status: 404 },
    );
  }

  const json = await r.json();
  const f = json.fields || {};

  const walk = {
    id,
    dogs: f.dogs?.stringValue || "",
    durationMinutes: Number(
      f.durationMinutes?.integerValue || f.durationMinutes?.doubleValue || 0,
    ),
    distanceMiles: Number(
      f.distanceMiles?.doubleValue || f.distanceMiles?.integerValue || 0,
    ),
    tempF:
      f.tempF?.integerValue != null
        ? Number(f.tempF.integerValue)
        : f.tempF?.doubleValue != null
          ? Number(f.tempF.doubleValue)
          : null,
    weatherSummary: f.weatherSummary?.stringValue || "",
    notes: f.notes?.stringValue || "",
    routePoints:
      f.routePoints?.arrayValue?.values?.map((v: any) => ({
        lat: Number(v.mapValue.fields.lat.doubleValue),
        lng: Number(v.mapValue.fields.lng.doubleValue),
      })) || [],
    media:
      f.media?.arrayValue?.values?.map((v: any) => ({
        type: v.mapValue.fields.type.stringValue,
        url: v.mapValue.fields.url.stringValue,
        name: v.mapValue.fields.name?.stringValue || "",
      })) || [],
    createdAt: f.createdAt?.timestampValue || null,
  };

  return NextResponse.json(walk);
}
