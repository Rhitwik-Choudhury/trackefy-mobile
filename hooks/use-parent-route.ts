import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import socket from '../services/socket';
import { LiveTrip, PickupState, routeRequest } from '../services/routes';
export function useParentRoute(studentId?: string) {
  const [trip, setTrip] = useState<LiveTrip | null>(null), [pickup, setPickup] = useState<PickupState | null>(null), [error, setError] = useState(''), [connected, setConnected] = useState(socket.connected);
  const current = useRef(studentId), inFlight = useRef(false);
  current.current = studentId;
  const refresh = useCallback(async () => {
    if (!studentId || inFlight.current) return;
    inFlight.current = true;
    try { const result = await routeRequest<{ trip: LiveTrip | null; pickup: PickupState; lastTrip?: LiveTrip | null }>(`/parent/live-trip/${studentId}`); if (current.current === studentId) { setTrip(result.trip || result.lastTrip || null); setPickup(result.pickup); setError(''); } }
    catch (e) { if (current.current === studentId) setError(e instanceof Error ? e.message : 'Unable to refresh trip'); }
    finally { inFlight.current = false; }
  }, [studentId]);
  useEffect(() => {
    setTrip(null); setPickup(null); setError('');
    if (!studentId) return;
    refresh();
    const update = (value: LiveTrip) => { if (value.studentId === studentId) setTrip(value); };
    const connect = () => { setConnected(true); refresh(); }, disconnect = () => setConnected(false);
    socket.on('parent-trip', update); socket.on('connect', connect); socket.on('disconnect', disconnect);
    socket.on('alert', refresh);
    if (!socket.connected) socket.connect();
    const timer = setInterval(refresh, 8000);
    const app = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { clearInterval(timer); app.remove(); socket.off('parent-trip', update); socket.off('connect', connect); socket.off('disconnect', disconnect); socket.off('alert', refresh); };
  }, [studentId, refresh]);
  return { trip: trip?.studentId === studentId ? trip : null, pickup: pickup?.studentId === studentId ? pickup : null, error, connected, refresh };
}

