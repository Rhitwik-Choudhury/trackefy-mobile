import { useEffect, useState } from 'react';
import { Text, View, StyleSheet, TouchableOpacity } from 'react-native';
import { LiveTrip, PickupState, routeRequest } from '../../services/routes';

type Props = {
  trip: LiveTrip | null;
  pickup: PickupState | null;
  error: string;
  connected: boolean;
  onRequest: () => void;
  onRefresh: () => void;
};

export default function ParentEtaCard({ trip, pickup, error, connected, onRequest, onRefresh }: Props) {
  const [now, setNow] = useState(Date.now()), [ackError, setAckError] = useState('');
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const stale = !!trip && (!trip.lastLocationUpdatedAt || now - Date.parse(trip.lastLocationUpdatedAt) > 30000);
  const personal = trip?.personal;
  const minutes = personal?.estimatedArrival ? Math.max(0, Math.ceil((Date.parse(personal.estimatedArrival) - now) / 60000)) : null;
  const skipped = personal?.status === 'skipped';
  let title = 'Waiting for the trip to start';
  if (trip) {
    if (!personal) title = 'Live bus tracking';
    else if (skipped) title = 'Your stop was skipped';
    else if (personal.status === 'completed') title = trip.direction === 'TO_SCHOOL' ? 'Child picked up' : 'Drop-off stop completed';
    else if (personal.status === 'arrived') title = 'Bus has arrived at your stop';
    else if (minutes !== null && !stale && !trip.offRoute) title = minutes < 1 ? 'Bus reaches your stop in less than 1 min' : `Bus reaches your stop in about ${minutes} min`;
    else title = 'Arrival estimate updating';
  }
  const showLiveMetrics = !!trip && !!personal && !skipped && personal.status !== 'completed' && personal.status !== 'arrived' && !stale && !trip.offRoute;
  const stopCount = typeof personal?.stopsBeforeYours === 'number' ? personal.stopsBeforeYours : 0;

  return <View style={styles.card}>
    <View style={styles.cardHeader}>
      <Text style={styles.eyebrow}>{trip ? trip.direction === 'TO_SCHOOL' ? 'MORNING PICKUP' : 'RETURN DROP-OFF' : 'YOUR SCHOOL JOURNEY'}</Text>
      {trip?.status === 'active' && <Text style={styles.livePill}>● Live</Text>}
    </View>
    <Text style={styles.title}>{title}</Text>
    {showLiveMetrics && <View style={styles.metrics}>
      <View style={styles.metric}><Text style={styles.metricValue}>{personal?.distanceMeters != null ? `${(personal.distanceMeters / 1000).toFixed(1)} km` : '—'}</Text><Text style={styles.metricLabel}>Distance</Text></View>
      <View style={styles.metricDivider} />
      <View style={styles.metric}><Text style={styles.metricValue}>{minutes !== null ? `${minutes} min` : 'Updating'}</Text><Text style={styles.metricLabel}>Est. Arrival</Text></View>
      <View style={styles.metricDivider} />
      <View style={styles.metric}><Text style={styles.metricValue}>{stopCount}</Text><Text style={styles.metricLabel}>Stops before</Text></View>
    </View>}
    {personal?.status === 'completed' && trip?.direction === 'TO_SCHOOL' && !stale && trip.terminalEta && <Text style={styles.body}>Estimated school arrival: {new Date(trip.terminalEta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>}
    {skipped && <View style={styles.skippedNotice}>
      <Text style={styles.skippedTitle}>Stop skipped</Text>
      <Text style={styles.body}>{trip?.status === 'active' ? 'The bus trip is still in progress, but it will continue without stopping here.' : 'Your child’s stop was marked skipped.'}</Text>
    </View>}
    {(stale || !connected || error) && <Text style={styles.warning}>{stale ? 'Location is stale. Waiting for the driver to reconnect.' : error || 'Reconnecting. Periodic updates remain active.'}</Text>}
    {(trip?.offRoute || trip?.routeState === 'rerouting') && <Text style={styles.warning}>Updating the bus route…</Text>}
    {trip?.routeState === 'cached' && <Text style={styles.warning}>Using the last available route. Times may change.</Text>}
    {trip?.lastLocationUpdatedAt && <Text style={styles.small}>Updated {new Date(trip.lastLocationUpdatedAt).toLocaleTimeString()}</Text>}
    <View style={styles.divider} />
    <View style={styles.approvedCard}>
      <Text style={styles.approvedTitle}>{pickup?.approved ? 'Pickup/Drop-off Approved' : pickup?.status || 'Pickup location not set'}</Text>
      {pickup?.approved
        ? <Text style={styles.body}>{pickup.approved.name}{pickup.approved.formattedAddress ? ` · ${pickup.approved.formattedAddress}` : ''}</Text>
        : <Text style={styles.body}>Submit a pickup point for school approval to receive a personal ETA and arrival alerts.</Text>}
    </View>
    {pickup?.approved && !pickup.published && <Text style={styles.warning}>Approved stop is waiting to be included in a published route.</Text>}
    {pickup?.request && ['pending', 'clarification_required'].includes(pickup.request.status) && <Text style={styles.body}>Requested: {pickup.request.formattedAddress || 'Your selected map point'}. Your existing approved stop stays in use.</Text>}
    {pickup?.request?.reviewNote && <Text style={styles.body}>School note: {pickup.request.reviewNote}</Text>}
    {pickup?.request?.submittedBy === 'school' && !pickup.request.acknowledgedAt && <TouchableOpacity accessibilityRole="button" style={styles.secondaryButton} onPress={async () => { try { await routeRequest(`/parent/pickup-request/${pickup.studentId}/acknowledge`, { requestId: pickup.request?.id }); onRefresh(); } catch { setAckError('Could not acknowledge. Please retry.'); } }}><Text style={styles.secondaryButtonText}>Acknowledge school location</Text></TouchableOpacity>}
    {ackError && <Text style={styles.warning}>{ackError}</Text>}
    <TouchableOpacity accessibilityRole="button" style={styles.secondaryButton} onPress={onRequest}><Text style={styles.secondaryButtonText}>{pickup?.approved ? 'Request a pickup location change' : 'Set pickup location'}</Text></TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({
  card: { padding: 18, borderRadius: 18, backgroundColor: '#fff', marginBottom: 14, borderColor: '#dbeafe', borderWidth: 1, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 11, fontWeight: '700', color: '#2563eb', letterSpacing: 1 },
  livePill: { color: '#047857', backgroundColor: '#d1fae5', fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, overflow: 'hidden' },
  title: { fontSize: 22, fontWeight: '700', color: '#183153', marginVertical: 10, lineHeight: 28 },
  metrics: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: '#f8fafc', borderRadius: 12, paddingVertical: 13, marginBottom: 12 },
  metric: { flex: 1, alignItems: 'center' },
  metricDivider: { width: StyleSheet.hairlineWidth, height: 34, backgroundColor: '#cbd5e1' },
  metricValue: { fontSize: 16, fontWeight: '700', color: '#183153' },
  metricLabel: { fontSize: 11, color: '#64748b', textAlign: 'center', marginTop: 3 },
  body: { fontSize: 13, color: '#475569', marginBottom: 6, lineHeight: 19 },
  skippedNotice: { padding: 12, backgroundColor: '#fff7ed', borderRadius: 12, borderColor: '#fed7aa', borderWidth: 1, marginBottom: 8 },
  skippedTitle: { fontSize: 14, fontWeight: '700', color: '#9a3412', marginBottom: 4 },
  warning: { fontSize: 13, color: '#9a3412', marginVertical: 5 },
  small: { fontSize: 11, color: '#64748b', marginTop: 6 },
  divider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 12 },
  approvedCard: { padding: 12, borderRadius: 12, backgroundColor: '#ecfdf5', marginBottom: 8 },
  approvedTitle: { fontWeight: '700', color: '#047857', marginBottom: 4 },
  secondaryButton: { padding: 10, borderRadius: 9, backgroundColor: '#eff6ff', marginTop: 6, alignItems: 'center' },
  secondaryButtonText: { color: '#1d4ed8', fontWeight: '600' },
});
