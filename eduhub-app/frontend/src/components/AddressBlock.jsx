// One person's address, with a tick to reuse someone else's instead of typing
// it out twice.
//
// Founder feedback 2026-09-02, then refined the same day: there is no single
// household address any more. Separated parents don't share one, and a child
// may live with only one of them, so the address belongs to the person. The
// common case — everyone at the same address — stays one tick.
//
// What gets STORED is always the resolved address text, never a pointer:
// `address_same_as` records whose address it was copied from (so the tick
// comes back ticked, and the address follows if the source is edited later),
// while `address` always holds the actual text. Anything reading the database
// directly sees a real address either way.

export function resolveAddress(sameAs, sources) {
  if (!sameAs) return "";
  return sources?.[sameAs] || "";
}

export default function AddressBlock({
  label = "Address",
  hint,
  sameAs,
  address,
  // [{ key: "mother", label: "Same as Mother's address" }, ...] — only the
  // people who can actually be copied from in this position.
  sources = [],
  onChangeSameAs,
  onChangeAddress,
  fieldKey,
  error = false,
  required = false,
}) {
  const copied = !!sameAs;

  return (
    <div
      className={"hh-field hh-field-full address-block" + (error ? " hh-field-error" : "")}
      data-field-key={fieldKey}
    >
      <label>
        {label}
        {required && " *"}
      </label>

      {sources.length > 0 && (
        <div className="address-ticks">
          {sources.map((source) => (
            <label key={source.key} className="address-tick">
              <input
                type="checkbox"
                checked={sameAs === source.key}
                // Ticking one source unticks the other — an address can only
                // be copied from one person, so these behave as a choice even
                // though they read as ticks.
                onChange={(e) => onChangeSameAs(e.target.checked ? source.key : "")}
              />
              <span>{source.label}</span>
            </label>
          ))}
        </div>
      )}

      {copied ? (
        // Read-only on purpose: this address belongs to whoever it was copied
        // from, so it's edited there, in one place, not in two.
        <textarea
          rows={2}
          className="address-block-mirror"
          value={address || ""}
          readOnly
          placeholder="Fill the address in on their section and it'll appear here."
        />
      ) : (
        <textarea rows={2} value={address || ""} onChange={(e) => onChangeAddress(e.target.value)} />
      )}

      {error ? (
        <span className="hh-error-text">This field is required.</span>
      ) : (
        hint && <span className="hh-hint-text">{hint}</span>
      )}
    </div>
  );
}
