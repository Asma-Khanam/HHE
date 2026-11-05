import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { meetingPlatform } from "../lib/meetingLink";
import "./AssessmentGuide.css";

// A parent-facing interview guide built from the assessment details already
// saved on each application (date, time, link, meeting ID, passcode).
// Schools email these times separately for each child; this puts them on one
// page the family can keep. Times are saved in Dubai time, the UK time is worked out.

const pad = (n) => String(n).padStart(2, "0");

function parts(date, time) {
  if (!date) return null;
  const [h, m] = String(time || "00:00").split(":").map(Number);
  const [y, mo, d] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(y, mo - 1, d, h - 4, m)); // Dubai is UTC+4 all year
  const day = new Date(Date.UTC(y, mo - 1, d, 12)).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  });
  const uk = time
    ? utc.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London", hour12: false })
    : "";
  const ukDay = utc.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
  return { day, dubai: time ? `${pad(h)}:${pad(m)}` : "", uk, ukDay, sortKey: `${date} ${time || ""}` };
}

export function guideRows(children = [], applicationsByChild = {}) {
  const rows = [];
  children.forEach((c) => {
    (applicationsByChild[c.id] || []).forEach((a) => {
      if (!a.assessment_date || a.status === "withdrawn" || a.status === "rejected") return;
      const p = parts(a.assessment_date, a.assessment_time);
      rows.push({
        id: a.id,
        child: c.preferred_name || c.first_name || "Child",
        school: a.schoolName || a.school_name || "the school",
        inPerson: !!a.assessment_in_person,
        link: a.assessment_link || "",
        meetingId: a.assessment_meeting_id || "",
        passcode: a.assessment_passcode || "",
        notes: a.assessment_notes || "",
        ...p,
      });
    });
  });
  return rows.sort((x, y) => x.sortKey.localeCompare(y.sortKey));
}

export default function AssessmentGuide({ familyName, children = [], applicationsByChild = {} }) {
  const [open, setOpen] = useState(false);
  const [extra, setExtra] = useState({}); // id -> { who, length }
  const rows = useMemo(() => guideRows(children, applicationsByChild), [children, applicationsByChild]);
  if (!rows.length) return null;

  const set = (id, k, v) => setExtra((m) => ({ ...m, [id]: { ...m[id], [k]: v } }));
  const schools = [...new Set(rows.map((r) => r.school))];
  const kids = [...new Set(rows.map((r) => r.child))];
  const first = rows[0].day;
  const last = rows[rows.length - 1].day;

  const guide = (
    <div className="ag-portal">
      <div className="ag-bar">
        <span>Interview guide for {familyName || "the family"}. Fill in “Meeting with” and “Length” if you have them, then save as PDF.</span>
        <button type="button" className="panel-btn panel-btn-primary" onClick={() => window.print()}>Print / Save as PDF</button>
        <button type="button" className="panel-btn" onClick={() => setOpen(false)}>Close</button>
      </div>
      <div className="ag-page">
        <div className="ag-head">
          <div className="ag-kicker">Heather Harries Ed Hub</div>
          <h1>The {familyName || "Family"} Interview Guide</h1>
          <p>
            {kids.join(", ")} · {schools.join(", ")} · {first === last ? first : `${first} to ${last}`}
          </p>
        </div>

        <h2>At a glance</h2>
        <table className="ag-table">
          <thead>
            <tr><th>Child</th><th>School</th><th>Date</th><th>Dubai</th><th>UK</th><th>How</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.child}</td>
                <td>{r.school}</td>
                <td>{r.day}</td>
                <td>{r.dubai || "TBC"}</td>
                <td>{r.uk || "TBC"}</td>
                <td>{r.inPerson ? "At the school" : r.link ? meetingPlatform(r.link) : "Online"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {rows.map((r) => (
          <div className="ag-card" key={r.id}>
            <h3>{r.child} · {r.school}</h3>
            <dl>
              <dt>When</dt>
              <dd>{r.day}{r.dubai ? ` at ${r.dubai} Dubai time (${r.uk} UK${r.ukDay !== r.day ? ", " + r.ukDay : ""})` : ""}</dd>
              <dt>Meeting with</dt>
              <dd>
                <input className="ag-in" placeholder="Name and role" value={extra[r.id]?.who || ""} onChange={(e) => set(r.id, "who", e.target.value)} />
              </dd>
              <dt>Length</dt>
              <dd>
                <input className="ag-in" placeholder="e.g. 30 minutes" value={extra[r.id]?.length || ""} onChange={(e) => set(r.id, "length", e.target.value)} />
              </dd>
              {r.inPerson ? (
                <>
                  <dt>Where</dt>
                  <dd>At {r.school}</dd>
                </>
              ) : (
                <>
                  <dt>Join link</dt>
                  <dd>{r.link ? <a href={r.link}>{r.link}</a> : "To follow"}</dd>
                  {r.meetingId && (<><dt>Meeting ID</dt><dd>{r.meetingId}</dd></>)}
                  {r.passcode && (<><dt>Passcode</dt><dd>{r.passcode}</dd></>)}
                </>
              )}
              {r.notes && (<><dt>Note</dt><dd>{r.notes}</dd></>)}
            </dl>
          </div>
        ))}

        <h2>Before each call</h2>
        <ul className="ag-list">
          <li>Test the link, camera and sound a few minutes early.</li>
          <li>Find a quiet room with good light and a plain background.</li>
          <li>Have your child ready, comfortable and with water to hand.</li>
          <li>Keep the meeting ID and passcode close in case you are asked for them.</li>
          <li>Check the Dubai and UK times above, they differ by four hours in winter.</li>
        </ul>
        <p className="ag-foot">Don't dream it. Know it. Do it.</p>
      </div>
    </div>
  );

  return (
    <>
      <button type="button" className="panel-btn" onClick={() => setOpen(true)}>
        Parent interview guide ({rows.length})
      </button>
      {open && createPortal(guide, document.body)}
    </>
  );
}
