import AutosaveField from "./Autosave";
import CopyButton from "./CopyButton";
import "./OverviewPanel.css";

// One editable line of a record: shows the value with a copy icon; click it
// to change it. Saves itself (Enter or clicking away).
export default function EditableLine({ value, onSave, placeholder, type = "text", strong = false, icon }) {
  return (
    <div className={"el" + (strong ? " is-strong" : "")}>
      {icon === "mail" && <span className="el-icon" aria-hidden="true">✉</span>}
      {icon === "phone" && <span className="el-icon" aria-hidden="true">☎</span>}
      <div className="el-main">
        <AutosaveField bare collapsible type={type} placeholder={placeholder} value={value || ""} onSave={onSave} />
      </div>
      <CopyButton text={value} />
    </div>
  );
}
