"use client";

import "leaflet/dist/leaflet.css";
import React, { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Polyline } from "react-leaflet";
import * as L from "leaflet";

type LatLng = { lat: number; lng: number };
type LatLngTuple = [number, number];

export default function WalkViewerMap({ points }: { points: LatLng[] }) {
  const hasRoute = Array.isArray(points) && points.length >= 2;

  const center: LatLngTuple = useMemo(() => {
    if (!points || points.length === 0) return [38.9, -77.0];
    return [points[0].lat, points[0].lng];
  }, [points]);

  const poly: LatLngTuple[] = useMemo(() => {
    return (points || []).map((p) => [p.lat, p.lng]);
  }, [points]);

  useEffect(() => {
    // @ts-ignore - Leaflet internal private field
    delete (L.Icon.Default.prototype as any)._getIconUrl;

    L.Icon.Default.mergeOptions({
      iconRetinaUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  if (!hasRoute) return <div style={{ opacity: 0.7 }}>No route recorded.</div>;

  return (
    <div style={{ height: 360, width: "100%", borderRadius: 12, overflow: "hidden" }}>
      <MapContainer center={center} zoom={15} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={poly as any} />
      </MapContainer>
    </div>
  );
}
