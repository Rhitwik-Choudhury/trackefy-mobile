import './firebase';
import messaging from '@react-native-firebase/messaging';
import { AppRegistry } from 'react-native';
import notifee, { AndroidImportance } from '@notifee/react-native';
import App from './App';

// 🔥 CREATE CHANNEL
async function createChannel() {
  await notifee.createChannel({
    id: 'default',
    name: 'Default Channel',
    importance: AndroidImportance.HIGH,
  });
}

createChannel().catch(console.error);

// 🔥 BACKGROUND / KILLED STATE HANDLER
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Background message:', remoteMessage);

  await notifee.displayNotification({
    title:
      remoteMessage?.notification?.title ||
      remoteMessage?.data?.title ||
      'Trackefy Alert',

    body:
      remoteMessage?.notification?.body ||
      remoteMessage?.data?.body ||
      '',

    android: {
      channelId: 'default',
      pressAction: {
        id: 'default',
      },
    }
  });
});

AppRegistry.registerComponent('main', () => App);