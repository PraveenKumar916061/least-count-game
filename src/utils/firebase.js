// src/utils/firebase.js
// =====================================================
// IMPORTANT: Replace these values with YOUR Firebase project config.
// Go to Firebase Console > Project Settings > General > Your apps > Web app
// =====================================================
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDqLwjI1fRr3CAiumjvAGe2Uex2URgsaYY",
  authDomain: "least-count-playing-cards.firebaseapp.com",
  databaseURL: "https://least-count-playing-cards-default-rtdb.firebaseio.com",
  projectId: "least-count-playing-cards",
  storageBucket: "least-count-playing-cards.firebasestorage.app",
  messagingSenderId: "563651428123",
  appId: "1:563651428123:web:63d4102149d34883129dbe",
  measurementId: "G-JXE998TKD4",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export default app;
