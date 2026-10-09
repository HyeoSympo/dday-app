/* 화면. 날짜 계산은 logic.js(전역 함수)에, 저장은 store.js 에 있다. */
import { createStore } from "./store.js";
import { vapidPublicKey } from "./config.js";

const state = { today: null, user: null, events: [], extra: [], notifyAt: "08:20", loaded: { events: false }, open: {}, tab: "today", confirm: null, store: null, unsub: [] };
const TYPE = { pharma: "의약품", device: "의료기기", nurse: "간호사 대상" };
const $ = (id) => document.getElementById(id);
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function kstToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function notice(msg) { const n = $("notice"); n.textContent = msg || ""; n.hidden = !msg; }
function dLabel(ev, t) {
  const E = ev.end || ev.start;
  if (t < ev.start) return "D-" + diffDays(ev.start, t);
  if (t <= E) return "D-day";
  return "D+" + diffDays(t, E);
}
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

/* 저장 실패는 한곳에서 안내한다. 같은 문서에 대한 쓰기는 순서대로 보낸다. */
const queues = {};
function write(path, fn) {
  const p = (queues[path] || Promise.resolve()).then(fn).catch((e) => {
    console.error(e);
    notice(e && e.code === "permission-denied" ? "이 계정에는 저장 권한이 없습니다. Firestore 보안 규칙을 확인하십시오." : "저장하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도하십시오.");
  });
  queues[path] = p; return p;
}

function whenText(s, st) {
  if (st.k === "done") return "완료 " + fmt(st.on);
  if (st.k === "crit") return st.over > 0 ? "마지노선 " + fmt(s.hard) + "에서 " + st.over + "일 지남" : "오늘이 마지노선";
  if (st.k === "late") return "지연 " + st.days + "일째" + (st.toHard !== null && st.toHard > 0 ? ", 마지노선까지 " + st.toHard + "일" : "");
  if (st.k === "today") return st.last ? "오늘이 마지노선" : "오늘";
  if (st.k === "open") return s.due ? "늦어도 " + fmt(s.due) : s.hard ? "늦어도 " + fmt(s.hard) : "진행 가능";
  if (s.due) return fmt(s.due) + ", " + st.inDays + "일 후";
  return s.hard ? "늦어도 " + fmt(s.hard) : "선행 단계 대기";
}
function rowHtml(ev, s, st, pre) {
  const sub = [], cp = isCp(s);
  if (cp) sub.push('<span class="chip cp">CP 증빙</span>');
  if (st.blocked && st.blocked.length) sub.push("<span>선행 " + st.blocked.join(", ") + "번 미완료</span>");
  if (s.note) sub.push("<span>" + esc(s.note) + "</span>");
  const ctl = s.decide && st.k !== "done"
    ? '<div class="mini"><button class="btn small" type="button" data-act="kick" data-ev="' + esc(ev.id) + '" data-v="yes">진행</button><button class="btn small" type="button" data-act="kick" data-ev="' + esc(ev.id) + '" data-v="no">생략</button></div>' : "";
  const cid = "c-" + pre + "-" + ev.id + "-" + s.id;
  return '<li class="row st-' + st.k + (cp ? " cp" : "") + '">' +
    (s.decide ? "<span></span>" : '<input type="checkbox" id="' + esc(cid) + '" data-act="toggle" data-ev="' + esc(ev.id) + '" data-step="' + esc(s.id) + '"' + (st.k === "done" ? " checked" : "") + ' aria-label="' + esc(s.title) + ' 완료">') +
    '<span class="num">' + esc(s.id) + "</span>" +
    '<div class="what"><span class="title">' + esc(s.title) + "</span>" + (sub.length ? '<div class="sub">' + sub.join("") + "</div>" : "") + ctl + "</div>" +
    '<span class="when">' + esc(whenText(s, st)) + "</span></li>";
}

function metaHtml(ev) {
  const E = ev.end || ev.start, range = ev.start.replace(/-/g, ".") + "(" + DOW[dow(ev.start)] + ")" + (E !== ev.start ? " ~ " + fmt(E) : "");
  const a = ["<span>" + esc(range) + "</span>", '<span class="chip">' + esc(TYPE[ev.type] || "") + "</span>"];
  if (ev.hotel) a.push("<span>" + esc(ev.hotel) + "</span>");
  if (ev.pm) a.push("<span>PM " + esc(ev.pm) + (ev.pmOrg ? " (" + esc(ev.pmOrg) + ")" : "") + "</span>");
  if (ev.head === "yes") a.push("<span>소장 " + esc(ev.headName || "미입력") + (ev.headOrg ? " (" + esc(ev.headOrg) + ")" : "") + "</span>");
  else if (ev.head === "no") a.push("<span>담당 소장 없음</span>");
  return a.join("");
}

function renderToday() {
  const t = state.today, box = $("todayBody"), tot = { crit: 0, today: 0, late: 0 };
  const blocks = state.events.map((ev) => {
    const g = todayGroups(ev, state.extra, t).g;
    tot.crit += g.crit.length; tot.today += g.today.length; tot.late += g.late.length;
    return { ev, g };
  });
  $("counts").innerHTML = !state.user ? "" :
    '<div class="cell"><dt>오늘 할 일</dt><dd>' + tot.today + "</dd></div>" +
    '<div class="cell' + (tot.late ? " is-late" : "") + '"><dt>지연</dt><dd>' + tot.late + "</dd></div>" +
    '<div class="cell' + (tot.crit ? " is-crit" : "") + '"><dt>마지노선</dt><dd>' + tot.crit + "</dd></div>";
  if (!state.loaded.events) return;
  if (!state.events.length) {
    box.innerHTML = '<div class="empty"><strong>등록된 행사가 없습니다.</strong><span>행사 탭에서 행사일과 유형을 입력하면, 호텔 정보 요청부터 비용 요약 전달까지의 할 일이 날짜와 함께 만들어집니다.</span></div>';
    return;
  }
  box.innerHTML = '<div class="tevs">' + blocks.map((b) => {
    const ev = b.ev;
    let inner = GROUP_ORDER.map((o) => {
      const list = b.g[o[0]]; if (!list.length) return "";
      return '<div class="group g-' + o[0] + '"><h3>' + o[1] + '<span class="n">' + list.length + '</span></h3><ul class="rows">' +
        list.map((i) => rowHtml(ev, i.s, i.st, "t")).join("") + "</ul></div>";
    }).join("");
    if (!inner) inner = '<p class="help">오늘 챙길 일과 7일 이내에 예정된 일이 없습니다.</p>';
    return '<article class="tev"><header class="tev-head"><span class="dday">' + dLabel(ev, t) + '</span><div><h2 class="name">' + esc(ev.name) +
      '</h2><div class="meta">' + metaHtml(ev) + "</div></div></header>" + inner + "</article>";
  }).join("") + "</div>";
}

function renderEvents() {
  const t = state.today, box = $("eventList");
  if (!state.loaded.events) return;
  if (!state.events.length) {
    box.innerHTML = '<div class="empty"><strong>첫 행사를 등록해 보십시오.</strong><span>행사명, 시작일, 유형만 있으면 됩니다. 호텔별 기한은 호텔 회신을 받은 뒤 수정에서 넣을 수 있습니다.</span></div>';
    return;
  }
  box.innerHTML = '<div class="group">' + state.events.map((ev) => {
    const plan = buildPlan(ev, state.extra);
    let nDone = 0, rows = "", phase = "";
    plan.forEach((s) => {
      const st = stepStatus(s, ev, t, plan);
      if (st.k === "done") nDone++;
      if (s.phase !== phase) { phase = s.phase; rows += '<li class="phase">' + (phase === "pre" ? "행사 전" : "행사 후") + "</li>"; }
      rows += rowHtml(ev, s, st, "e");
    });
    const del = state.confirm === ev.id
      ? '<button class="btn small danger" type="button" data-act="delyes" data-ev="' + esc(ev.id) + '">삭제 확정</button><button class="btn small" type="button" data-act="delno">취소</button>'
      : '<button class="btn small danger" type="button" data-act="del" data-ev="' + esc(ev.id) + '">삭제</button>';
    return '<details class="ev" data-ev="' + esc(ev.id) + '"' + (state.open[ev.id] ? " open" : "") + "><summary>" +
      '<span class="dday">' + dLabel(ev, t) + "</span>" +
      '<div><div class="name">' + esc(ev.name) + '</div><div class="meta">' + metaHtml(ev) + "</div></div>" +
      '<span class="prog">' + plan.length + "개 중 " + nDone + "개 완료</span></summary>" +
      '<div class="inner"><ul class="rows">' + rows + '</ul><div class="tools"><button class="btn small" type="button" data-act="edit" data-ev="' + esc(ev.id) + '">행사 수정</button>' + del + "</div></div></details>";
  }).join("") + "</div>";
}

function renderHolidays() {
  const box = $("holidayList");
  if (!state.extra.length) { box.innerHTML = '<p class="help">추가한 휴무일이 없습니다.</p>'; return; }
  box.innerHTML = '<ul class="rows">' + state.extra.slice().sort().map((d) =>
    '<li class="row"><span></span><span class="num">' + d.slice(2, 4) + '</span><div class="what"><span class="title">' + fmt(d) + '</span></div><button class="btn small danger" type="button" data-act="hdel" data-d="' + d + '">삭제</button></li>'
  ).join("") + "</ul>";
}

function render() {
  const t = state.today;
  const p = t.split("-").map(Number);
  $("todayLine").textContent = p[1] + "월 " + p[2] + "일 " + DOW[dow(t)] + "요일";
  renderToday(); renderEvents(); renderHolidays();
  if ($("notifyAt").value !== state.notifyAt) $("notifyAt").value = state.notifyAt;
}
function setTab(tab) {
  state.tab = tab;
  ["today", "events", "settings"].forEach((k) => {
    $("view-" + k).hidden = k !== tab;
    $("tab-" + k).setAttribute("aria-selected", k === tab ? "true" : "false");
  });
  lsSet("dday.tab", tab);
  if (tab === "settings") renderPush();
}

function eventById(id) { return state.events.find((e) => e.id === id) || null; }

function openForm(ev) {
  $("evId").value = ev ? ev.id : "";
  $("evName").value = ev ? ev.name : ""; $("evHotel").value = ev ? ev.hotel || "" : "";
  $("evStart").value = ev ? ev.start : ""; $("evEnd").value = ev && ev.end && ev.end !== ev.start ? ev.end : "";
  $("evType").value = ev ? ev.type : "pharma"; $("evKickoff").value = ev ? ev.kickoff || "ask" : "ask";
  $("evEarly").value = ev ? ev.earlyStart || "" : ""; $("evDue14").value = ev ? ev.due14 || "" : "";
  $("evDue21").value = ev ? ev.due21 || "" : ""; $("evDeposit").value = ev ? ev.depositDate || "" : "";
  $("evPm").value = ev ? ev.pm || "" : ""; $("evPmOrg").value = ev ? ev.pmOrg || "" : "";
  $("evHead").value = ev ? ev.head || "" : ""; $("evHeadName").value = ev ? ev.headName || "" : ""; $("evHeadOrg").value = ev ? ev.headOrg || "" : "";
  $("headFields").hidden = $("evHead").value !== "yes";
  $("depositField").hidden = $("evType").value !== "pharma";
  $("evErr").hidden = true; $("eventForm").hidden = false; $("evName").focus();
  $("eventForm").scrollIntoView({ block: "start", behavior: "smooth" });
}

document.addEventListener("click", (e) => {
  const tab = e.target.closest(".tab"); if (tab) { setTab(tab.dataset.tab); return; }
  const b = e.target.closest("button[data-act]"); if (!b || !state.store) return;
  const act = b.dataset.act, st = state.store, ev = b.dataset.ev ? eventById(b.dataset.ev) : null;
  if (act === "kick" && ev) { write("events/" + ev.id, () => st.patchEvent(ev.id, { kickoff: b.dataset.v })); }
  else if (act === "edit" && ev) { openForm(ev); }
  else if (act === "del") { state.confirm = b.dataset.ev; renderEvents(); }
  else if (act === "delno") { state.confirm = null; renderEvents(); }
  else if (act === "delyes") { const id = b.dataset.ev; state.confirm = null; write("events/" + id, () => st.deleteEvent(id)); }
  else if (act === "hdel") {
    state.extra = state.extra.filter((d) => d !== b.dataset.d);
    write("config", () => st.saveConfig({ extraHolidays: state.extra }));
    render();
  }
});
document.addEventListener("change", (e) => {
  const c = e.target; if (!c.dataset || c.dataset.act !== "toggle" || !state.store) return;
  const ev = eventById(c.dataset.ev); if (!ev) return;
  const on = c.checked ? state.today : null;
  write("events/" + ev.id, () => state.store.setDone(ev.id, c.dataset.step, on));
});
document.addEventListener("toggle", (e) => {
  const d = e.target; if (d.classList && d.classList.contains("ev")) state.open[d.dataset.ev] = d.open;
}, true);

$("btnNewEvent").addEventListener("click", () => openForm(null));
$("evCancel").addEventListener("click", () => { $("eventForm").hidden = true; });
$("evHead").addEventListener("change", function () { $("headFields").hidden = this.value !== "yes"; });
$("evType").addEventListener("change", function () { $("depositField").hidden = this.value !== "pharma"; });
$("eventForm").addEventListener("submit", (e) => {
  e.preventDefault(); if (!state.store) return;
  const name = $("evName").value.trim(), start = $("evStart").value, end = $("evEnd").value || start, err = $("evErr");
  if (!name || !start) { err.textContent = "행사명과 시작일을 입력하십시오."; err.hidden = false; return; }
  if (end < start) { err.textContent = "종료일이 시작일보다 빠릅니다."; err.hidden = false; return; }
  const head = $("evHead").value;
  if (!head) { err.textContent = "담당 소장이 있는 행사인지 선택하십시오."; err.hidden = false; return; }
  const type = $("evType").value;
  const old = $("evId").value ? eventById($("evId").value) : null;
  const id = old ? old.id : state.store.newId();
  const data = {
    name, hotel: $("evHotel").value.trim(), pm: $("evPm").value.trim(), pmOrg: $("evPmOrg").value.trim(),
    head, headName: head === "yes" ? $("evHeadName").value.trim() : "", headOrg: head === "yes" ? $("evHeadOrg").value.trim() : "",
    start, end, type, kickoff: $("evKickoff").value,
    earlyStart: $("evEarly").value || null, due14: $("evDue14").value || null, due21: $("evDue21").value || null,
    depositDate: type === "pharma" ? $("evDeposit").value || null : null,
    done: old && old.done ? JSON.parse(JSON.stringify(old.done)) : {},
    planVer: PLAN_VER
  };
  state.open[id] = true;
  write("events/" + id, () => state.store.saveEvent(id, data));
  $("eventForm").hidden = true;
});
$("holidayForm").addEventListener("submit", (e) => {
  e.preventDefault(); if (!state.store) return;
  const d = $("hDate").value; if (!d || state.extra.indexOf(d) >= 0) return;
  state.extra = state.extra.concat([d]);
  write("config", () => state.store.saveConfig({ extraHolidays: state.extra }));
  $("hDate").value = ""; render();
});

/* 알림 시각: 07:00 ~ 09:50, 10분 단위 (서버 예약 작업이 이 구간에 10분마다 돈다) */
(function fillTimes() {
  const sel = $("notifyAt"); let h = "";
  for (let m = 7 * 60; m <= 9 * 60 + 50; m += 10) { const v = pad(Math.floor(m / 60)) + ":" + pad(m % 60); h += '<option value="' + v + '">' + v + "</option>"; }
  sel.innerHTML = h; sel.value = state.notifyAt;
})();
$("notifyAt").addEventListener("change", function () {
  state.notifyAt = this.value;
  if (state.store) write("config", () => state.store.saveConfig({ notifyAt: state.notifyAt }));
});

/* ---------- 푸시 알림 ---------- */
function b64uToBytes(s) {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
async function subId(endpoint) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(h)).slice(0, 12).map((x) => x.toString(16).padStart(2, "0")).join("");
}
function deviceLabel() {
  const u = navigator.userAgent;
  return isIOS ? "iPhone" : /Android/.test(u) ? "Android" : /Windows/.test(u) ? "Windows PC" : /Mac/.test(u) ? "Mac" : "기타 기기";
}
const pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function renderPush() {
  const box = $("pushBox");
  const line = (t) => '<p class="status-line">' + t + "</p>";
  if (!state.store) return;
  if (state.store.kind === "preview") { box.innerHTML = line("미리보기 모드에서는 알림을 켤 수 없습니다. Firebase 연결 후 사용하십시오.") + '<div class="actions"><button class="btn" type="button" id="pushTest">테스트 알림 보기</button></div>'; bindPushButtons(); return; }
  if (!vapidPublicKey) { box.innerHTML = line("알림용 공개 키가 아직 설정되지 않았습니다. 설치 안내 5단계를 진행하십시오."); return; }
  if (isIOS && !standalone) { box.innerHTML = line("iPhone에서는 홈 화면에 추가한 앱에서만 알림을 받을 수 있습니다. 아래 \"앱 설치\"의 iPhone 순서대로 설치한 뒤, 홈 화면 아이콘으로 열어 이 화면에서 다시 시도하십시오."); return; }
  if (!pushSupported) { box.innerHTML = line("이 브라우저는 웹 알림을 지원하지 않습니다. iPhone은 iOS 16.4 이상, PC는 Chrome 또는 Edge를 사용하십시오."); return; }
  if (Notification.permission === "denied") {
    box.innerHTML = line(isIOS ? "알림이 꺼져 있습니다. iPhone 설정 → 알림 → D-day 수첩에서 알림 허용을 켜십시오." : "이 사이트의 알림이 차단되어 있습니다. 주소창 왼쪽 자물쇠 아이콘 → 알림 → 허용으로 바꾼 뒤 새로 고치십시오.");
    return;
  }
  let sub = null;
  try { const reg = await navigator.serviceWorker.ready; sub = await reg.pushManager.getSubscription(); } catch (e) {}
  box.innerHTML = sub
    ? line("이 기기(" + deviceLabel() + ")에서 아침 알림을 받고 있습니다.") + '<div class="actions"><button class="btn" type="button" id="pushTest">테스트 알림 보기</button><button class="btn danger" type="button" id="pushOff">이 기기 알림 끄기</button></div>'
    : line("이 기기에서는 아직 알림을 받지 않습니다.") + '<div class="actions"><button class="btn primary" type="button" id="pushOn">이 기기에서 알림 받기</button></div>';
  bindPushButtons();
}
function bindPushButtons() {
  const on = $("pushOn"), off = $("pushOff"), test = $("pushTest");
  if (on) on.addEventListener("click", () => {
    on.disabled = true;
    // iPhone 은 버튼을 누른 그 순간에 권한을 물어야 하므로 다른 작업보다 먼저 요청한다.
    Notification.requestPermission().then(async (perm) => {
      if (perm !== "granted") { renderPush(); return; }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(vapidPublicKey) });
        await state.store.savePush(await subId(sub.endpoint), { sub: sub.toJSON(), device: deviceLabel(), createdAt: new Date().toISOString() });
        notice("");
      } catch (e) { console.error(e); notice("알림을 켜지 못했습니다. 잠시 후 다시 시도하십시오."); }
      renderPush();
    });
  });
  if (off) off.addEventListener("click", async () => {
    off.disabled = true;
    try {
      const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
      if (sub) { await state.store.deletePush(await subId(sub.endpoint)); await sub.unsubscribe(); }
    } catch (e) { console.error(e); notice("알림을 끄지 못했습니다. 잠시 후 다시 시도하십시오."); }
    renderPush();
  });
  if (test) test.addEventListener("click", async () => {
    const m = morningSummary(state.events, state.extra, state.today);
    const body = [m.headline].concat(m.lines).join("\n");
    try {
      if (Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted") { renderPush(); return; }
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification("D-day 수첩 " + fmt(state.today),{ body, icon: "icons/icon-192.png", badge: "icons/badge-96.png", tag: "test" });
    } catch (e) { notice("테스트 알림을 띄우지 못했습니다: " + body); }
  });
}

/* ---------- 로그인 ---------- */
function authError(e) {
  const c = (e && e.code) || "";
  if (c === "auth/invalid-credential" || c === "auth/wrong-password" || c === "auth/user-not-found" || c === "auth/invalid-email") return "이메일 또는 비밀번호가 맞지 않습니다.";
  if (c === "auth/too-many-requests") return "시도가 너무 많아 잠시 막혔습니다. 몇 분 뒤 다시 시도하십시오.";
  if (c === "auth/network-request-failed") return "인터넷에 연결되어 있지 않습니다.";
  if (c === "auth/missing-email") return "이메일을 입력하십시오.";
  return "로그인하지 못했습니다. (" + c + ")";
}
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault(); if (!state.store) return;
  const err = $("lgErr"), email = $("lgEmail").value.trim(), pw = $("lgPw").value;
  err.hidden = true; $("lgOk").hidden = true;
  if (!email || !pw) { err.textContent = "이메일과 비밀번호를 입력하십시오."; err.hidden = false; return; }
  $("lgBtn").disabled = true;
  try { await state.store.signIn(email, pw); $("lgPw").value = ""; }
  catch (x) { err.textContent = authError(x); err.hidden = false; }
  $("lgBtn").disabled = false;
});
$("lgReset").addEventListener("click", async () => {
  const err = $("lgErr"), ok = $("lgOk"), email = $("lgEmail").value.trim();
  err.hidden = true; ok.hidden = true;
  if (!email) { err.textContent = "이메일 칸에 계정 이메일을 먼저 입력하십시오."; err.hidden = false; return; }
  try { await state.store.resetPassword(email); ok.textContent = "비밀번호 재설정 메일을 보냈습니다. 메일함을 확인하십시오."; ok.hidden = false; }
  catch (x) { err.textContent = authError(x); err.hidden = false; }
});
$("btnSignOut").addEventListener("click", () => { if (state.store) state.store.signOut(); });

/* ---------- 설치 안내 ---------- */
if (isIOS && !standalone && lsGet("dday.hintClosed") !== "1") $("installHint").hidden = false;
$("hintClose").addEventListener("click", () => { $("installHint").hidden = true; lsSet("dday.hintClosed", "1"); });
$("hintHow").addEventListener("click", () => { setTab("settings"); $("installGroup").scrollIntoView({ behavior: "smooth" }); });

/* ---------- 시작 ---------- */
function showView(v) { $("bootView").hidden = v !== "boot"; $("loginView").hidden = v !== "login"; $("appView").hidden = v !== "app"; $("tabs").hidden = v !== "app"; }

/* ---------- 화면 밝기 (이 기기에만 저장) ---------- */
$("themeSel").value = document.documentElement.getAttribute("data-theme") || "light";
$("themeSel").addEventListener("change", function () {
  document.documentElement.setAttribute("data-theme", this.value);
  lsSet("dday.theme", this.value);
});
function stopWatching() { state.unsub.forEach((u) => { try { u(); } catch (e) {} }); state.unsub = []; }
function startWatching() {
  const st = state.store;
  const dead = (e) => { console.error(e); notice(e && e.code === "permission-denied" ? "이 계정에는 데이터 접근 권한이 없습니다. Firestore 보안 규칙을 확인하십시오." : "저장소와의 연결이 끊겼습니다. 페이지를 새로 고치십시오."); };
  state.unsub.push(st.watchEvents((list) => {
    state.events = list.filter((o) => o.start && o.name).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    state.loaded.events = true; render();
  }, dead));
  state.unsub.push(st.watchConfig((x) => {
    state.extra = Array.isArray(x.extraHolidays) ? x.extraHolidays.slice() : [];
    state.notifyAt = x.notifyAt || "08:20";
    render();
  }, dead));
}

state.today = kstToday();
const savedTab = lsGet("dday.tab"); if (savedTab && $("view-" + savedTab)) setTab(savedTab);
render();
setInterval(() => { const t = kstToday(); if (t !== state.today) { state.today = t; render(); } }, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) { const t = kstToday(); if (t !== state.today) { state.today = t; render(); } } });

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch((e) => console.error(e));

createStore().then((store) => {
  state.store = store;
  if (store.kind === "preview") notice("미리보기 모드입니다. Firebase 연결 전이라 이 기기에만 저장됩니다. (설치 안내 3단계 참고)");
  store.onAuth((user) => {
    stopWatching();
    state.user = user; state.events = []; state.loaded.events = false;
    if (!user) { showView("login"); render(); return; }
    $("acctLine").textContent = store.kind === "preview" ? "미리보기 모드 (로그인 없음)" : user.email + " 계정으로 로그인되어 있습니다.";
    $("btnSignOut").hidden = store.kind === "preview";
    showView("app"); startWatching(); render(); renderPush();
  });
}).catch((e) => {
  console.error(e);
  showView("boot");
  $("bootView").innerHTML = '<div class="empty"><strong>앱을 열지 못했습니다.</strong><span>인터넷 연결을 확인한 뒤 새로 고치십시오. 계속되면 config.js 의 Firebase 설정값을 확인하십시오.</span></div>';
});
