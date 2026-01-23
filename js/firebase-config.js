// Firebase Configuration and Initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

/**
 * ! ACTION REQUIRED: Paste your Firebase configuration here.
 * You can find this in your Firebase Console: 
 * Project Settings > General > Your apps > SDK setup and configuration
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
