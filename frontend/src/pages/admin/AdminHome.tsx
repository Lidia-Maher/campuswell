import { useQuery } from "@tanstack/react-query";
import { Flag, ShieldCheck, UserCheck, UserX, Users } from "lucide-react";
import { Link } from "react-router";

import { api, unwrap } from "../../api/client";
import { Card, ErrorAlert, Loading, StatCard } from "../../components/ui";

export function AdminHome() {
  const overview = useQuery({ queryKey: ["admin", "overview"], queryFn: () => unwrap(api.GET("/api/admin/overview")) });
  const o = overview.data;
  if (overview.isPending) return <Loading />;
  if (!o) return <ErrorAlert error={overview.error} />;

  return (
    <div className="stack-lg">
      <div>
        <h2 style={{ fontSize: "1.6rem" }}>Platform overview</h2>
        <p className="muted">What needs your attention today.</p>
      </div>
      <div className="grid grid-half">
        <Card title="Needs your attention">
          <ul className="list">
            <li className="list-item">
              <ShieldCheck size={20} color="#d97706" aria-hidden />
              <div className="grow"><strong>{o.pending_posts} posts waiting for review</strong></div>
              <Link to="/admin/moderation" className="btn btn-secondary">Review</Link>
            </li>
            <li className="list-item">
              <Flag size={20} color="#dc2626" aria-hidden />
              <div className="grow"><strong>{o.open_reports} open reports</strong></div>
              <Link to="/admin/moderation?tab=reports" className="btn btn-secondary">Handle</Link>
            </li>
          </ul>
        </Card>
        <Card title="Engagement">
          <p className="value num" style={{ fontSize: "2.2rem", fontWeight: 700, color: "#111827" }}>
            {o.students ? Math.round((o.active_students_7d / o.students) * 100) : 0}%
          </p>
          <p className="muted">of students ({o.active_students_7d} of {o.students}) used CampusWell in the last 7 days.</p>
        </Card>
      </div>
      <div className="grid grid-4">
        <StatCard icon={Users} label="Students" value={o.students} />
        <StatCard icon={UserCheck} label="Counsellors" tone="green" value={o.counsellors} />
        <StatCard icon={ShieldCheck} label="Administrators" value={o.admins} />
        <StatCard icon={UserX} label="Deactivated" tone="amber" value={o.deactivated_users} />
      </div>
    </div>
  );
}
