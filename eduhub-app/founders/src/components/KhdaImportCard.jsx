import { useState } from "react";
import { listFactSources, friendlyError } from "../lib/staffData";
import { sourcesBySchool } from "../lib/schoolFacts";
import { fillFromKhda, KHDA_URL } from "../lib/khda";
import "./KhdaImportCard.css";

// One click fills every Dubai school from KHDA's official school data (src/data/khdaSchools.json).
// The KHDA rating is always taken from KHDA; everything else only where the school is empty, so
// nothing a consultant typed is changed. Safe to click again: it only fills what's still missing.
const KEPT_LABEL = { curriculum: "curriculum", "year groups": "year groups", fees: "fees" };

export default function KhdaImportCard({ schools, onDone }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  async function run() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const src = sourcesBySchool(await listFactSources().catch(() => []));
      const r = await fillFromKhda(schools, (id) => src.get(id), (done, total) => setProgress({ done, total }));
      setResult(r);
      onDone?.();
    } catch (err) {
      setError(friendlyError(err, "Couldn't fill from KHDA. Try again."));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const kept = result ? result.filled.filter((f) => f.kept.length) : [];

  return (
    <section className="kh">
      <div className="kh-main">
        <span className="kh-mark" aria-hidden="true">
          KHDA
        </span>
        <div className="kh-text">
          <h2>Fill in from KHDA</h2>
          <p>
            KHDA's official data on every Dubai private school: inspection rating, fees (2024-25), year groups, curriculum, area, phone
            and website. Empty details get filled in. Anything already on a school stays as it is.
          </p>
        </div>
        <button type="button" className="kh-btn" onClick={run} disabled={busy || !schools?.length}>
          {busy ? (progress ? `Filling ${progress.done} of ${progress.total}…` : "Loading KHDA data…") : result ? "Run again" : "Fill from KHDA"}
        </button>
      </div>

      {error && <div className="hh-form-banner hh-form-banner-error">{error}</div>}

      {result && (
        <div className="kh-result">
          <div className="kh-stats">
            <div className="kh-stat is-good">
              <strong>{result.filled.length}</strong>
              <span>schools updated</span>
            </div>
            <div className="kh-stat">
              <strong>{result.unchanged}</strong>
              <span>already up to date</span>
            </div>
            <div className="kh-stat">
              <strong>{result.notFound.length}</strong>
              <span>not on KHDA's list</span>
            </div>
            <div className="kh-stat">
              <strong>{result.skipped}</strong>
              <span>outside Dubai</span>
            </div>
          </div>

          {(kept.length > 0 || result.notFound.length > 0 || result.failed.length > 0) && (
            <button type="button" className="kh-more" onClick={() => setOpen((o) => !o)}>
              {open ? "Hide details" : "Show details"}
            </button>
          )}
          {open && (
            <div className="kh-details">
              {kept.length > 0 && (
                <div>
                  <h3>Kept your details where KHDA says something different</h3>
                  <ul>
                    {kept.map((f) => (
                      <li key={f.name}>
                        <strong>{f.name}</strong>: {f.kept.map((k) => KEPT_LABEL[k] || k).join(", ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.notFound.length > 0 && (
                <div>
                  <h3>Not on KHDA's list</h3>
                  <p className="kh-note">Usually a newer school, or one KHDA lists under a very different name.</p>
                  <ul>
                    {result.notFound.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
              {result.failed.length > 0 && (
                <div>
                  <h3>Couldn't save</h3>
                  <ul>
                    {result.failed.map((f) => (
                      <li key={f.name}>
                        <strong>{f.name}</strong>: {f.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <p className="kh-credit">
        Source:{" "}
        <a href={KHDA_URL} target="_blank" rel="noreferrer">
          KHDA Dubai Private Schools Open Data ↗
        </a>{" "}
        · updated November 2025
      </p>
    </section>
  );
}
