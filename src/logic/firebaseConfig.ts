// The Firebase project's public web-app config. These values are not
// secrets — every visitor's bundle ships them; access control lives
// entirely in Firestore security rules (each signed-in user can only
// touch users/{their own uid}/…).
//
// Until the console project exists this stays blank and the app hides
// every Google-sign-in surface (isFirebaseConfigured gates them), so
// the deployed site keeps today's token-only sync UI.
// Setup steps: .claude/PLAN.md, Batch 6 → "One-time console setup".
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  appId: "",
};

export const isFirebaseConfigured: boolean = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
