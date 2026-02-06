import { NextResponse } from "next/server";
import { cToF, weatherCodeToSummary } from "../../lib/weather";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  if (!lat || !lng) {
    return NextResponse.json({ error: "Missing lat/lng" }, { status: 400 });
  }

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lng)}` +
    `&current=temperature_2m,weather_code&temperature_unit=celsius`;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) {
    return NextResponse.json(
      { error: "Weather fetch failed" },
      { status: 502 },
    );
  }

  const data = await r.json();
  const tempC = data?.current?.temperature_2m;
  const code = data?.current?.weather_code;

  if (typeof tempC !== "number" || typeof code !== "number") {
    return NextResponse.json(
      { error: "Unexpected weather response" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    temperatureF: Math.round(cToF(tempC)),
    summary: weatherCodeToSummary(code),
  });
}
