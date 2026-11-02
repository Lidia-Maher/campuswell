import { HeartHandshake, Mail, MapPin, Phone } from "lucide-react";

import { SUPPORT_CONTACTS } from "../lib/support";

/**
 * Shown when a PHQ-9 answer to question 9 is above 0 (needs_support_message), and on the
 * Campus Resources tab. Never hidden behind a click.
 */
export function SupportPanel({ urgent = false }: { urgent?: boolean }) {
  return (
    <section className={`card ${urgent ? "tint-blue" : ""}`} aria-labelledby="support-title" role={urgent ? "alert" : undefined}>
      <div className="stack">
        <div className="row">
          <HeartHandshake size={26} color="#2e75b6" aria-hidden />
          <h2 id="support-title">{urgent ? "You don't have to face this alone" : "Talk to someone"}</h2>
        </div>
        {urgent && (
          <p>
            Some of your answers suggest you may be going through a very hard time. Please reach out to someone today.
            Talking to a counsellor is free and confidential, and it can really help.
          </p>
        )}
        <ul className="list">
          {SUPPORT_CONTACTS.map((c) => (
            <li key={c.name} className="list-item" style={{ alignItems: "flex-start" }}>
              <div className="grow stack" style={{ gap: 4 }}>
                <strong>{c.name}</strong>
                <span className="small muted">{c.description}</span>
                <div className="row wrap small" style={{ gap: 16 }}>
                  {c.phone && <span className="row" style={{ gap: 6 }}><Phone size={15} aria-hidden /> {c.phone}</span>}
                  {c.email && <span className="row" style={{ gap: 6 }}><Mail size={15} aria-hidden /> {c.email}</span>}
                  {c.location && <span className="row" style={{ gap: 6 }}><MapPin size={15} aria-hidden /> {c.location}</span>}
                  {c.hours && <span className="muted">{c.hours}</span>}
                  {!c.phone && !c.email && !c.location && (
                    <span className="badge badge-warning">Contact details not added yet</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <p className="small muted">CampusWell is not a medical service and does not replace professional care.</p>
      </div>
    </section>
  );
}
