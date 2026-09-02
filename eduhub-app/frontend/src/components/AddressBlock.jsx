// One person's address — with the option to say "same as someone else's"
// instead of typing it out again.
//
// Added 2026-09-02 on founder feedback: separated parents don't share an
// address, and a child may live at one parent's address and not the other's,
// so a single household address on the family record wasn't enough. Most
// families still all live together though, so the common case has to stay a
// single click — hence the picker rather than three address boxes to fill.
//
// What gets STORED is always the resolved address text, not a pointer:
// `address_same_as` records which choice was made (so the picker comes back
// the way they left it, and the address follows along if the source changes),
// while `address` always holds the actual text. Anything reading the database
// directly — the founders' portal, an export — sees a real address either way.

export const ADDRESS_SOURCE_LABELS = {
  household: "Same as main household address",
  mother: "Same as Mother's address",
  father: "Same as Father's address",
};

export function resolveAddress(sameAs, sources) {
  if (!sameAs) return "";
  return sources?.[sameAs] || "";
}

export default function AddressBlock({
  label = "Address",
  hint,
  sameAs,
  address,
  options = [],
  onChangeSameAs,
  onChangeAddress,
  fieldKey,
}) {
  const usingSource = !!sameAs;

  return (
    <div className="hh-field hh-field-full address-block" data-field-key={fieldKey}>
      <label>{label}</label>
      <select
        className="address-block-source"
        value={sameAs || "__own__"}
        onChange={(e) => {
          const next = e.target.value;
          onChangeSameAs(next === "__own__" ? "" : next);
        }}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {ADDRESS_SOURCE_LABELS[opt]}
          </option>
        ))}
        <option value="__own__">A different address</option>
      </select>

      {usingSource ? (
        // Read-only on purpose: this address belongs to whoever it was
        // copied from, so it's edited there, in one place, not in two.
        <textarea
          rows={2}
          className="address-block-mirror"
          value={address || ""}
          readOnly
          placeholder="Fill in the address it's copied from and it'll appear here."
        />
      ) : (
        <textarea rows={2} value={address || ""} onChange={(e) => onChangeAddress(e.target.value)} />
      )}

      {hint && <span className="hh-hint-text">{hint}</span>}
    </div>
  );
}
