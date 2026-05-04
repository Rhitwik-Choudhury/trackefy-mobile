import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyDEw131EMLkLxRZswVxhw_l2fvBDlh8BiQ",
  authDomain: "trackefy.firebaseapp.com",
  projectId: "trackefy",
  storageBucket: "trackefy.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};

export const app = initializeApp(firebaseConfig);