// The Firebase project's public web-app config. These values are not
// secrets; every visitor's bundle ships them, and access control lives in
// the Firestore security rules. If blanked, isFirebaseConfigured hides
// every Google-sign-in surface and the app falls back to the gist sync UI.
export const firebaseConfig = {
  apiKey: "AIzaSyAnqsvM-SKNPKATEj1cRuHItNuuHtELYZY",
  authDomain: "pokedoku-study.firebaseapp.com",
  projectId: "pokedoku-study",
  storageBucket: "pokedoku-study.firebasestorage.app",
  messagingSenderId: "1040295017045",
  appId: "1:1040295017045:web:606c096b41d5368670f2dc"
};

export const isFirebaseConfigured: boolean = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
