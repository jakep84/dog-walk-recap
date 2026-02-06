// src/app/walk/[id]/page.tsx
import type { Metadata } from "next";
import WalkPublicClient from "./WalkPublicClient";

type MetaWalk = {
  dogs: string;
  duration: number;
  miles: number;
  tempF: number | null;
  weather: string;
};

async function fetchWalkForMeta(id: string): Promise<MetaWalk | null> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (!projectId || !apiKey) return null;

  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/(default)/documents/walks/${id}?key=${apiKey}`;

  const r = await fetch(url, { next: { revalidate: 30 } });
  if (!r.ok) return null;

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

  return { dogs, duration, miles, tempF, weather };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  const data = await fetchWalkForMeta(id);

  const title = data ? `${data.dogs} — Walk Recap` : "Dog Walk Recap";

  const desc = data
    ? `Duration: ${data.duration} min • Distance: ${data.miles.toFixed(2)} mi` +
      `${data.tempF !== null ? ` • Temp: ${data.tempF}°F` : ""}` +
      `${data.weather ? ` • ${data.weather}` : ""}`
    : "Route, photos, and details from the walk.";

  return {
    title,
    description: desc,
    openGraph: {
      title,
      description: desc,
      url: `/walk/${id}`,
      images: [`/walk/${id}/opengraph-image`],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: [`/walk/${id}/opengraph-image`],
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WalkPublicClient walkId={id} />;
}
