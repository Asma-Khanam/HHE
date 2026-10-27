import { useState } from "react";
import { getThemePreference, setThemePreference } from "../lib/theme";
import "./ThemePicker.css";

const OPTIONS = [
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
  { key: "auto", label: "Automatic", hint: "Matches your iPhone" },
];

// Appearance: Light, Dark, or Automatic (follows the phone). Remembered on the device.
export default function ThemePicker() {
  const [pref, setPref] = useState(getThemePreference);
  const current = OPTIONS.find((o) => o.key === pref);
  return (
    <div className="theme-picker">
      <h3>Appearance</h3>
      <div className="theme-picker-seg" role="radiogroup" aria-label="Appearance">
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={pref === o.key}
            className={"theme-picker-opt" + (pref === o.key ? " is-on" : "")}
            onClick={() => {
              setPref(o.key);
              setThemePreference(o.key);
            }}
          >
            <span className={"theme-picker-swatch theme-picker-swatch--" + o.key} aria-hidden="true" />
            {o.label}
          </button>
        ))}
      </div>
      {current?.hint && <p className="theme-picker-hint">{current.hint}</p>}
    </div>
  );
}
