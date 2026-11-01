// Runs every 15 minutes on a schedule and sends quest reminders at each person's own local time.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const WINDOW_MINUTES = 30;
const PHOTO_KEEP_DAYS = 60;

function localNow(tz: string) {
  let zone = tz;
  try { new Intl.DateTimeFormat("en-CA", { timeZone: zone }); } catch { zone = "UTC"; }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
function isDue(nowMinutes: number, at: string) {
  const [h, m] = at.split(":").map(Number);
  const diff = nowMinutes - (h * 60 + m);
  return diff >= 0 && diff < WINDOW_MINUTES;
}
// The same roll as specialRoll() in public/app.js, so the morning message matches what the app offers.
function specialRoll(seed: string, day: string) {
  let h = 2166136261;
  for (const ch of `${seed}:${day}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h / 4294967296;
}
function offersSpecial(summary: Record<string, unknown> | null, today: string) {
  const last = String(summary?.lastOfferOn || "");
  const overdueOn = new Date(`${today}T12:00:00Z`);
  overdueOn.setUTCDate(overdueOn.getUTCDate() - 4);
  return !last || last <= overdueOn.toISOString().slice(0, 10) || specialRoll(String(summary?.seed || ""), today) < 0.35;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return new Response("Not allowed", { status: 401 });

  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")!, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: prefs, error } = await db.from("notification_prefs").select("*").eq("enabled", true);
  if (error) { console.error(error); return new Response("Could not read reminders", { status: 500 }); }

  let sent = 0;
  for (const p of prefs ?? []) {
    const now = localNow(p.tz);
    const summary = p.summary as Record<string, unknown> | null;
    const known = summary?.day === now.date;
    let msg: { title: string; body: string; tag: string; url: string } | null = null;
    const update: Record<string, string> = {};

    if (p.last_morning_on !== now.date && isDue(now.minutes, p.morning)) {
      update.last_morning_on = now.date;
      const special = offersSpecial(summary, now.date) ? " A Special Quest is also available today." : "";
      msg = { title: "QUEST INFO", body: `[Daily Quest has arrived.] Complete it before midnight.${special}`, tag: "morning", url: "/#today" };
    } else if (p.last_evening_on !== now.date && isDue(now.minutes, p.evening)) {
      update.last_evening_on = now.date;
      const left = known ? Number(summary?.left || 0) : null;
      const finished = known && (left === 0 || summary?.rest === true);
      if (!finished) {
        const what = left ? `${left} required quest${left === 1 ? "" : "s"} left.` : "Your required quests are not done.";
        msg = { title: "WARNING", body: `${what} Finish before midnight or enter the Penalty Zone.`, tag: "evening", url: "/#today" };
      }
    }
    if (!Object.keys(update).length) continue;
    await db.from("notification_prefs").update(update).eq("user_id", p.user_id);
    if (!msg) continue;

    const { data: subs } = await db.from("push_subscriptions").select("*").eq("user_id", p.user_id);
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg));
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        else console.error("Push failed", status);
      }
    }
  }
  // Keeps photos inside the free storage allowance.
  const { data: expired } = await db.rpc("expired_proofs", { keep_days: PHOTO_KEEP_DAYS, max_rows: 200 });
  if (expired?.length) await db.storage.from("proofs").remove(expired as string[]);

  return new Response(JSON.stringify({ sent, removedPhotos: expired?.length ?? 0 }), { headers: { "Content-Type": "application/json" } });
});
