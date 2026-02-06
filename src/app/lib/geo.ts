export type LatLng = { lat: number; lng: number };

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

// Haversine distance in meters between two points
export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  return 2 * R * Math.asin(Math.sqrt(h));
}

export function routeDistanceMeters(points: LatLng[]): number {
  if (points.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    sum += haversineMeters(points[i - 1], points[i]);
  }
  return sum;
}

export function metersToMiles(m: number): number {
  return m / 1609.344;
}

// Light point thinning so you don’t get 5,000 points from a finger drag.
// Keeps points that are at least minMeters apart.
export function thinPoints(points: LatLng[], minMeters = 3): LatLng[] {
  if (points.length <= 2) return points;
  const out: LatLng[] = [points[0]];
  let last = points[0];
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (haversineMeters(last, p) >= minMeters) {
      out.push(p);
      last = p;
    }
  }
  // Ensure last point included
  if (out[out.length - 1] !== points[points.length - 1]) {
    out.push(points[points.length - 1]);
  }
  return out;
}
