import { initializeApp, getApps } from '@react-native-firebase/app';

// This ensures Firebase is initialized only once
if (getApps().length === 0) {
  initializeApp();
}

export default null;