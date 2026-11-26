import { useEffect, useState } from "react";
import { loadKhda, matchKhda, KHDA_URL } from "../lib/khda";
import "./SchoolKhdaTab.css";

// The KHDA tab on a school: everything KHDA publishes about it, read only, straight from KHDA's
// Dubai Private Schools Open Data (November 2025). Nothing to fill in here; addendum 167 already
// copied the useful parts (rating, fees, year groups, curriculum, area, phone, website) into the
// school record wherever ours was empty. The latest rating sits in the page header.

const tone = (text) => String(text || "").toLowerCase().replace(/\s+/g, "-");
const aed = (n) => Number(n).toLocaleString("en-GB");

function Row({ label, children }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="kt-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function SchoolKhdaTab({ school }) {
  const [k, setK] = useState(undefined); // undefined = loading, null = not on KHDA's list

  useEffect(() => {
    let live = true;
    loadKhda()
      .then((data) => live && setK(matchKhda(school, data)))
      .catch(() => live && setK(null));
    return () => {
      live = false;
    };
  }, [school]);

  if (k === undefined) return <div className="kt-empty">Loading KHDA's record…</div>;

  if (!k) {
    const outside = school.emirate && school.emirate !== "Dubai";
    return (
      <div className="kt-empty">
        <span className="kt-mark" aria-hidden="true">
          KHDA
        </span>
        <h2>{outside ? "KHDA only covers Dubai schools" : "Not on KHDA's list"}</h2>
        <p>
          {outside
            ? `This school is in ${school.emirate}, so KHDA has no record of it.`
            : "KHDA's school list doesn't include this school. That usually means it's a newer school, or KHDA lists it under a very different name."}
        </p>
      </div>
    );
  }

  const site = k.w ? k.w.replace(/^https?:\/\//i, "").replace(/\/$/, "") : "";

  return (
    <div className="kt">
      <div className="kt-grid">
        <section className="kt-card">
          <div>
            <span className="kt-eyebrow">KHDA record</span>
            <h3>{k.n}</h3>
          </div>
          <dl className="kt-dl">
            <Row label="Curriculum">{k.ck}</Row>
            <Row label="Year groups">{k.g}</Row>
            <Row label="Area">{k.a}</Row>
            <Row label="Opened in Dubai">{k.est}</Row>
            <Row label="Students (2024-25)">{k.st ? aed(k.st) : ""}</Row>
            <Row label="Principal">{k.pr}</Row>
            <Row label="Phone">{k.p && <a href={"tel:" + k.p.replace(/\s+/g, "")}>{k.p}</a>}</Row>
            <Row label="Email">{k.e && <a href={"mailto:" + k.e}>{k.e}</a>}</Row>
            <Row label="Website">
              {k.w && (
                <a href={k.w} target="_blank" rel="noreferrer">
                  {site} ↗
                </a>
              )}
            </Row>
          </dl>
        </section>

        <section className="kt-card">
          <h3>Rating history</h3>
          {k.h?.length ? (
            <ol className="kt-history">
              {[...k.h].reverse().map(([year, rating]) => (
                <li key={year}>
                  <span className="kt-year">{year}</span>
                  <span className={"kt-chip is-" + tone(rating)}>{rating}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="kt-muted">KHDA hasn't published a rating for this school yet.</p>
          )}
        </section>
      </div>

      <section className="kt-card">
        <div className="kt-card-head">
          <h3>Fees for 2024-25</h3>
          {k.f && (
            <span className="kt-range">
              AED {aed(k.f[0])} to {aed(k.f[1])} a year
            </span>
          )}
        </div>
        {k.fg?.length ? (
          <>
            <ul className="kt-fees">
              {k.fg.map(([label, fee]) => (
                <li key={label}>
                  <span>{label}</span>
                  <strong>AED {aed(fee)}</strong>
                </li>
              ))}
            </ul>
            <p className="kt-muted">Yearly tuition approved by KHDA for 2024-25. The school's fees for this year may be a little higher.</p>
          </>
        ) : (
          <p className="kt-muted">KHDA's file has no fees for this school.</p>
        )}
      </section>

      <p className="kt-credit">
        Source:{" "}
        <a href={KHDA_URL} target="_blank" rel="noreferrer">
          KHDA Dubai Private Schools Open Data ↗
        </a>{" "}
        · updated November 2025
      </p>
    </div>
  );
}
