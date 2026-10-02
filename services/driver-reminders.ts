import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';
import { BASE_URL } from '../constants/api';
const notificationId = 'trackefy-end-trip';
let displaying: Promise<void> | null = null;
export async function cancelDriverReminder() {
  await notifee.cancelNotification(notificationId);
}
export async function showDriverReminder(data: Record<string, any>) {
  if (data.type !== 'TRIP_END_REMINDER' || !data.tripId) return;
  if (displaying) return displaying;
  displaying = (async () => {
    try {
      const [role, token] = await AsyncStorage.multiGet(['role', 'token']);
      if (role[1] !== 'driver' || !token[1]) return;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      let response: Response;
      try { response = await fetch(BASE_URL + '/driver/active-trip', { signal: controller.signal, headers: { Authorization: 'Bearer ' + token[1] } }); }
      finally { clearTimeout(timeout); }
      if (!response.ok) return;
      const { trip } = await response.json();
      const reminder = trip?.finishReminder;
      if (trip?.id !== data.tripId || trip.status !== 'active' || !reminder || (reminder.snoozedUntil && Date.parse(reminder.snoozedUntil) > Date.now())) return;
      if (!trip.lastLocationUpdatedAt || Date.now() - Date.parse(trip.lastLocationUpdatedAt) > 30000) return;
      const lastEvent = await AsyncStorage.getItem('TRACKefy_LAST_REMINDER_EVENT');
      if (lastEvent === data.eventId) return;
      await notifee.createChannel({ id: 'trip-reminders', name: 'End trip reminders', importance: AndroidImportance.HIGH, sound: 'default', vibration: true });
      await notifee.displayNotification({
        id: notificationId, title: 'Trackefy trip is still active', body: reminder.message,
        data: { type: 'TRIP_END_REMINDER', tripId: trip.id },
        android: { channelId: 'trip-reminders', sound: 'default', pressAction: { id: 'default', launchActivity: 'default' } },
      });
      if (data.eventId) await AsyncStorage.setItem('TRACKefy_LAST_REMINDER_EVENT', data.eventId);
    } catch { /* The in-app banner remains available if push cannot be displayed. */ }
  })().finally(() => { displaying = null; });
  return displaying;
}
export function registerDriverReminders() {
  let disposed = false;
  const save = async (token: string) => {
    const auth = await AsyncStorage.getItem('token');
    if (disposed || !auth) return;
    const response = await fetch(BASE_URL + '/driver/save-fcm-token', { method: 'POST', headers: { Authorization: 'Bearer ' + auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
    if (!response.ok) throw new Error('Unable to register trip reminders');
  };
  const setup = async () => {
    await messaging().registerDeviceForRemoteMessages();
    await messaging().requestPermission(); await notifee.requestPermission();
    await save(await messaging().getToken());
  };
  setup().catch(() => console.log('Trip notifications unavailable; check notification permission'));
  const tokenRefresh = messaging().onTokenRefresh(token => save(token).catch(() => {}));
  const message = messaging().onMessage(remote => showDriverReminder(remote.data || {}));
  return () => { disposed = true; tokenRefresh(); message(); };
}
