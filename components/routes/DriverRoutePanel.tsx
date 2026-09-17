import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Modal, Alert } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { LiveTrip, decodeRoute, mapCoordinate, routeRequest } from '../../services/routes';
import socket from '../../services/socket';
type Direction = 'TO_SCHOOL' | 'FROM_SCHOOL';
export type StartOptions = { direction: Direction; emergency?: boolean; fallbackReason?: string };
export type EndOptions = { confirmIncomplete?: boolean; reason?: string };
export default function DriverRoutePanel({ active, onStart, onEnd }: { active: boolean; onStart: (options: StartOptions) => Promise<void>; onEnd: (options: EndOptions) => Promise<void> }) {
  const [readiness, setReadiness] = useState<any>(null), [trip, setTrip] = useState<LiveTrip | null>(null), [direction, setDirection] = useState<Direction>('TO_SCHOOL');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [action, setAction] = useState<'skip' | 'end' | 'emergency' | null>(null), [reason, setReason] = useState(''), [now, setNow] = useState(Date.now());
  const [busPoint, setBusPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const displayed = useRef(busPoint), map = useRef<MapView>(null), inFlight = useRef(false);
  useEffect(() => {
    let cancelled = false;
    const load = async () => { if (inFlight.current) return; inFlight.current = true; try { const result = await routeRequest('/driver/active-trip'); if (!cancelled) { setTrip(result.trip); if (!result.trip) setReadiness(await routeRequest('/driver/route-readiness')); setError(''); } } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to refresh route'); } finally { inFlight.current = false; } };
    load(); const poll = setInterval(load, 8000), clock = setInterval(() => setNow(Date.now()), 1000);
    const detail = (value: LiveTrip) => setTrip(value.status === 'active' ? value : null);
    socket.on('trip-detail', detail); socket.on('connect', load); if (!socket.connected) socket.connect();
    return () => { cancelled = true; clearInterval(poll); clearInterval(clock); socket.off('trip-detail', detail); socket.off('connect', load); };
  }, [active]);
  useEffect(() => {
    if (!trip?.currentLocation) return;
    const next = mapCoordinate(trip.currentLocation), start = displayed.current || next, started = Date.now();
    const timer = setInterval(() => { const t = Math.min(1, (Date.now() - started) / 1800); const point = { latitude: start.latitude + (next.latitude - start.latitude) * t, longitude: start.longitude + (next.longitude - start.longitude) * t }; displayed.current = point; setBusPoint(point); if (t === 1) clearInterval(timer); }, 50);
    return () => clearInterval(timer);
  }, [trip?.currentLocation]);
  const preview = readiness?.directions?.[direction];
  const line = useMemo(() => decodeRoute(trip ? trip.remainingPolyline : preview?.routePolyline), [trip, preview]);
  const completed = useMemo(() => decodeRoute(trip?.completedPolyline), [trip?.completedPolyline]);
  const stops = trip?.stops || preview?.stops || [];
  const stale = !!trip && (!trip.lastLocationUpdatedAt || now - Date.parse(trip.lastLocationUpdatedAt) > 30000);
  useEffect(() => { if (line.length > 1 && !trip) map.current?.fitToCoordinates(line, { edgePadding: { top: 40, right: 40, bottom: 40, left: 40 }, animated: true }); }, [line, trip]);
  async function execute(fn: () => Promise<void>) { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Please try again'); } finally { setBusy(false); } }
  async function confirmAction() {
    if (reason.trim().length < 5) { setError('Please enter a reason of at least 5 characters.'); return; }
    const currentAction = action;
    await execute(async () => {
      if (currentAction === 'skip' && trip) { const result = await routeRequest(`/driver/trip/${trip.id}/skip-stop`, { reason, stopIndex: trip.nextStopIndex }); setTrip(result.trip); }
      else if (currentAction === 'end') await onEnd({ confirmIncomplete: true, reason });
      else if (currentAction === 'emergency') await onStart({ direction, emergency: true, fallbackReason: reason });
      setAction(null); setReason('');
    });
  }
  return <View style={styles.card}>
    <Text style={styles.heading}>{trip ? 'Current journey' : 'Choose your journey'}</Text>
    {error && <Text style={styles.warning}>{error}</Text>}
    {!trip && <><View style={styles.row}>{(['TO_SCHOOL', 'FROM_SCHOOL'] as Direction[]).map(d => <TouchableOpacity key={d} accessibilityRole="button" style={[styles.tab, direction === d && styles.selected]} onPress={() => setDirection(d)}><Text style={{ color: direction === d ? '#fff' : '#1d4ed8' }}>{d === 'TO_SCHOOL' ? 'Morning Pickup' : 'Return Drop-off'}</Text></TouchableOpacity>)}</View><Text style={styles.body}>{readiness ? readiness.version ? `Route v${readiness.version} · ${preview?.stopCount || 0} stops` : 'Route not published' : 'Loading route…'}</Text>{readiness?.effectiveFrom && <Text style={styles.small}>Effective {new Date(readiness.effectiveFrom).toLocaleString()}</Text>}{preview?.distanceMeters != null && <Text style={styles.body}>About {(preview.distanceMeters / 1000).toFixed(1)} km · {Math.ceil(preview.durationSeconds / 60)} min</Text>}<Text style={styles.warning}>{readiness?.warning}</Text></>}
    {(line.length > 0 || trip?.currentLocation) && <MapView ref={map} provider="google" style={{ height: 280, width: '100%', marginVertical: 10 }} initialRegion={{ ...(line[0] || busPoint || { latitude: 26.1445, longitude: 91.7362 }), latitudeDelta: 0.04, longitudeDelta: 0.04 }} onMapReady={() => { if (line.length > 1) map.current?.fitToCoordinates(line, { edgePadding: { top: 35, right: 35, bottom: 35, left: 35 }, animated: false }); }}>{completed.length > 0 && <Polyline coordinates={completed} strokeColor="#94a3b8" strokeWidth={4} />}{line.length > 0 && <Polyline coordinates={line} strokeColor="#2563eb" strokeWidth={4} />}{stops.map((stop: any, index: number) => <Marker key={stop.routeStopId || index} coordinate={mapCoordinate(stop.location)} title={`${index + 1}. ${stop.name}`} pinColor={stop.status === 'completed' ? 'gray' : 'red'} />)}{busPoint && trip && <Marker coordinate={busPoint} title="Your bus" pinColor="blue" />}</MapView>}
    {trip && <><Text style={styles.heading}>{trip.nextStop?.name || (trip.direction === 'TO_SCHOOL' ? 'Continue to school' : 'All stops finished')}</Text><Text style={styles.body}>{trip.remainingStopCount} stops remaining · {trip.direction === 'TO_SCHOOL' ? 'Morning pickup' : 'Return drop-off'}</Text>{trip.nextStopEta && !stale && <Text style={styles.body}>{(trip.nextStopEta.distanceMeters / 1000).toFixed(1)} km · about {Math.ceil(trip.nextStopEta.seconds / 60)} min to next stop</Text>}<Text style={styles.body}>{trip.nextStop?.students?.map(student => student.name).join(', ')}</Text>{(trip.offRoute || trip.routeState === 'rerouting') && <Text style={styles.warning}>Recalculating the road route…</Text>}{trip.mode !== 'route' && <Text style={styles.warning}>Live tracking only. Personal arrival estimates are unavailable.</Text>}{stale && <Text style={styles.warning}>No recent location update. Check your connection.</Text>}<Text style={styles.small}>Last successful update: {trip.lastLocationUpdatedAt ? new Date(trip.lastLocationUpdatedAt).toLocaleTimeString() : 'Waiting for GPS'}</Text></>}
    <View style={styles.row}>{trip || active ? <><TouchableOpacity disabled={busy} style={[styles.button, { backgroundColor: '#dc2626' }]} onPress={() => { if (trip?.remainingStopCount) { setReason(''); setAction('end'); } else Alert.alert('End trip?', 'Parents will be notified that this trip has ended.', [{ text: 'Cancel', style: 'cancel' }, { text: 'End Trip', onPress: () => execute(() => onEnd({})) }]); }}><Text style={styles.buttonText}>End Trip</Text></TouchableOpacity>{trip?.nextStop && <TouchableOpacity disabled={busy} style={styles.tab} onPress={() => { setReason(''); setAction('skip'); }}><Text>Skip Stop</Text></TouchableOpacity>}</> : <><TouchableOpacity disabled={busy || !preview?.ready} style={[styles.button, (!preview?.ready || busy) && { opacity: 0.45 }]} onPress={() => execute(() => onStart({ direction }))}><Text style={styles.buttonText}>{busy ? 'Starting…' : direction === 'TO_SCHOOL' ? 'Start Morning Pickup Trip' : 'Start Return Drop-off Trip'}</Text></TouchableOpacity><TouchableOpacity disabled={busy} style={styles.tab} onPress={() => { setReason(''); setAction('emergency'); }}><Text>Emergency: Start live tracking without route</Text></TouchableOpacity></>}</View>
    <Modal visible={action !== null} transparent animationType="fade" onRequestClose={() => setAction(null)}><View style={styles.overlay}><View style={styles.dialog}><Text style={styles.heading}>{action === 'skip' ? 'Skip the next stop?' : action === 'end' ? 'End with stops remaining?' : 'Start without a route?'}</Text><Text style={styles.body}>Stop safely before using these controls. Enter the reason for the school’s trip record.</Text><TextInput accessibilityLabel="Reason" style={styles.input} multiline value={reason} onChangeText={setReason} placeholder="Reason" />{error && <Text style={styles.warning}>{error}</Text>}<View style={styles.row}><TouchableOpacity style={styles.tab} onPress={() => setAction(null)}><Text>Cancel</Text></TouchableOpacity><TouchableOpacity disabled={busy || reason.trim().length < 5} style={styles.button} onPress={confirmAction}><Text style={styles.buttonText}>Confirm</Text></TouchableOpacity></View></View></View></Modal>
  </View>;
}
const styles = StyleSheet.create({ card: { backgroundColor: '#fff', padding: 16, borderRadius: 16, marginTop: 16 }, heading: { fontWeight: '700', fontSize: 19, color: '#183153', marginBottom: 8 }, body: { color: '#475569', fontSize: 14, marginVertical: 5 }, small: { color: '#64748b', fontSize: 12, marginVertical: 5 }, warning: { color: '#9a3412', marginVertical: 6 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 }, tab: { borderColor: '#cbd5e1', borderWidth: 1, padding: 12, borderRadius: 9 }, selected: { backgroundColor: '#2563eb', borderColor: '#2563eb' }, button: { backgroundColor: '#2563eb', borderRadius: 9, padding: 13 }, buttonText: { color: '#fff', fontWeight: '700' }, overlay: { flex: 1, backgroundColor: '#0f172a80', justifyContent: 'center', padding: 20 }, dialog: { borderRadius: 16, backgroundColor: '#fff', padding: 20 }, input: { minHeight: 85, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12 } });
