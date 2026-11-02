import { useAuth } from "../../auth/AuthProvider";
import { AuthCard, Button } from "../../components/ui";

export function DeactivatedPage() {
  const { signOut } = useAuth();
  return (
    <AuthCard
      title="Account deactivated"
      intro="An administrator has deactivated this account. If you think this is a mistake, contact the CampusWell team."
    >
      <Button variant="secondary" onClick={() => void signOut()}>Sign out</Button>
    </AuthCard>
  );
}
