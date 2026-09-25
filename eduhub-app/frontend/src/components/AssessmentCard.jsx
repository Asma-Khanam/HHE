import { useState } from "react";
import { assessmentWhen, assessmentText, downloadAssessmentIcs } from "../lib/assessment";
import { mapsSearchUrl } from "../lib/tourDetails";
import "./TourDetailsCard.css";
import "./AssessmentCard.css";

// One assessment, laid out like the tour details (Heather, 25 Sept 2026):
// a Join button, the meeting ID and passcode each on their own line with a
// copy button, and every link in the details clickable.

const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/gi;

function Linkified({ text }) {
  const parts = String(text).split(URL_RE);
  return parts.map((p, i) =>
    /^https?:\/\//i.test(p) ? (
      <a key={i} href={p.replace(/[.,;:]+$/, "")} target="_blank" rel="noopener noreferrer">
        {p.replace(/^https?:\/\/(www\.)?/i, "").split(/[/?#]/)[0]}
        {" ↗"}
      </a>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

function CopyLine({ label, value }) {
  const [done, setDone] = useState(false);
  return (
    <div>
      <dt>{label}</dt>
      <dd className="asc-copy">
        <code>{value}</code>
        <button
          type="button"
          className="asc-copy-btn"
          onClick={() =>
            navigator.clipboard?.writeText(value).then(() => {
              setDone(true);
              setTimeout(() => setDone(false), 1500);
            })
          }
        >
          {done ? "Copied ✓" : "Copy"}
        </button>
      </dd>
    </div>
  );
}

export default function AssessmentCard({ assessment: a, showHeading = true }) {
  const [copied, setCopied] = useState(false);
  const online = !!a.link;

  return (
    <div className="tdc asc">
      {showHeading && <p className="tdc-title">Assessment Details</p>}
      <dl className="tdc-list">
        <div>
          <dt>School</dt>
          <dd>{a.school.name || "School"}</dd>
        </div>
        {a.childName && (
          <div>
            <dt>For</dt>
            <dd>{a.childName}</dd>
          </div>
        )}
        <div>
          <dt>When</dt>
          <dd>{assessmentWhen(a)}</dd>
        </div>
        <div>
          <dt>Where</dt>
          <dd>
            {online ? (
              `Online · ${a.platform}`
            ) : a.linkText ? (
              <Linkified text={a.linkText} />
            ) : (
              <a href={mapsSearchUrl(a.school)} target="_blank" rel="noopener noreferrer">
                At the school · open map ↗
              </a>
            )}
          </dd>
        </div>
        {online && (
          <div>
            <dt>Join link</dt>
            <dd>
              <a href={a.link} target="_blank" rel="noopener noreferrer">
                Join the {a.platform === "Online meeting" ? "meeting" : `${a.platform} meeting`} ↗
              </a>
            </dd>
          </div>
        )}
        {a.meetingId && <CopyLine label="Meeting ID" value={a.meetingId} />}
        {a.passcode && <CopyLine label="Passcode" value={a.passcode} />}
      </dl>

      {a.notes && (
        <>
          <p className="tdc-sub">Details from your consultant</p>
          <p className="asc-notes">
            <Linkified text={a.notes} />
          </p>
        </>
      )}

      <div className="tdc-actions">
        {online && (
          <a className="tdc-btn tdc-btn-primary" href={a.link} target="_blank" rel="noopener noreferrer">
            Join meeting
          </a>
        )}
        {a.date && (
          <button type="button" className={"tdc-btn" + (online ? "" : " tdc-btn-primary")} onClick={() => downloadAssessmentIcs(a)}>
            Add to calendar
          </button>
        )}
        <button
          type="button"
          className="tdc-btn"
          onClick={() =>
            navigator.clipboard?.writeText(assessmentText(a)).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            })
          }
        >
          {copied ? "Copied ✓" : "Copy details"}
        </button>
      </div>
    </div>
  );
}
