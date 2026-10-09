/* 아침 알림 발송. GitHub Actions(.github/workflows/morning.yml)가 평일 아침 10분마다 실행한다.
   각 사용자의 알림 시각이 지났고 오늘 아직 보내지 않았으며 오늘이 근무일이면, 행사 상태를 계산해 등록된 기기로 보낸다.
   저장소가 공개이면 실행 기록도 공개되므로, 기록에는 행사명·담당자 같은 내용을 남기지 않는다. */
const admin = require("firebase-admin");
const webpush = require("web-push");
const L = require("../logic.js");

const FORCE = process.env.FORCE === "true";
const APP_URL = process.env.APP_URL || "./";

function kstNow() {
  const p = {};
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date()).forEach((x) => { p[x.type] = x.value; });
  return { date: p.year + "-" + p.month + "-" + p.day, time: p.hour + ":" + p.minute };
}

async function main() {
  for (const k of ["FIREBASE_SERVICE_ACCOUNT", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]) {
    if (!process.env[k]) throw new Error("GitHub 저장소 Secrets 에 " + k + " 가 없습니다. 설치 안내 5단계를 확인하십시오.");
  }
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  webpush.setVapidDetails(APP_URL.startsWith("https://") ? APP_URL : "mailto:noreply@example.com", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const db = admin.firestore();
  const now = kstNow(), today = now.date;
  console.log("한국 시간 " + today + " " + now.time + (FORCE ? " (수동 실행: 시각·요일 무시)" : ""));

  const users = await db.collection("users").listDocuments();
  for (const u of users) {
    const cfg = (await u.collection("config").doc("main").get()).data() || {};
    const extra = Array.isArray(cfg.extraHolidays) ? cfg.extraHolidays : [];
    const at = cfg.notifyAt || "08:20";
    const stateRef = u.collection("config").doc("notify");
    if (!FORCE) {
      if (L.makeCal(extra).off(today)) { console.log("오늘은 주말·공휴일·휴무일이므로 보내지 않습니다."); continue; }
      if (now.time < at) { console.log("알림 시각(" + at + ") 전입니다."); continue; }
      const st = (await stateRef.get()).data() || {};
      if (st.lastSent === today) { console.log("오늘 알림은 이미 보냈습니다."); continue; }
    }
    const subs = await u.collection("push").get();
    if (subs.empty) { console.log("알림을 켠 기기가 없습니다."); continue; }
    const events = (await u.collection("events").get()).docs.map((d) => Object.assign({}, d.data(), { id: d.id })).filter((e) => e.start && e.name);
    if (!events.length && !FORCE) { console.log("등록된 행사가 없습니다."); continue; }

    const m = L.morningSummary(events, extra, today, 4);
    const payload = JSON.stringify({
      title: "D-day 수첩 · " + L.fmt(today),
      body: [events.length ? m.headline : "등록된 행사가 없습니다."].concat(m.lines).join("\n"),
      url: APP_URL,
      tag: "morning-" + today
    });
    let sent = 0;
    for (const d of subs.docs) {
      try {
        await webpush.sendNotification(d.data().sub, payload, { TTL: 6 * 3600, urgency: "high" });
        sent++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) { await d.ref.delete(); console.log("만료된 기기 등록 1건을 지웠습니다."); }
        else console.error("발송 실패: " + (e.statusCode || "") + " " + (e.body || e.message));
      }
    }
    console.log("행사 " + events.length + "건, 기기 " + subs.size + "대 중 " + sent + "대에 보냈습니다. (오늘 " + m.counts.today + ", 지연 " + m.counts.late + ", 마지노선 " + m.counts.crit + ")");
    if (sent && !FORCE) await stateRef.set({ lastSent: today, sentAt: new Date().toISOString() }, { merge: true });
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
