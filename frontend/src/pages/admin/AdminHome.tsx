import { useQuery } from "@tanstack/react-query";

import { api, unwrap } from "../../api/client";
import { messageFor } from "../../api/errors";
import { Alert } from "../../components/ui";

export function AdminHome() {
  const overview = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => unwrap(api.GET("/api/admin/overview")),
  });

  return (
    <div className="stack-lg">
      <h1>Overview</h1>
      {overview.isPending && <p className="muted">Loading…</p>}
      {overview.isError && <Alert>{messageFor(overview.error)}</Alert>}
      {overview.data && (
        <>
          <div className="panel stack">
            <p className="eyebrow">Needs your attention</p>
            <dl className="stats">
              <div><dt>Posts waiting for review</dt><dd>{overview.data.pending_posts}</dd></div>
              <div><dt>Open reports</dt><dd>{overview.data.open_reports}</dd></div>
            </dl>
          </div>
          <div className="panel stack">
            <p className="eyebrow">Users</p>
            <dl className="stats">
              <div><dt>Students</dt><dd>{overview.data.students}</dd></div>
              <div><dt>Active in the last 7 days</dt><dd>{overview.data.active_students_7d}</dd></div>
              <div><dt>Counsellors</dt><dd>{overview.data.counsellors}</dd></div>
              <div><dt>Administrators</dt><dd>{overview.data.admins}</dd></div>
              <div><dt>Deactivated</dt><dd>{overview.data.deactivated_users}</dd></div>
            </dl>
          </div>
        </>
      )}
    </div>
  );
}
