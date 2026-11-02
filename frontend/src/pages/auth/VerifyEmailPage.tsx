import { sendEmailVerification } from "firebase/auth";
import { useState } from "react";

import { useAuth } from "../../auth/AuthProvider";
import { firebaseAuth } from "../../auth/firebase";
import { firebaseMessage } from "../../auth/firebaseErrors";
import { Alert, AuthCard, Button } from "../../components/ui";

export function VerifyEmailPage() {
  const { session, refresh, signOut } = useAuth();
  const email = session.status === "needsVerification" ? session.email : "";
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [checking, setChecking] = useState(false);

  async function checkAgain() {
    const user = firebaseAuth?.currentUser;
    if (!user) return;
    setChecking(true);
    setMessage(null);
    try {
      await user.reload();
      if (!user.emailVerified) {
        setMessage({ kind: "error", text: "Not verified yet. Open the email and click the link, then try again." });
        return;
      }
      await user.getIdToken(true); // a fresh token that says the email is verified
      await refresh();
    } catch (e) {
      setMessage({ kind: "error", text: firebaseMessage(e) });
    } finally {
      setChecking(false);
    }
  }

  async function resend() {
    const user = firebaseAuth?.currentUser;
    if (!user) return;
    try {
      await sendEmailVerification(user);
      setMessage({ kind: "info", text: "We sent a new link. Check your inbox and your junk folder." });
    } catch (e) {
      setMessage({ kind: "error", text: firebaseMessage(e) });
    }
  }

  return (
    <AuthCard
      title="Check your inbox"
      intro={<p>We sent a verification link to <strong>{email}</strong>. Click it, then come back here.</p>}
    >
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
      <Button busy={checking} onClick={() => void checkAgain()}>I've clicked the link</Button>
      <div className="row spread">
        <button type="button" className="linklike" onClick={() => void resend()}>Send the link again</button>
        <button type="button" className="linklike" onClick={() => void signOut()}>Use another account</button>
      </div>
    </AuthCard>
  );
}
