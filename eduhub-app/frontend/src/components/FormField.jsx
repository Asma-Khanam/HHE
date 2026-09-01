// Reusable labeled input, used across the whole application form. Keeping
// this in one place means every field looks and behaves the same way.
export default function FormField({
  label,
  type = "text",
  value,
  onChange,
  required = false,
  hint,
  as = "input",
  error = false,
  fieldKey,
  ...rest
}) {
  const Tag = as;
  return (
    <div className={"hh-field" + (error ? " hh-field-error" : "")} data-field-key={fieldKey}>
      <label>
        {label}
        {required && " *"}
      </label>
      <Tag
        type={as === "input" ? type : undefined}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        {...rest}
      />
      {error ? (
        <span className="hh-error-text">This field is required.</span>
      ) : (
        hint && <span className="hh-hint-text">{hint}</span>
      )}
    </div>
  );
}
