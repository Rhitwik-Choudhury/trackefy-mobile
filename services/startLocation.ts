import * as Location from 'expo-location';

export function usableStartLocation(gps: Location.LocationObject | null, now = Date.now()): gps is Location.LocationObject {
  if (!gps) return false;
  const age = now - gps.timestamp;
  return age >= 0 && age <= 15000 && gps.coords.accuracy != null && gps.coords.accuracy <= 60
    && Number.isFinite(gps.coords.latitude) && Math.abs(gps.coords.latitude) <= 90
    && Number.isFinite(gps.coords.longitude) && Math.abs(gps.coords.longitude) <= 180;
}
export async function getStartLocation(api = Location, timeoutMs = 20000) {
  let cached: Location.LocationObject | null = null;
  try { cached = await api.getLastKnownPositionAsync({ maxAge: 15000, requiredAccuracy: 60 }); } catch { /* Try fresh GPS. */ }
  if (usableStartLocation(cached)) return cached;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const gps = await Promise.race([
      api.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Location unavailable. Move to an open area and try again.')), timeoutMs); }),
    ]);
    if (!usableStartLocation(gps)) throw new Error('Move to an open area and try again for an accurate location.');
    return gps;
  } finally { if (timer) clearTimeout(timer); }
}
