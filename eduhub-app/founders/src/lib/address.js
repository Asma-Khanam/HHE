// The household address for a family. families.home_address is only kept in
// step by the family's own saves, so an address added later (or edited by a
// consultant on a parent) never reached the Overview. Read it from the
// account holder's own address first, then the stored household address,
// then whichever parent has one.
export function householdAddress(family, parents) {
  const list = parents || [];
  const holder = list.find((p) => p.user_id && p.user_id === family?.account_user_id);
  const candidates = [holder?.address, family?.home_address, ...list.map((p) => p.address)];
  for (const c of candidates) {
    if (c && String(c).trim()) return String(c).trim();
  }
  return "";
}
