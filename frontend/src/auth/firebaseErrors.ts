/** Firebase sign-in errors, in words a student understands. */
const FIREBASE_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Wrong email or password.",
  "auth/invalid-email": "That doesn't look like an email address.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/email-already-in-use": "An account with this email already exists. Sign in instead.",
  "auth/weak-password": "Use at least 8 characters for your password.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/network-request-failed": "Can't reach the sign-in service. Check your connection.",
};

export function firebaseMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? "";
  return FIREBASE_MESSAGES[code] ?? "Sign-in failed. Please try again.";
}
