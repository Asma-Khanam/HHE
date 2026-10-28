import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import { useApplicationData } from "../context/ApplicationDataContext";
import { fetchFamilyTimetable, fetchFamilyApplications } from "./timetableData";
import { fetchApplicationFees } from "./applicationFees";
import { fetchFamilyInvoices } from "./invoices";
import { hasAssessment, assessmentOf } from "./assessment";
import { toursOfRow, timeRange, formatTime } from "./tourDetails";
import { placedByChild, appClosed } from "./placement";
import { displayNameForChild } from "./completeness";

// Everything with a date that a family should see in one place: school tours,
// assessments, calls with the consultant, fees falling due, the start date of a
// confirmed place, and events a consultant switched on for the family. Meetings
// come from Calendly bookings (addendum 139 lets a family read their own).

export const KIND_META = {
  tour: { label: "Tour", tone: "tour" },
  assessment: { label: "Assessment", tone: "assess" },
  meeting: { label: "Meeting", tone: "meeting" },
  fee: { label: "Payment due", tone: "fee" },
  start: { label: "School start", tone: "start" },
  event: { label: "Reminder", tone: "event" },
};

const DUBAI = "Asia/Dubai";
const dayKeyOf = (ts) => new Date(ts).toLocaleDateString("en-CA", { timeZone: DUBAI });
const timeOf = (ts) => new Date(ts).toLocaleTimeString("en-GB", { timeZone: DUBAI, hour: "2-digit", minute: "2-digit" });
const money = (amount, currency) => {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `${currency || "AED"} ${n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};
const clock = (hhmm) => (hhmm ? formatTime(String(hhmm).slice(0, 5)) : "");

export function todayKey() {
  return new Date().toLocaleDateString("en-CA");
}

export function useFamilyCalendar() {
  const { familyId, data } = useApplicationData();
  const children = data?.children || [];
  const childKey = children.map((c) => c.id).join(",");
  const [remote, setRemote] = useState(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!familyId) return undefined;
    let alive = true;
    setFailed(false);
    (async () => {
      try {
        const childIds = childKey ? childKey.split(",") : [];
        const [{ shortlist }, apps, fees, invoices, placements, bookings] = await Promise.all([
          fetchFamilyTimetable(familyId),
          childIds.length ? fetchFamilyApplications(childIds).catch(() => []) : [],
          fetchApplicationFees().catch(() => []),
          fetchFamilyInvoices().catch(() => []),
          supabase.from("family_placements").select("id, child_id, school_name, start_date").eq("family_id", familyId)
            .then((r) => r.data || [], () => []),
          supabase.from("calendly_bookings").select("id, event_name, host_name, start_time, end_time, join_url, status")
            .eq("family_id", familyId).order("start_time", { ascending: true })
            .then((r) => r.data || [], () => []),
        ]);
        const names = {};
        (shortlist || []).forEach((r) => { if (r.school) names[r.school_id] = r.school.name; });
        const missing = [...new Set(apps.map((a) => a.school_id))].filter((id) => id && !names[id]);
        if (missing.length) {
          const { data: sch } = await supabase.from("schools").select("id, name").in("id", missing);
          (sch || []).forEach((x) => { names[x.id] = x.name; });
        }
        if (alive) setRemote({ shortlist: shortlist || [], apps, fees, invoices, placements, bookings, names });
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => { alive = false; };
  }, [familyId, childKey, retry]);

  const events = useMemo(() => {
    if (!remote) return null;
    const { shortlist, apps, fees, invoices, placements, bookings, names } = remote;
    const childName = (id) => {
      const i = children.findIndex((c) => c.id === id);
      return i >= 0 ? displayNameForChild(children[i], i) : "";
    };
    const placed = placedByChild(apps);
    const today = todayKey();
    const out = [];
    const push = (e) => e.date && out.push({ ...e, time: e.time || "", past: e.done || e.date < today });

    // School tours: every booked tour, the same as the Tours stage on Home.
    shortlist.forEach((row) => {
      toursOfRow(row).forEach((t) => {
        push({
          id: `tour-${t.key}`, kind: "tour", title: row.school?.name || "School tour",
          sub: row.school?.area || "", date: t.date, time: String(t.start || "").slice(0, 5),
          timeText: timeRange(t.start, t.end), done: t.status === "completed", tour: t,
          to: "/app/timetable", toLabel: "Tour details",
        });
      });
    });

    // Assessments.
    apps.forEach((a) => {
      if (a.status === "withdrawn" || !hasAssessment(a) || !a.assessment_date) return;
      if (appClosed(placed, a) && a.assessment_date >= today) return;
      const as = assessmentOf(a, { school: { name: names[a.school_id] }, childName: children.length > 1 ? childName(a.child_id) : "" });
      push({
        id: `assess-${a.id}`, kind: "assessment", title: names[a.school_id] || "School assessment",
        sub: [as.childName, as.mode === "in_person" ? "In person" : as.mode === "video" ? "Video" : "Online"].filter(Boolean).join(" · "),
        date: a.assessment_date, time: as.time || "", timeText: clock(as.time), link: as.link, linkLabel: "Join",
        to: "/app/timetable", toLabel: "Details",
      });
    });

    // Calls booked with the consultant.
    bookings.forEach((b) => {
      if (b.status === "canceled" || !b.start_time) return;
      push({
        id: `meet-${b.id}`, kind: "meeting", title: b.event_name || "Call with your consultant",
        sub: b.host_name ? `With ${b.host_name}` : "", date: dayKeyOf(b.start_time), time: timeOf(b.start_time),
        timeText: b.end_time ? `${clock(timeOf(b.start_time))} – ${clock(timeOf(b.end_time))}` : clock(timeOf(b.start_time)),
        link: b.join_url || "", linkLabel: "Join", done: b.end_time ? new Date(b.end_time) < new Date() : false,
      });
    });

    // Money falling due.
    (data?.payments || []).forEach((p) => {
      if (p.status !== "unpaid" || !p.due_date) return;
      push({ id: `pay-${p.id}`, kind: "fee", title: p.description || p.label || "Payment due", sub: money(p.amount, p.currency), date: p.due_date, to: "/app/billing", toLabel: "Billing" });
    });
    fees.forEach((f) => {
      if ((f.status === "paid" || f.paid_at || f.status === "waived") || !f.due_date) return;
      push({ id: `fee-${f.id}`, kind: "fee", title: f.label || "Application fee", sub: [f.application?.school?.name, money(f.amount, f.currency)].filter(Boolean).join(" · "), date: f.due_date, to: "/app/billing", toLabel: "Billing" });
    });
    invoices.forEach((i) => {
      if (i.status !== "open" || !i.due_date) return;
      push({ id: `inv-${i.id}`, kind: "fee", title: i.school_name ? `Invoice · ${i.school_name}` : "Invoice due", sub: money(i.amount, i.currency), date: i.due_date, link: i.hosted_invoice_url || "", linkLabel: "Pay", to: "/app/billing", toLabel: "Billing" });
    });

    // Start date of a confirmed place.
    placements.forEach((p) => {
      push({ id: `start-${p.id}`, kind: "start", title: `Starts at ${p.school_name}`, sub: childName(p.child_id), date: p.start_date, to: "/app/timetable", toLabel: "Your schools" });
    });

    // Events the consultant chose to show the family.
    (data?.events || []).forEach((e) => {
      if (e.status === "cancelled" || !e.starts_at) return;
      push({
        id: `ev-${e.id}`, kind: "event", title: e.title, sub: e.notes || "", date: e.all_day ? String(e.starts_at).slice(0, 10) : dayKeyOf(e.starts_at),
        time: e.all_day ? "" : timeOf(e.starts_at), timeText: e.all_day ? "" : clock(timeOf(e.starts_at)), done: e.status === "done",
      });
    });

    return out.sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  }, [remote, data?.payments, data?.events, children]);

  return { events, failed, retry: () => setRetry((n) => n + 1) };
}
