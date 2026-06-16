/**
 * Reverse geocode GPS coordinates using OpenStreetMap Nominatim (free, no API key).
 */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const res = await fetch(url, {
      headers: { "User-Agent": "JISHLink/1.0" },
    });
    const data = await res.json() as { display_name?: string };
    return data.display_name ?? `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }
}
