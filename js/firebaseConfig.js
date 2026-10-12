/**
 * CampusXplore - Firebase Client Configuration (Modular SDK v10+)
 * Provides connection to Firebase Authentication and Cloud Firestore.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ============================================================================
// Firebase Project Configuration
// Replace placeholders with your Firebase project credentials from the
// Firebase Console: Project Settings > General > Your Apps > Web App
// ============================================================================
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Check if credentials have been populated or if runtime environment injected them
const runtimeConfig = (typeof window !== 'undefined' && window.__FIREBASE_CONFIG__) 
    ? window.__FIREBASE_CONFIG__ 
    : firebaseConfig;

export const isFirebaseConfigured = runtimeConfig.apiKey && 
    runtimeConfig.apiKey !== "YOUR_API_KEY" && 
    runtimeConfig.projectId !== "YOUR_PROJECT_ID";

let app = null;
let auth = null;
let db = null;

if (isFirebaseConfigured) {
    try {
        app = initializeApp(runtimeConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        console.log("[CampusXplore] Firebase successfully initialized with Cloud Firestore & Auth.");
    } catch (error) {
        console.error("[CampusXplore] Error initializing Firebase:", error);
    }
} else {
    console.warn(
        "[CampusXplore] Notice: Firebase credentials in js/firebaseConfig.js are set to placeholders. " +
        "Operating in robust LocalStorage Fallback Mode. To sync with live Firebase, paste your " +
        "Firebase Console credentials into js/firebaseConfig.js or window.__FIREBASE_CONFIG__."
    );
}

export { app, auth, db };

