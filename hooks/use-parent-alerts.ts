import { useCallback, useEffect, useState } from 'react';
import { AppState, Alert } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, { AuthorizationStatus } from '@notifee/react-native';
import { routeRequest } from '../services/routes';
import socket from '../services/socket';

export type ParentAlert = { _id: string; title: string; message: string; type: string; createdAt: string; readAt?: string | null };
export function useParentAlerts() {
  const [notifications, setNotifications] = useState<ParentAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0), [enabled, setEnabled] = useState(false), [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const result = await routeRequest('/parent/notifications');
      setNotifications(result.notifications); setUnreadCount(result.unreadCount); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load alerts'); }
  }, []);
  const checkPermission = useCallback(async () => {
    try { const settings = await notifee.getNotificationSettings(); setEnabled(settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED); } catch { setEnabled(false); }
  }, []);
  useEffect(() => {
    refresh(); checkPermission();
    const timer = setInterval(refresh, 15000);
    const app = AppState.addEventListener('change', state => { if (state === 'active') { refresh(); checkPermission(); } });
    const message = messaging().onMessage(() => refresh());
    socket.on('alert', refresh);
    return () => { clearInterval(timer); app.remove(); message(); socket.off('alert', refresh); };
  }, [refresh, checkPermission]);
  const enableAlerts = async () => {
    try {
      await messaging().registerDeviceForRemoteMessages();
      await messaging().requestPermission();
      const settings = await notifee.requestPermission();
      if (settings.authorizationStatus < AuthorizationStatus.AUTHORIZED) {
        setEnabled(false);
        Alert.alert('Enable trip alerts', 'Allow Trackefy notifications in your phone settings.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Open Settings', onPress: () => notifee.openNotificationSettings().catch(() => Alert.alert('Unable to open settings', 'Open Trackefy notification settings on your phone.')) }]);
        return;
      }
      await routeRequest('/parent/save-fcm-token', { token: await messaging().getToken() });
      setEnabled(true); Alert.alert('Alerts enabled', 'You’ll receive trip, arrival and delay alerts.');
    } catch (e) { Alert.alert('Could not enable alerts', e instanceof Error ? e.message : 'Please retry.'); }
  };
  const markRead = async () => {
    try { const ids = notifications.filter(n => !n.readAt).map(n => n._id); if (ids.length) await routeRequest('/parent/notifications/read', { ids }); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to mark alerts read'); }
  };
  return { notifications, unreadCount, enabled, error, refresh, enableAlerts, markRead };
}
