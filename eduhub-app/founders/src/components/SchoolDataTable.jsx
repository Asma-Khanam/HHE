import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { updateSchool, friendlyError } from "../lib/staffData";
import { EMIRATE_CHOICES } from "../data/emirates";
import { STAGE_PRESETS, stageOf } from "../lib/schoolStages";
import { KHDA_RATINGS, isDubai } from "../lib/schoolFacts";
import "./SchoolDataTable.css";

// Fill in school details straight down a list (Schools > Fill in details). The Suggested schools
// list is only as good as these records, so this is the quick way to fill the gaps: change a cell
// and it saves. A row stays in view after you fill it, even while a "Missing" filter is on, until
// you change the filter or the search.
const LEVELS = [
  ["", "—"],
  ["none", "None"],
  ["limited", "Limited"],
  ["moderate", "Moderate"],
  ["extensive", "Extensive"],
];
const CURRICULA = ["British", "IB", "British & IB", "American", "American & IB", "Indian (CBSE)", "Indian (ICSE)", "French", "UAE National"];

const FIELDS = [
  { key: "fees", label: "Fees", missing: (s) => s.tuition_from == null },
  { key: "area", label: "Area", missing: (s) => !s.area },
  { key: "curriculum", label: "Curriculum", missing: (s) => !s.curriculum },
  { key: "years", label: "Year groups", missing: (s) => !s.lowest_year_group || !s.highest_year_group },
  { key: "inclusion", label: "Inclusion", missing: (s) => !s.inclusion_level },
  { key: "emirate", label: "Emirate", missing: (s) => !s.emirate },
  // KHDA only inspects Dubai schools (ratings filled from KHDA by addendum 167).
  { key: "khda", label: "KHDA", missing: (s) => isDubai(s) && !s.khda_rating },
];
const missingOf = (s) => FIELDS.filter((f) => f.missing(s)).map((f) => f.key);

const numOrNull = (v) => {
  const n = String(v ?? "").replace(/,/g, "").trim();
  return n === "" || Number.isNaN(Number(n)) ? null : Number(n);
};

export default function SchoolDataTable({ schools, onSchoolChange }) {
  const [filter, setFilter] = useState("any"); // all | any | a field key
  const [search, setSearch] = useState("");
  const [rowState, setRowState] = useState({}); // id -> "saving" | "saved" | error text
  // The rows that matched when the filter was chosen, so a row doesn't vanish as you fill it.
  const [matchIds, setMatchIds] = useState(null);
  const latest = useRef(schools);
  latest.current = schools;

  useEffect(() => {
    const q = search.trim().toLowerCase();
    const ids = latest.current
      .filter((s) => {
        if (q && !`${s.name} ${s.area || ""} ${s.curriculum || ""}`.toLowerCase().includes(q)) return false;
        const miss = missingOf(s);
        if (filter === "all") return true;
        if (filter === "any") return miss.length > 0;
        return miss.includes(filter);
      })
      .map((s) => s.id);
    setMatchIds(new Set(ids));
  }, [filter, search]);

  const counts = useMemo(() => {
    const c = { any: 0 };
    for (const f of FIELDS) c[f.key] = 0;
    for (const s of schools) {
      const m = missingOf(s);
      if (m.length) c.any += 1;
      m.forEach((k) => (c[k] += 1));
    }
    return c;
  }, [schools]);

  async function save(school, patch) {
    setRowState((r) => ({ ...r, [school.id]: "saving" }));
    try {
      await updateSchool(school.id, patch);
      onSchoolChange(school.id, patch);
      setRowState((r) => ({ ...r, [school.id]: "saved" }));
    } catch (err) {
      setRowState((r) => ({ ...r, [school.id]: friendlyError(err, "Couldn't save.") }));
    }
  }

  const text = (school, key, patchKey, extra = {}) => (
    <input
      key={`${school.id}-${key}-${school[patchKey] ?? ""}`}
      className="sdt-in"
      defaultValue={school[patchKey] ?? ""}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v !== String(school[patchKey] ?? "")) save(school, { [patchKey]: v || null });
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      {...extra}
    />
  );
  const num = (school, patchKey, placeholder) => (
    <input
      key={`${school.id}-${patchKey}-${school[patchKey] ?? ""}`}
      className="sdt-in sdt-num"
      inputMode="numeric"
      placeholder={placeholder}
      defaultValue={school[patchKey] ?? ""}
      onBlur={(e) => {
        const v = numOrNull(e.target.value);
        if (v !== (school[patchKey] == null ? null : Number(school[patchKey]))) save(school, { [patchKey]: v });
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );

  const shown = matchIds ? schools.filter((s) => matchIds.has(s.id)) : [];

  return (
    <div className="sdt">
      <div className="sdt-bar">
        <div className="sdt-chips" role="tablist" aria-label="Show">
          <button type="button" className={"sdt-chip" + (filter === "any" ? " is-on" : "")} onClick={() => setFilter("any")}>
            Missing anything <span>{counts.any}</span>
          </button>
          {FIELDS.map((f) => (
            <button key={f.key} type="button" className={"sdt-chip" + (filter === f.key ? " is-on" : "")} onClick={() => setFilter(f.key)}>
              {f.label} <span>{counts[f.key]}</span>
            </button>
          ))}
          <button type="button" className={"sdt-chip" + (filter === "all" ? " is-on" : "")} onClick={() => setFilter("all")}>
            All schools <span>{schools.length}</span>
          </button>
        </div>
        <input className="families-search" type="search" placeholder="Search schools…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <p className="sdt-hint">
        Change a cell and it saves. Fees are the lowest and highest yearly tuition across year groups, in AED. Press Enter to finish a
        cell. KHDA ratings are for Dubai schools only and come from KHDA's
        school data.
      </p>

      <div className="sdt-wrap">
        <table className="sdt-table">
          <thead>
            <tr>
              <th>School</th>
              <th>Emirate</th>
              <th>Area</th>
              <th>Curriculum</th>
              <th>Fees from</th>
              <th>Fees to</th>
              <th>Year groups</th>
              <th>Inclusion</th>
              <th>KHDA rating</th>
              <th aria-label="Status" />
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => {
              const st = rowState[s.id];
              const miss = missingOf(s);
              return (
                <tr key={s.id}>
                  <td className="sdt-name">
                    <Link to={`/staff/schools/${s.id}`}>{s.name}</Link>
                  </td>
                  <td>
                    <select
                      className={"sdt-in" + (!s.emirate ? " is-empty" : "")}
                      value={s.emirate || ""}
                      onChange={(e) => save(s, { emirate: e.target.value || null })}
                    >
                      <option value="">—</option>
                      {EMIRATE_CHOICES.map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{text(s, "area", "area", { placeholder: "Area" })}</td>
                  <td>{text(s, "curriculum", "curriculum", { placeholder: "Curriculum", list: "sdt-curricula" })}</td>
                  <td>{num(s, "tuition_from", "e.g. 45000")}</td>
                  <td>{num(s, "tuition_to", "e.g. 78000")}</td>
                  <td>
                    <select
                      className={"sdt-in" + (!stageOf(s) ? " is-empty" : "")}
                      value={stageOf(s)}
                      onChange={(e) => {
                        const hit = STAGE_PRESETS.find(([l]) => l === e.target.value);
                        save(s, hit ? { lowest_year_group: hit[1], highest_year_group: hit[2] } : { lowest_year_group: null, highest_year_group: null });
                      }}
                    >
                      <option value="">—</option>
                      {STAGE_PRESETS.map(([l]) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                      {stageOf(s) === "custom" && <option value="custom">Custom (edit on the school)</option>}
                    </select>
                  </td>
                  <td>
                    <select
                      className={"sdt-in" + (!s.inclusion_level ? " is-empty" : "")}
                      value={s.inclusion_level || ""}
                      onChange={(e) => save(s, { inclusion_level: e.target.value || null })}
                    >
                      {LEVELS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {isDubai(s) || !s.emirate ? (
                      <select
                        className={"sdt-in" + (!s.khda_rating ? " is-empty" : "")}
                        value={s.khda_rating || ""}
                        onChange={(e) => save(s, { khda_rating: e.target.value || null })}
                      >
                        <option value="">—</option>
                        {KHDA_RATINGS.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="sdt-na">Not Dubai</span>
                    )}
                  </td>
                  <td className="sdt-status">
                    {st === "saving" ? (
                      <span className="sdt-saving">Saving…</span>
                    ) : st && st !== "saved" ? (
                      <span className="sdt-err" title={st}>Not saved</span>
                    ) : miss.length === 0 ? (
                      <span className="sdt-done" title="Everything the suggestions use is filled in">✓</span>
                    ) : (
                      <span className="sdt-left" title={`Still missing: ${miss.join(", ")}`}>{miss.length} left</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {matchIds && shown.length === 0 && <p className="sdt-empty">Nothing missing here. Every school in this view is filled in.</p>}
      </div>
      <datalist id="sdt-curricula">
        {CURRICULA.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </div>
  );
}
