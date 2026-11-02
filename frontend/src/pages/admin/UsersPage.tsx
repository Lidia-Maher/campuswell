import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";

import { api, type Schemas, unwrap } from "../../api/client";
import { messageFor } from "../../api/errors";
import { useCurrentUser } from "../../auth/AuthProvider";
import { Alert, Button, ConfirmDialog, Empty, ErrorAlert, Loading } from "../../components/ui";
import { whenLabel } from "../../lib/format";

type AdminUser = Schemas["AdminUserOut"];
type Role = "student" | "admin" | "counsellor";
const SCHOOL: Record<string, string> = { computing: "Computing", engineering: "Engineering", business: "Business" };

export function UsersPage() {
  const me = useCurrentUser();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [confirm, setConfirm] = useState<AdminUser | null>(null);
  const users = useQuery({
    queryKey: ["admin", "users", search, role],
    queryFn: () => unwrap(api.GET("/api/admin/users", { params: { query: { search: search || undefined, role: role || undefined } } })),
    placeholderData: keepPreviousData,
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: Schemas["AdminUserUpdate"] & { id: number }) =>
      unwrap(api.PATCH("/api/admin/users/{user_id}", { params: { path: { user_id: id } }, body })),
    onSuccess: () => { setConfirm(null); void qc.invalidateQueries({ queryKey: ["admin"] }); },
  });

  return (
    <div className="stack-lg">
      <div className="row wrap">
        <div className="row grow" style={{ minWidth: 220, position: "relative" }}>
          <Search size={17} aria-hidden style={{ position: "absolute", left: 12, color: "#6b7280" }} />
          <label htmlFor="user-search" className="sr-only">Search by name or email</label>
          <input id="user-search" className="input" style={{ paddingLeft: 36 }} placeholder="Search by name or email"
                 value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label htmlFor="user-role" className="sr-only">Role</label>
        <select id="user-role" className="input" style={{ width: "auto" }} value={role} onChange={(e) => setRole(e.target.value as Role | "")}>
          <option value="">All roles</option>
          <option value="student">Students</option>
          <option value="counsellor">Counsellors</option>
          <option value="admin">Administrators</option>
        </select>
      </div>
      {update.isError && <Alert>{messageFor(update.error)}</Alert>}
      {users.isPending ? <Loading /> : users.isError ? <ErrorAlert error={users.error} /> :
        users.data.length === 0 ? <Empty>No users match.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>School</th><th>Role</th><th>Last sign-in</th><th>Status</th><th /></tr></thead>
              <tbody>
                {users.data.map((u) => {
                  const self = u.user_id === me.user_id;
                  return (
                    <tr key={u.user_id}>
                      <td><strong style={{ color: "#111827" }}>{u.name}</strong></td>
                      <td>{u.email}</td>
                      <td>{u.department ? SCHOOL[u.department] : "–"}</td>
                      <td>
                        <label htmlFor={`role-${u.user_id}`} className="sr-only">Role of {u.name}</label>
                        <select id={`role-${u.user_id}`} className="input" style={{ width: "auto", padding: "5px 8px" }} value={u.role}
                                disabled={self || update.isPending}
                                onChange={(e) => update.mutate({ id: u.user_id, role: e.target.value as Role })}>
                          <option value="student" disabled={!u.department}>Student</option>
                          <option value="counsellor">Counsellor</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td>{u.last_login_at ? whenLabel(u.last_login_at) : "Never"}</td>
                      <td><span className={`badge ${u.is_active ? "badge-green" : "badge-danger"}`}>{u.is_active ? "Active" : "Deactivated"}</span></td>
                      <td>
                        {!self && (u.is_active
                          ? <Button variant="danger-outline" onClick={() => setConfirm(u)}>Deactivate</Button>
                          : <Button variant="secondary" busy={update.isPending} onClick={() => update.mutate({ id: u.user_id, is_active: true })}>Reactivate</Button>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      <ConfirmDialog open={confirm !== null} title={`Deactivate ${confirm?.name}?`} confirmLabel="Deactivate"
                     busy={update.isPending} onCancel={() => setConfirm(null)}
                     onConfirm={() => confirm && update.mutate({ id: confirm.user_id, is_active: false })}>
        <p>They will be signed out of CampusWell and can't sign in until you reactivate the account. Their data is kept.</p>
      </ConfirmDialog>
    </div>
  );
}
