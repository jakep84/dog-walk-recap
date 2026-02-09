import { NextResponse } from "next/server";

export const runtime = "nodejs"; // stream-friendly

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  // Safety: only allow Firebase Storage URLs
  if (!url.startsWith("https://firebasestorage.googleapis.com/")) {
    return NextResponse.json({ error: "Blocked host" }, { status: 403 });
  }

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) {
    return NextResponse.json(
      { error: "Upstream fetch failed", status: r.status },
      { status: 502 },
    );
  }

  const contentType =
    r.headers.get("content-type") || "application/octet-stream";
  const bytes = await r.arrayBuffer();

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      // same-origin response, so canvas fetch works
      "Cache-Control": "public, max-age=3600",
    },
  });
}
