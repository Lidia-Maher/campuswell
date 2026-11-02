import { initializeApp } from "firebase/app";
import { type Auth, getAuth } from "firebase/auth";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** False until the Firebase web config is filled in (.env.local or Vercel settings). */
export const firebaseEnabled = Boolean(config.apiKey && config.appId);

export const firebaseAuth: Auth | null = firebaseEnabled ? getAuth(initializeApp(config)) : null;

/** The "dev login" box: only for a local backend running with AUTH_DEV_MODE=true. */
export const devLoginEnabled = import.meta.env.VITE_DEV_LOGIN === "true";
