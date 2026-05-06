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

  if (remoteMessage?.notification) {
    await notifee.displayNotification({
      title: remoteMessage.notification.title,
      body: remoteMessage.notification.body,
      android: {
        channelId: 'default',
        pressAction: {
          id: 'default',
        },
      }
    });
  }
});

AppRegistry.registerComponent('main', () => App);