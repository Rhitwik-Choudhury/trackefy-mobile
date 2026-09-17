import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL } from '../constants/api';
export type Coordinate = { lat: number; lng: number };
export type Stop = { routeStopId: string; name: string; location: Coordinate; status: string; students: { id: string; name: string }[]; skipReason?: string };
export type LiveTrip = { id: string; busId: string; studentId?: string; status: string; direction: 'TO_SCHOOL' | 'FROM_SCHOOL'; mode: string; routePlanVersion?: number; currentLocation?: Coordinate; schoolLocation?: Coordinate; lastLocationUpdatedAt?: string; routeState: string; offRoute?: boolean; stale?: boolean; remainingPolyline?: string; completedPolyline?: string; plannedPolyline?: string; totalStopCount: number; remainingStopCount: number; nextStopIndex?: number; nextStop?: Stop; nextStopEta?: { seconds: number; distanceMeters: number }; stops?: Stop[]; terminalEta?: string; personal?: { approvedStop: { name: string; location: Coordinate }; status: string; estimatedArrival?: string; distanceMeters?: number; stopsBeforeYours?: number; skipReason?: string } | null };
export type PickupState = { studentId: string; status: string; published: boolean; approved?: { id: string; name: string; location: Coordinate; formattedAddress?: string } | null; request?: { id: string; status: string; requestedLocation: Coordinate; formattedAddress?: string; reviewNote?: string; submittedBy: string; acknowledgedAt?: string } | null };
export async function routeRequest<T = any>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const token = await AsyncStorage.getItem('token');
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`${BASE_URL}${path}`, { method, signal: controller.signal, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Please try again.'); return result;
  } finally { clearTimeout(timer); }
}
export function decodeRoute(encoded = '') {
  let i = 0, lat = 0, lng = 0; const points: { latitude: number; longitude: number }[] = [];
  const read = () => { let shift = 0, value = 0, byte; do { if (i >= encoded.length || shift > 30) throw new Error('Invalid route'); byte = encoded.charCodeAt(i++) - 63; value |= (byte & 31) << shift; shift += 5; } while (byte >= 32); return value & 1 ? ~(value >> 1) : value >> 1; };
  try { while (i < encoded.length) { lat += read(); lng += read(); points.push({ latitude: lat / 1e5, longitude: lng / 1e5 }); } } catch { return []; }
  return points;
}
export const mapCoordinate = (point: Coordinate) => ({ latitude: point.lat, longitude: point.lng });
