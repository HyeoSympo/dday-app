/* D-day 수첩 날짜 계산·상태 판정.
   화면과 분리된 순수 함수. 브라우저(<script>)와 Node(require) 양쪽에서 쓴다.
   LOGIC-START ~ LOGIC-END 구간은 dday-notebook.html 에서 그대로 옮겨 왔다. */

/*LOGIC-START*/
var PLAN_VER = 1;
var HOLIDAYS = new Set([
  "2026-01-01","2026-02-16","2026-02-17","2026-02-18","2026-03-02","2026-05-01","2026-05-05","2026-05-25",
  "2026-06-03","2026-07-17","2026-08-17","2026-09-24","2026-09-25","2026-10-05","2026-10-09","2026-12-25",
  "2027-01-01","2027-02-08","2027-02-09","2027-03-01","2027-05-05","2027-05-13","2027-07-19","2027-08-16",
  "2027-09-14","2027-09-15","2027-09-16","2027-10-04","2027-10-11","2027-12-27"
]);
var DOW = ["일","월","화","수","목","금","토"];
function pad(n) { return (n < 10 ? "0" : "") + n; }
function toDate(iso) { var a = iso.split("-").map(Number); return new Date(Date.UTC(a[0], a[1] - 1, a[2])); }
function toIso(dt) { return dt.toISOString().slice(0, 10); }
function addDays(iso, n) { var d = toDate(iso); d.setUTCDate(d.getUTCDate() + n); return toIso(d); }
function dow(iso) { return toDate(iso).getUTCDay(); }
function diffDays(a, b) { return Math.round((toDate(a) - toDate(b)) / 86400000); }
function fmt(iso) { var a = iso.split("-").map(Number); return a[1] + "/" + a[2] + "(" + DOW[dow(iso)] + ")"; }
function makeCal(extra) {
  var ex = new Set(extra || []);
  function off(iso) { var w = dow(iso); return w === 0 || w === 6 || HOLIDAYS.has(iso) || ex.has(iso); }
  function prev(iso) { while (off(iso)) iso = addDays(iso, -1); return iso; }
  function next(iso) { while (off(iso)) iso = addDays(iso, 1); return iso; }
  function biz(iso, n) { var s = n > 0 ? 1 : -1, k = Math.abs(n); while (k) { iso = addDays(iso, s); if (!off(iso)) k--; } return iso; }
  return { off: off, prev: prev, next: next, biz: biz };
}
function monthBefore(iso) {
  var a = iso.split("-").map(Number), y = a[0], m = a[1] - 1;
  if (m === 0) { m = 12; y--; }
  var last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return y + "-" + pad(m) + "-" + pad(Math.min(a[2], last));
}
function maxIso(a, b) { return a > b ? a : b; }

/* 행사 한 건의 기준표. due = 보고에 올라오는 날, hard = 마지노선, after = 먼저 끝나야 하는 단계 */
function buildPlan(ev, extra) {
  var c = makeCal(extra), S = ev.start, E = ev.end || ev.start;
  var pharma = ev.type === "pharma";
  function D(n) { return c.prev(addDays(S, -n)); }
  var plan = [], byId = {};
  function add(id, title, o) {
    var s = { id: id, title: title, phase: "pre" };
    for (var k in o) if (o[k] !== undefined && o[k] !== null) s[k] = o[k];
    var dep = s.after && s.after.length ? byId[s.after[s.after.length - 1]] : null;
    s.sk = s.due || (dep ? dep.sk : null) || s.hard || "9999-12-31";
    s.ix = plan.length; plan.push(s); byId[id] = s;
  }
  var d1 = ev.earlyStart ? c.prev(ev.earlyStart) : D(60);
  var invite = c.prev(monthBefore(S));
  add("1", "호텔에 [호텔 정보 요청] 메일 발송", { due: d1, note: "체크리스트·루밍리스트 제출 기한을 함께 문의" });
  add("2", "호텔 회신 확인", { due: c.biz(d1, 3), after: ["1"], note: "미회신 시 전화 또는 재요청" });
  add("3", "[호텔 정보서] 작성 후 총괄 PM에게 송부", { after: ["2"], note: "호텔 회신을 받는 즉시" });
  add("4", "[모바일 초청장 주문서 작성 요청] 메일 발송", { after: ["2"], note: "호텔 정보서와 동시에 발송" });
  add("5", "PM에게 키비주얼 희망 시안 확인", { due: D(44), note: "메일 또는 메신저" });
  if (ev.kickoff === "yes") add("10", "Kick-off 미팅", { due: D(30), note: "일정은 유동적으로 조정 가능" });
  else if (ev.kickoff !== "no") add("10", "Kick-off 미팅 진행 여부 결정", { due: D(44), decide: true, note: "특이사항이 없는 루틴 행사는 생략 가능" });
  add("6", "초청장 주문서 수령 확인", { due: c.biz(invite, -5), hard: c.biz(invite, -2), after: ["4"], note: "미회신 시 리마인드 메일" });
  add("7", "디자이너에게 [키비주얼 요청] 메일 발송", { due: D(37), after: ["5"], note: "제작 약 1주. 촉박하면 품질 저하" });
  add("8", "모바일 초청장 완성 확인", { due: invite, hard: invite, after: ["6"], note: "제작 최대 2일" });
  add("9", "PM에게 키비주얼 컨펌 요청", { due: D(30), after: ["7"], note: "시안 수령 후" });
  add("11", "PM의 CRM 룸 배정 완료 확인", { due: D(22), hard: D(14), note: "미완료 시 PM에게 요청" });
  add("12", "참석자 TM 설문 문자 발송", { due: D(21), hard: D(14), after: ["11"], note: "룸 배정 완료 직후. 늦어도 2주 전" });
  if (!pharma) add("13-1", "영업 담당자에게 [교통비 후지급 안내] 메일 1차", { due: D(21) });
  add("14", "호텔에 체크리스트·루밍리스트 1차 전달", { due: ev.due14 ? c.prev(ev.due14) : D(14), note: ev.due14 ? "호텔 지정 기한" : "기본 기한. 호텔 지정 기한이 있으면 행사 수정에서 입력" });
  if (!pharma) add("13-2", "영업 담당자에게 [교통비 후지급 안내] 메일 2차", { due: D(14) });
  add("15", "호텔·베뉴에 맞는 제작물 시안 요청", { due: D(11), after: ["9"], note: "키비주얼 컨펌 완료 후. 시안 제작 2~3일" });
  add("16", "PM에게 제작물 시안 컨펌 요청", { hard: D(4), after: ["15"], note: "시안 수령 후" });
  if (pharma) {
    var dep = ev.depositDate;
    if (!dep) { dep = addDays(S, -1); while (dow(dep) !== 3) dep = addDays(dep, -1); }
    var req = c.prev(addDays(dep, -((dow(dep) + 6) % 7) - 4));
    add("17", "영업지원팀에 [교통비 선급금 요청] 메일 발송", { due: req, note: "입금 예정 " + fmt(dep) + ". 전주 목요일까지 요청" });
  }
  add("18", "[참석자 안내 문자 내용 컨펌 요청] 메일 발송", { due: D(7) });
  if (!pharma) add("13-3", "영업 담당자에게 [교통비 후지급 안내] 메일 3차", { due: D(7) });
  add("19", "세광플러스에 [호텔 정보서 출력 요청] 메일 발송", { due: D(4), note: "오전 중 발송" });
  add("20", "제작물 발주", { due: D(4), hard: D(4), after: ["16"], note: "PM 시안 컨펌 완료 후" });
  add("21", "호텔에 최종 루밍리스트 전달", { due: ev.due21 ? c.prev(ev.due21) : D(3), hard: ev.due21 ? c.prev(ev.due21) : D(2), note: ev.due21 ? "호텔 지정 기한" : "기본 기한" });
  add("22", "기자재·물품 점검, 제작물 수령·검수", { due: D(2), note: "부족분 구매·대처 시간 확보" });
  add("23", "행사물품을 호텔로 퀵 발송", { due: D(1) });
  add("24", "PM에게 [인쇄물 및 물품 발송 안내 메일] 발송", { due: D(1) });
  add("25", "참석자 안내 문자 예약", { due: D(1), note: "CRM 최신 참석자 리스트로 진행" });
  var n1 = c.next(addDays(E, 1));
  add("26", "행사물품 회수 퀵 신청 및 회수", { due: n1, phase: "post" });
  add("27", "호텔에 [인보이스 요청] 메일 발송", { due: n1, phase: "post" });
  if (!pharma) add("28", "영업 담당자에게 [교통비 후지급 안내] 메일 4차", { due: n1, phase: "post", note: "영수증 취합 안내" });
  add("29", "PM에게서 방명록 서명본·현장 서류 수령", { due: n1, hard: maxIso(n1, c.prev(addDays(E, 3))), phase: "post", note: "종료 후 3일 이내" });
  if (pharma) {
    var w1 = maxIso(n1, c.prev(addDays(E, 7)));
    add("30", "[비용 요약 전달] 메일 발송", { due: w1, hard: w1, after: ["27"], phase: "post", note: "호텔 인보이스 수령 후. 종료 후 1주 이내" });
  } else {
    add("31", "교통비 환급 완료 후 [비용 요약 전달] 메일 발송", { due: maxIso(n1, c.prev(addDays(E, 14))), hard: maxIso(n1, c.prev(addDays(E, 21))), after: ["27", "28"], phase: "post", note: "영수증 취합·후불 환급 완료 후. 종료 후 2~3주 이내" });
  }
  plan.sort(function (a, b) { return a.phase !== b.phase ? (a.phase === "pre" ? -1 : 1) : a.sk < b.sk ? -1 : a.sk > b.sk ? 1 : a.ix - b.ix; });
  return plan.map(function (s) { var o = {}; for (var k in s) if (k !== "sk" && k !== "ix") o[k] = s[k]; return o; });
}

function stepStatus(step, ev, today, plan) {
  var done = ev.done || {};
  if (done[step.id]) return { k: "done", on: done[step.id] };
  var ids = {}; plan.forEach(function (s) { ids[s.id] = 1; });
  var blocked = (step.after || []).filter(function (id) { return ids[id] && !done[id]; });
  var due = step.due || null, hard = step.hard || null;
  if (hard && (today > hard || (today === hard && hard !== due))) return { k: "crit", blocked: blocked, over: diffDays(today, hard) };
  if (due && today > due) return { k: "late", blocked: blocked, days: diffDays(today, due), toHard: hard ? diffDays(hard, today) : null };
  if (due && today === due) return { k: "today", blocked: blocked, last: hard === due };
  if (blocked.length) return { k: "wait", blocked: blocked, inDays: due ? diffDays(due, today) : null };
  if (!due || (step.after && step.after.length)) return { k: "open", blocked: blocked, inDays: due ? diffDays(due, today) : null };
  return { k: diffDays(due, today) <= 7 ? "soon" : "later", blocked: blocked, inDays: diffDays(due, today) };
}

/*LOGIC-END*/

/* CP(공정거래 자율준수) 증빙과 직결되는 단계: 교통비, 방명록 서명본, 비용 요약. 지연되면 눈에 띄게 표시한다. */
var CP_STEPS = new Set(["13-1", "13-2", "13-3", "17", "28", "29", "30", "31"]);
function isCp(step) { return CP_STEPS.has(step.id); }

/* 오늘 화면의 묶음. 대기 중인 단계는 7일 이내일 때만 "7일 이내 예정"에 올린다. */
var GROUP_ORDER = [["crit", "마지노선 경고"], ["today", "오늘 할 일"], ["late", "지연"], ["open", "진행 가능 · 회신 대기"], ["soon", "7일 이내 예정"]];
function todayGroups(ev, extra, today) {
  var plan = buildPlan(ev, extra), g = { crit: [], today: [], late: [], open: [], soon: [] };
  plan.forEach(function (s) {
    var st = stepStatus(s, ev, today, plan), k = st.k;
    if (k === "done" || k === "later") return;
    if (k === "wait") { if (st.inDays === null || st.inDays > 7) return; k = "soon"; }
    g[k].push({ s: s, st: st });
  });
  return { plan: plan, g: g };
}

/* 아침 알림 문구. 예: "오늘 할 일 3건, 지연 1건, 마지노선 1건" + 우선순위가 높은 항목 몇 줄 */
function morningSummary(events, extra, today, maxLines) {
  var tot = { today: 0, late: 0, crit: 0 }, items = [];
  events.forEach(function (ev) {
    var g = todayGroups(ev, extra, today).g;
    tot.today += g.today.length; tot.late += g.late.length; tot.crit += g.crit.length;
    g.crit.forEach(function (i) { items.push({ r: 0, tag: "마지노선", ev: ev, s: i.s }); });
    g.late.forEach(function (i) { items.push({ r: isCp(i.s) ? 1 : 3, tag: isCp(i.s) ? "CP 지연" : "지연", ev: ev, s: i.s }); });
    g.today.forEach(function (i) { items.push({ r: 2, tag: "오늘", ev: ev, s: i.s }); });
  });
  items.sort(function (a, b) { return a.r - b.r; });
  var n = maxLines == null ? 4 : maxLines;
  var lines = items.slice(0, n).map(function (i) { return "[" + i.tag + "] " + i.ev.name + " · " + i.s.id + "번 " + i.s.title; });
  if (items.length > n) lines.push("외 " + (items.length - n) + "건");
  return { counts: tot, headline: "오늘 할 일 " + tot.today + "건, 지연 " + tot.late + "건, 마지노선 " + tot.crit + "건", lines: lines };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PLAN_VER: PLAN_VER, HOLIDAYS: HOLIDAYS, DOW: DOW, pad: pad, addDays: addDays, dow: dow, diffDays: diffDays, fmt: fmt,
    makeCal: makeCal, monthBefore: monthBefore, buildPlan: buildPlan, stepStatus: stepStatus,
    CP_STEPS: CP_STEPS, isCp: isCp, GROUP_ORDER: GROUP_ORDER, todayGroups: todayGroups, morningSummary: morningSummary
  };
}
