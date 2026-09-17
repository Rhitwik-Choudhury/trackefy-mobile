import { useEffect, useState } from 'react';
import { Text, View, StyleSheet, TouchableOpacity } from 'react-native';
import { LiveTrip, PickupState, routeRequest } from '../../services/routes';
export default function ParentEtaCard({ trip, pickup, error, connected, onRequest, onRefresh }: { trip: LiveTrip | null; pickup: PickupState | null; error: string; connected: boolean; onRequest: () => void; onRefresh: () => void }) {
  const [now, setNow] = useState(Date.now()), [ackError, setAckError] = useState('');
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const stale = !!trip && (!trip.lastLocationUpdatedAt || now - Date.parse(trip.lastLocationUpdatedAt) > 30000);
  const p = trip?.personal;
  const mins = p?.estimatedArrival ? Math.max(0, Math.ceil((Date.parse(p.estimatedArrival) - now) / 60000)) : null;
  let title = 'Waiting for the trip to start';
  if (trip) title = !p ? 'Live bus tracking' : p.status === 'skipped' ? 'Your stop was skipped' : p.status === 'completed' ? trip.direction === 'TO_SCHOOL' ? 'Child picked up' : 'Drop-off stop completed' : p.status === 'arrived' ? 'Bus has arrived at your stop' : mins !== null && !stale && !trip.offRoute ? `Bus arriving${trip.direction === 'FROM_SCHOOL' ? ' at drop-off' : ''} in ${mins < 1 ? 'less than 1' : mins} min` : 'Arrival estimate updating';
  return <View style={styles.card}>
    <Text style={styles.eyebrow}>{trip ? trip.direction === 'TO_SCHOOL' ? 'MORNING PICKUP' : 'RETURN DROP-OFF' : 'YOUR SCHOOL JOURNEY'}</Text><Text style={styles.title}>{title}</Text>
    {p && !stale && !trip?.offRoute && p.distanceMeters != null && <Text style={styles.body}>{(p.distanceMeters / 1000).toFixed(1)} km away · {p.stopsBeforeYours ?? 0} stops before yours</Text>}
    {p?.status === 'completed' && trip?.direction === 'TO_SCHOOL' && !stale && trip.terminalEta && <Text style={styles.body}>Estimated school arrival: {new Date(trip.terminalEta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>}
    {p?.skipReason && <Text style={styles.warning}>{p.skipReason}</Text>}
    {(stale || !connected || error) && <Text style={styles.warning}>{stale ? 'Location is stale. Waiting for the driver to reconnect.' : error || 'Reconnecting. Periodic updates remain active.'}</Text>}
    {(trip?.offRoute || trip?.routeState === 'rerouting') && <Text style={styles.warning}>Updating the bus route…</Text>}
    {trip?.routeState === 'cached' && <Text style={styles.warning}>Using the last available route. Times may change.</Text>}
    {trip?.lastLocationUpdatedAt && <Text style={styles.small}>Updated {new Date(trip.lastLocationUpdatedAt).toLocaleTimeString()}</Text>}
    <View style={styles.divider} /><Text style={styles.badge}>{pickup?.status || 'Pickup location not set'}</Text>
    {!pickup?.approved && <Text style={styles.body}>Submit a pickup point for school approval to receive a personal ETA and arrival alerts.</Text>}
    {pickup?.approved && <Text style={styles.body}>Approved: {pickup.approved.name}{pickup.approved.formattedAddress ? ` · ${pickup.approved.formattedAddress}` : ''}</Text>}
    {pickup?.approved && !pickup.published && <Text style={styles.warning}>Approved stop is waiting to be included in a published route.</Text>}
    {pickup?.request && ['pending', 'clarification_required'].includes(pickup.request.status) && <Text style={styles.body}>Requested: {pickup.request.formattedAddress || 'Your selected map point'}. Your existing approved stop stays in use.</Text>}
    {pickup?.request?.reviewNote && <Text style={styles.body}>School note: {pickup.request.reviewNote}</Text>}
    {pickup?.request?.submittedBy === 'school' && !pickup.request.acknowledgedAt && <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={async () => { try { await routeRequest(`/parent/pickup-request/${pickup.studentId}/acknowledge`, { requestId: pickup.request?.id }); onRefresh(); } catch { setAckError('Could not acknowledge. Please retry.'); } }}><Text style={styles.buttonText}>Acknowledge school location</Text></TouchableOpacity>}
    {ackError && <Text style={styles.warning}>{ackError}</Text>}<TouchableOpacity accessibilityRole="button" style={styles.button} onPress={onRequest}><Text style={styles.buttonText}>{pickup?.approved ? 'Request a pickup location change' : 'Set pickup location'}</Text></TouchableOpacity>
  </View>;
}
const styles = StyleSheet.create({ card: { padding: 18, borderRadius: 16, backgroundColor: '#fff', marginBottom: 14, borderColor: '#dbeafe', borderWidth: 1 }, eyebrow: { fontSize: 11, fontWeight: '700', color: '#2563eb', letterSpacing: 1 }, title: { fontSize: 23, fontWeight: '700', color: '#183153', marginVertical: 8 }, body: { fontSize: 14, color: '#475569', marginBottom: 7 }, warning: { fontSize: 13, color: '#9a3412', marginVertical: 5 }, small: { fontSize: 11, color: '#64748b', marginTop: 6 }, divider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 12 }, badge: { fontWeight: '700', color: '#1d4ed8', marginBottom: 8 }, button: { padding: 10, borderRadius: 8, backgroundColor: '#eff6ff', marginTop: 6 }, buttonText: { color: '#1d4ed8', fontWeight: '600' } });
