import messaging from '@react-native-firebase/messaging';
import { AppRegistry } from 'react-native';
import App from './App';

// 🔥 BACKGROUND / KILLED STATE HANDLER
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Background message:', remoteMessage);
});

AppRegistry.registerComponent('main', () => App);