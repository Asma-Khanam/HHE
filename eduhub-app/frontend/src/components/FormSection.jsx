import "./FormSection.css";

// A titled white card, matching the sectioned layout of the reference forms
// (General Info, Current School Details, etc). Every section of the
// application uses this same wrapper.
export default function FormSection({ title, description, children, action }) {
  return (
    <section className="hh-form-section">
      <div className="hh-form-section-header">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      <div className="hh-form-section-grid">{children}</div>
    </section>
  );
}
