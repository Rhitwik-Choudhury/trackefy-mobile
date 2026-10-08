import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { View, Image, Dimensions, Text, TouchableOpacity, TextInput, StyleSheet, Modal, Alert } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { LiveTrip, decodeRoute, mapCoordinate, routeRequest } from '../../services/routes';
import socket from '../../services/socket';
import { cancelDriverReminder } from '../../services/driver-reminders';
const MAP_HEIGHT = Math.min(360, Math.max(260, Dimensions.get('window').height * 0.35));
type Direction = 'TO_SCHOOL' | 'FROM_SCHOOL';
export type StartOptions = { direction: Direction; emergency?: boolean; fallbackReason?: string };
export type EndOptions = { confirmIncomplete?: boolean; reason?: string };
export default function DriverRoutePanel({ active, onStart, onEnd }: { active: boolean; onStart: (options: StartOptions) => Promise<void>; onEnd: (options: EndOptions) => Promise<void> }) {
  const [readiness, setReadiness] = useState<any>(null), [trip, setTrip] = useState<LiveTrip | null>(null), [direction, setDirection] = useState<Direction>('TO_SCHOOL');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [action, setAction] = useState<'skip' | 'emergency' | null>(null), [reason, setReason] = useState(''), [now, setNow] = useState(Date.now());
  const [busPoint, setBusPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const displayed = useRef(busPoint), map = useRef<MapView>(null), inFlight = useRef(false);
  const latestTrip = useRef<LiveTrip | null>(null);
  const centeredTrip = useRef('');
  const actionInFlight = useRef(false), confirmationOpen = useRef(false);
  const [showStops, setShowStops] = useState(false);
  const applyTrip = useCallback((incoming: LiveTrip | null, requestedAt = Infinity) => {
    const previous = latestTrip.current;
    if (incoming && previous && incoming.id === previous.id && previous.status !== 'active' && incoming.status === 'active') return;
    if (incoming && previous && incoming.id === previous.id && (incoming.revision || 0) < (previous.revision || 0)) return;
    if (incoming && previous && incoming.id !== previous.id && Date.parse(incoming.startedAt || '') < Date.parse(previous.startedAt || '')) return;
    if (!incoming && previous?.status === 'active' && Date.parse(previous.updatedAt || '') > requestedAt) return;
    if (incoming) latestTrip.current = incoming;
    else if (previous) latestTrip.current = { ...previous, status: 'completed' };
    setTrip(incoming?.status === 'active' ? incoming : null);
  }, []);
  useEffect(() => {
    let cancelled = false;
    const load = async () => { if (inFlight.current) return; inFlight.current = true; try { const requestedAt = Date.now(); const result = await routeRequest('/driver/active-trip'); if (!cancelled) { applyTrip(result.trip, requestedAt); if (!result.trip) setReadiness(await routeRequest('/driver/route-readiness')); setError(''); } } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to refresh route'); } finally { inFlight.current = false; } };
    load(); const poll = setInterval(load, 8000), clock = setInterval(() => setNow(Date.now()), 1000);
    const detail = (value: LiveTrip) => applyTrip(value);
    socket.on('trip-detail', detail); socket.on('connect', load); if (!socket.connected) socket.connect();
    return () => { cancelled = true; clearInterval(poll); clearInterval(clock); socket.off('trip-detail', detail); socket.off('connect', load); };
  }, [active, applyTrip]);
  useEffect(() => {
    if (!trip?.currentLocation) return;
    const next = mapCoordinate(trip.currentLocation), start = displayed.current || next, started = Date.now();
    const timer = setInterval(() => { const t = Math.min(1, (Date.now() - started) / 1800); const point = { latitude: start.latitude + (next.latitude - start.latitude) * t, longitude: start.longitude + (next.longitude - start.longitude) * t }; displayed.current = point; setBusPoint(point); if (t === 1) clearInterval(timer); }, 50);
    return () => clearInterval(timer);
  }, [trip?.currentLocation]);
  const reminder = trip?.finishReminder;
  const snoozed = !!reminder?.snoozedUntil && Date.parse(reminder.snoozedUntil) > now;
  useEffect(() => { if (!reminder || snoozed) cancelDriverReminder().catch(() => {}); }, [reminder, snoozed]);
  const preview = readiness?.directions?.[direction];
  const line = useMemo(() => decodeRoute(trip ? trip.remainingPolyline : preview?.routePolyline), [trip, preview]);
  const completed = useMemo(() => decodeRoute(trip?.completedPolyline), [trip?.completedPolyline]);
  const stops = trip?.stops || preview?.stops || [];
  const stale = !!trip && (!trip.lastLocationUpdatedAt || now - Date.parse(trip.lastLocationUpdatedAt) > 30000);
  useEffect(() => { if (line.length > 1 && !trip) map.current?.fitToCoordinates(line, { edgePadding: { top: 40, right: 40, bottom: 40, left: 40 }, animated: true }); }, [line, trip]);
  useEffect(() => {
    if (!trip || centeredTrip.current === trip.id || !map.current) return;
    if (line.length > 1) map.current.fitToCoordinates(line, { edgePadding: { top: 40, right: 40, bottom: 40, left: 40 }, animated: true });
    else if (busPoint) map.current.animateToRegion({ ...busPoint, latitudeDelta: 0.02, longitudeDelta: 0.02 });
    else return;
    centeredTrip.current = trip.id;
  }, [trip?.id, line, busPoint]);
  async function execute(fn: () => Promise<void>) { if (actionInFlight.current) return; actionInFlight.current = true; setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Please try again'); } finally { actionInFlight.current = false; setBusy(false); } }
  async function confirmAction() {
    if (reason.trim().length < 5) { setError('Please enter a reason of at least 5 characters.'); return; }
    const currentAction = action;
    await execute(async () => {
      if (currentAction === 'skip' && trip) { const result = await routeRequest(`/driver/trip/${trip.id}/skip-stop`, { reason, stopIndex: trip.nextStopIndex }); applyTrip(result.trip); }
      else if (currentAction === 'emergency') await onStart({ direction, emergency: true, fallbackReason: reason });
      setAction(null); setReason('');
    });
  }
  function requestEnd() {
    if (busy || confirmationOpen.current) return;
    confirmationOpen.current = true;
    const remaining = trip?.remainingStopCount || 0;
    const prompt = remaining
      ? `End this trip now? ${remaining} ${remaining === 1 ? 'stop remains.' : 'stops remain.'}`
      : 'End this trip now?';
    Alert.alert(prompt, '', [
      { text: 'Cancel', style: 'cancel', onPress: () => { confirmationOpen.current = false; } },
      { text: 'End Trip', style: 'destructive', onPress: () => { confirmationOpen.current = false; execute(() => onEnd({ confirmIncomplete: remaining > 0 })); } },
    ], { cancelable: true, onDismiss: () => { confirmationOpen.current = false; } });
  }
  return <View style={styles.card}>
    {!trip && <Text style={styles.heading}>{active ? 'Loading current trip…' : 'Choose your journey'}</Text>}
    {error && <Text style={styles.warning}>{error}</Text>}
    {trip && reminder && <View style={{ backgroundColor: '#fff7ed', padding: 12, borderRadius: 10 }}><Text style={styles.heading}>Trip is still active</Text><Text style={styles.body}>{reminder.message}</Text>{snoozed ? <Text style={styles.small}>Reminder snoozed until {new Date(reminder.snoozedUntil!).toLocaleTimeString()}</Text> : <TouchableOpacity disabled={busy} style={styles.tab} onPress={() => execute(async () => { const result = await routeRequest('/driver/trip/' + trip.id + '/snooze-reminder', {}); applyTrip(result.trip); await cancelDriverReminder(); })}><Text>Remind me in 5 minutes</Text></TouchableOpacity>}</View>}
    {!trip && !active && <><View style={styles.row}>{(['TO_SCHOOL', 'FROM_SCHOOL'] as Direction[]).map(d => <TouchableOpacity key={d} accessibilityRole="button" style={[styles.tab, direction === d && styles.selected]} onPress={() => setDirection(d)}><Text style={{ color: direction === d ? '#fff' : '#1d4ed8' }}>{d === 'TO_SCHOOL' ? 'Morning Pickup' : 'Return Drop-off'}</Text></TouchableOpacity>)}</View><Text style={styles.body}>{readiness ? readiness.version ? `Route v${readiness.version} · ${preview?.stopCount || 0} stops` : 'Route not published' : 'Loading route…'}</Text>{preview?.distanceMeters != null && <Text style={styles.body}>About {(preview.distanceMeters / 1000).toFixed(1)} km · {Math.ceil(preview.durationSeconds / 60)} min</Text>}{readiness?.publishedAt && <Text style={styles.small}>Published {new Date(readiness.publishedAt).toLocaleString()}</Text>}<Text style={styles.previewNote}>{readiness?.warning}</Text></>}
    {trip && <View style={styles.tripSummary}>
      <Text style={styles.summaryEyebrow}>Next Stop</Text>
      <Text style={styles.nextStopTitle}>{trip.nextStop?.name || (trip.direction === 'TO_SCHOOL' ? 'Continue to school' : 'All stops finished')}</Text>
      <Text style={styles.body}>{trip.remainingStopCount} stops remaining · {trip.direction === 'TO_SCHOOL' ? 'Morning pickup' : 'Return drop-off'}</Text>
      {trip.nextStopEta && !stale && <Text style={styles.body}>{(trip.nextStopEta.distanceMeters / 1000).toFixed(1)} km · about {Math.ceil(trip.nextStopEta.seconds / 60)} min to next stop</Text>}
      {!!trip.nextStop?.students?.length && <Text style={styles.small}>Students: {trip.nextStop.students.map(student => student.name).join(', ')}</Text>}
      {(trip.offRoute || trip.routeState === 'rerouting') && <Text style={styles.warning}>Recalculating the road route…</Text>}
      {trip.mode !== 'route' && <Text style={styles.warning}>Live tracking only. Personal arrival estimates are unavailable.</Text>}
      {stale && <Text style={styles.warning}>No recent location update. Check your connection.</Text>}
      <Text style={styles.small}>Last update: {trip.lastLocationUpdatedAt ? new Date(trip.lastLocationUpdatedAt).toLocaleTimeString() : 'Waiting for GPS'}</Text>
    </View>}
    <View style={styles.mapWrap}><MapView ref={map} provider="google" style={{ height: MAP_HEIGHT, width: '100%' }} initialRegion={{ ...(line[0] || busPoint || { latitude: 26.1445, longitude: 91.7362 }), latitudeDelta: 0.04, longitudeDelta: 0.04 }} onMapReady={() => { if (line.length > 1) map.current?.fitToCoordinates(line, { edgePadding: { top: 35, right: 35, bottom: 35, left: 35 }, animated: false }); }}>{completed.length > 0 && <Polyline coordinates={completed} strokeColor="#94a3b8" strokeWidth={4} />}{line.length > 0 && <Polyline coordinates={line} strokeColor="#2563eb" strokeWidth={4} />}{stops.map((stop: any, index: number) => <Marker key={stop.routeStopId || index} coordinate={mapCoordinate(stop.location)} title={`${index + 1}. ${stop.name}`} pinColor={stop.status === 'completed' ? '#00ab5b' : stop.status === 'skipped' ? '#f59e0b' : 'red'} />)}{(trip?.schoolLocation || readiness?.schoolLocation) && <Marker coordinate={mapCoordinate(trip?.schoolLocation || readiness.schoolLocation)} title="School" pinColor="#1683f7" />}{busPoint && trip && <Marker coordinate={busPoint} title="Your bus" anchor={{ x: 0.5, y: 0.5 }}><Image source={require('../../assets/bus.png')} style={{ width: 36, height: 36 }} resizeMode="contain" /></Marker>}</MapView><TouchableOpacity accessibilityLabel="Recenter route map" style={styles.recenter} onPress={() => { if (line.length > 1) map.current?.fitToCoordinates(line, { edgePadding: { top: 40, right: 40, bottom: 40, left: 40 }, animated: true }); else if (busPoint) map.current?.animateToRegion({ ...busPoint, latitudeDelta: 0.02, longitudeDelta: 0.02 }); }}><Ionicons name="locate-outline" size={23} color="#172554" /></TouchableOpacity></View>
    {trip?.nextStop?.autoSkipAt && <Text style={styles.warning}>Bus appears to have passed this stop. Automatic skip is pending GPS confirmation.</Text>}
    <View style={styles.actions}>{trip || active ? <><TouchableOpacity disabled={busy || !trip} style={[styles.button, styles.tripActionButton, { backgroundColor: '#dc2626' }]} onPress={requestEnd}><Ionicons name="stop-circle-outline" size={19} color="#fff" /><Text style={styles.buttonText}>{busy ? "Ending…" : "End Trip"}</Text></TouchableOpacity>{trip?.nextStop && <TouchableOpacity disabled={busy} style={styles.secondaryAction} onPress={() => { setReason(''); setAction('skip'); }}><Ionicons name="play-skip-forward" size={18} color="#172554" /><Text style={styles.secondaryText}>Skip Stop</Text></TouchableOpacity>}</> : <><TouchableOpacity disabled={busy || !preview?.ready} style={[styles.button, styles.tripActionButton, (!preview?.ready || busy) && { opacity: 0.45 }]} onPress={() => execute(() => onStart({ direction }))}><Ionicons name="play" size={18} color="#fff" /><Text style={styles.buttonText}>{busy ? 'Starting…' : direction === 'TO_SCHOOL' ? 'Start Morning Pickup Trip' : 'Start Return Drop-off Trip'}</Text></TouchableOpacity><TouchableOpacity disabled={busy} style={styles.secondaryAction} onPress={() => { setReason(''); setAction('emergency'); }}><Ionicons name="warning-outline" size={16} color="#b45309" /><Text style={styles.secondaryText}>Emergency: Start live tracking without route</Text></TouchableOpacity></>}</View>
    {!!stops.length && <><TouchableOpacity style={styles.stopToggle} onPress={() => setShowStops(!showStops)}><Text style={styles.small}>{showStops ? 'Hide' : 'View'} all {stops.length} stops</Text><Ionicons name={showStops ? 'chevron-up' : 'chevron-down'} size={17} color="#64748b" /></TouchableOpacity>{showStops && stops.map((stop: any, i: number) => <View key={stop.routeStopId || i} style={styles.stopRow}><Ionicons name={stop.status === 'completed' ? 'checkmark-circle' : 'location'} size={19} color={stop.status === 'completed' ? '#00ab5b' : stop.status === 'skipped' ? '#f59e0b' : '#087cf0'} /><Text style={{ flex: 1, color: '#172554' }}>{i + 1}. {stop.name}</Text><Text style={styles.small}>{stop.status || 'Planned'}</Text></View>)}</>}
    <Modal visible={action !== null} transparent animationType="fade" onRequestClose={() => setAction(null)}><View style={styles.overlay}><View style={styles.dialog}><Text style={styles.heading}>{action === 'skip' ? 'Skip the next stop?' : 'Start without a route?'}</Text><Text style={styles.body}>Stop safely before using these controls. Enter a reason for the trip record.</Text><TextInput accessibilityLabel="Reason" style={styles.input} multiline value={reason} onChangeText={setReason} placeholder="Reason" />{error && <Text style={styles.warning}>{error}</Text>}<View style={styles.row}><TouchableOpacity style={styles.tab} onPress={() => setAction(null)}><Text>Cancel</Text></TouchableOpacity><TouchableOpacity disabled={busy || reason.trim().length < 5} style={styles.button} onPress={confirmAction}><Text style={styles.buttonText}>Confirm</Text></TouchableOpacity></View></View></View></Modal>
  </View>;
}
const styles = StyleSheet.create({ mapWrap: { marginVertical: 10, borderRadius: 12, overflow: 'hidden' }, recenter: { position: 'absolute', bottom: 12, right: 12, padding: 9, borderRadius: 22, backgroundColor: '#fff', elevation: 3 }, actions: { gap: 8 }, secondaryAction: { width: '100%', minHeight: 46, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', padding: 10, borderRadius: 9 }, secondaryText: { color: '#172554', fontSize: 12, fontWeight: '600' }, previewNote: { color: '#b45309', fontSize: 11, padding: 8, backgroundColor: '#fff7ed', borderRadius: 8, marginTop: 6 }, stopToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }, stopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }, card: { backgroundColor: '#fff', padding: 12, borderRadius: 14, marginTop: 0 }, heading: { fontWeight: '700', fontSize: 15, color: '#172554', marginBottom: 8 }, body: { color: '#64748b', fontSize: 12, marginVertical: 3 }, small: { color: '#64748b', fontSize: 12, marginVertical: 5 }, warning: { color: '#9a3412', marginVertical: 6 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 }, tab: { borderColor: '#cbd5e1', borderWidth: 1, padding: 12, borderRadius: 9 }, selected: { backgroundColor: '#2563eb', borderColor: '#2563eb' }, button: { backgroundColor: '#2563eb', borderRadius: 9, padding: 13 }, tripActionButton: { width: '100%', minHeight: 52, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 }, buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 }, tripSummary: { backgroundColor: '#f8fafc', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginTop: 8 }, summaryEyebrow: { color: '#2563eb', fontSize: 11, fontWeight: '700', letterSpacing: 0 }, nextStopTitle: { fontWeight: '700', fontSize: 17, color: '#172554', marginTop: 4 }, overlay: { flex: 1, backgroundColor: '#0f172a80', justifyContent: 'center', padding: 20 }, dialog: { borderRadius: 16, backgroundColor: '#fff', padding: 20 }, input: { minHeight: 85, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 12 } });
