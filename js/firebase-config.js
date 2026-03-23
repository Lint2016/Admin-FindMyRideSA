// Firebase Configuration and Initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check.js";

/**
 * Firebase configuration
 */
const firebaseConfig = {
    apiKey: "AIzaSyAjrzt2JLK-l3RMqGGk8GylcdvEfcGtTig",
    authDomain: "findmyridesa-68a25.firebaseapp.com",
    projectId: "findmyridesa-68a25",
    storageBucket: "findmyridesa-68a25.firebasestorage.app",
    messagingSenderId: "323984085262",
    appId: "1:323984085262:web:c01383d0bd0f1b3b5d875f",
    measurementId: "G-KPGYW75D8Q"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Initialize App Check
// To enable local debugging: Uncomment the next line AND add the token to Firebase Console
 self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;

export const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('6LdlaoQsAAAAACcchBLwltRLFjQZFsWP5ukpq9v9'),
    isTokenAutoRefreshEnabled: true
});
