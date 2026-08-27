// The Firebase project's public web-app config. These values are not
// secrets — every visitor's bundle ships them; access control lives
// entirely in Firestore security rules (each signed-in user can only
// touch users/{their own uid}/…).
//
// Filled 2026-08-26 from the pokedoku-study console project (Batch 6's
// "One-time console setup", .claude/PLAN.md). If it were ever blanked,
// isFirebaseConfigured would hide every Google-sign-in surface again
// and the app would fall back to the token-only sync UI.
export const firebaseConfig = {
  apiKey: "AIzaSyAnqsvM-SKNPKATEj1cRuHItNuuHtELYZY",
  authDomain: "pokedoku-study.firebaseapp.com",
  projectId: "pokedoku-study",
  storageBucket: "pokedoku-study.firebasestorage.app",
  messagingSenderId: "1040295017045",
  appId: "1:1040295017045:web:606c096b41d5368670f2dc"
};

export const isFirebaseConfigured: boolean = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
