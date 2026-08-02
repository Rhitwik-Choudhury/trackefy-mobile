import './firebase';

import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';

// Create notification channel
async function createChannel() {
  await notifee.createChannel({
    id: 'default',
    name: 'Default Channel',
    importance: AndroidImportance.HIGH,
  });
}

createChannel().catch(console.error);

// Notifee background event handler
notifee.onBackgroundEvent(async ({ type, detail }) => {
  console.log('🔔 NOTIFEE BACKGROUND EVENT:', type, detail);

  if (type === EventType.PRESS) {
    console.log('Notification pressed in background/killed state');
  }
});

// Background / killed state FCM handler
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('🔥 BACKGROUND FCM:', remoteMessage);

  // Messages containing a notification payload are displayed
  // automatically by Android in background/killed state.
  if (remoteMessage?.notification) {
    return;
  }

  // Keep Notifee as a fallback for any data-only message.
  const title =
    remoteMessage?.data?.title || 'Trackefy Alert';

  const body =
    remoteMessage?.data?.body || '';

  await notifee.displayNotification({
    title,
    body,
    android: {
      channelId: 'default',
      pressAction: {
        id: 'default',
      },
    },
  });
});

// Start Expo Router AFTER background handler is registered
import 'expo-router/entry';