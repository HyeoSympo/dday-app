/* 날짜 로직 기준값 테스트.
   - Node:   node tests/logic.test.js  (GitHub Actions에서 자동 실행)
   - 브라우저: tests/test.html 을 열면 결과가 표시된다 */
(function (root) {
  var L = typeof require === "function" ? require("../logic.js") : root;
  var results = [];
  function eq(name, actual, expected) {
    var a = JSON.stringify(actual), e = JSON.stringify(expected);
    results.push({ name: name, ok: a === e, detail: a === e ? "" : "기대 " + e + ", 실제 " + a });
  }
  function step(plan, id) { for (var i = 0; i < plan.length; i++) if (plan[i].id === id) return plan[i]; return null; }
  function ids(plan) { return plan.map(function (s) { return s.id; }); }

  // 스펙 4장 검증 기준값: 2026-08-22(토)~23(일) 의약품 심포지엄
  var ev = { name: "기준 심포지엄", start: "2026-08-22", end: "2026-08-23", type: "pharma", kickoff: "ask", done: {} };
  var plan = L.buildPlan(ev, []);
  eq("1번 6/23(화)", step(plan, "1").due, "2026-06-23");
  eq("6번 7/14(화)", step(plan, "6").due, "2026-07-14");
  eq("8번 7/22(수)", step(plan, "8").due, "2026-07-22");
  eq("12번 목표 7/31(금)", step(plan, "12").due, "2026-07-31");
  eq("12번 마지노선 8/7(금)", step(plan, "12").hard, "2026-08-07");
  eq("17번 8/13(목)", step(plan, "17").due, "2026-08-13");
  eq("20번 8/18(화)", step(plan, "20").due, "2026-08-18");
  eq("30번 8/28(금)", step(plan, "30").due, "2026-08-28");
  eq("요일 표기", L.fmt("2026-06-23"), "6/23(화)");

  // 유형별 단계 구성
  eq("의약품: 교통비 후지급 단계 없음", ["13-1", "13-2", "13-3", "28", "31"].map(function (i) { return !!step(plan, i); }), [false, false, false, false, false]);
  var dev = L.buildPlan({ start: "2026-08-22", end: "2026-08-23", type: "device", kickoff: "no" }, []);
  eq("의료기기: 13-1~3, 28, 31 있음 / 17, 30 없음", ["13-1", "13-2", "13-3", "28", "31", "17", "30"].map(function (i) { return !!step(dev, i); }), [true, true, true, true, true, false, false]);
  eq("Kick-off 생략 시 10번 제외", !!step(dev, "10"), false);
  eq("Kick-off 진행 시 D-30", step(L.buildPlan({ start: "2026-08-22", type: "pharma", kickoff: "yes" }, []), "10").due, "2026-07-23");
  eq("행사 전 단계가 행사 후 단계보다 먼저", ids(plan).indexOf("25") < ids(plan).indexOf("26"), true);

  // 휴일 규칙
  eq("n영업일: 1번+3영업일 = 2번 6/26(금)", step(plan, "2").due, "2026-06-26");
  var plan2 = L.buildPlan(ev, ["2026-06-23"]);
  eq("추가 휴무일은 직전 평일로", step(plan2, "1").due, "2026-06-22");
  eq("행사 후 착수일이 휴일이면 다음 평일 (8/24 월)", step(plan, "26").due, "2026-08-24");
  eq("착수일 입력 시 그 날짜", step(L.buildPlan({ start: "2026-08-22", type: "pharma", earlyStart: "2026-06-10" }, []), "1").due, "2026-06-10");
  eq("입금일 입력 시 전주 목요일", step(L.buildPlan({ start: "2026-08-22", type: "pharma", depositDate: "2026-08-12" }, []), "17").due, "2026-08-06");

  // 상태 판정 (12번 TM 설문: D-21부터 매일 남고, D-14에 경고)
  var s12 = step(plan, "12");
  eq("D-22 전: 선행 미완료면 대기", L.stepStatus(s12, ev, "2026-07-27", plan).k, "wait");
  eq("D-21 당일: 오늘 할 일", L.stepStatus(s12, ev, "2026-07-31", plan).k, "today");
  var st = L.stepStatus(s12, ev, "2026-08-04", plan);
  eq("D-21 이후: 지연 n일째, 마지노선까지 n일", [st.k, st.days, st.toHard], ["late", 4, 3]);
  eq("D-14(마지노선) 당일: 경고", L.stepStatus(s12, ev, "2026-08-07", plan).k, "crit");
  eq("완료 체크 시 완료", L.stepStatus(s12, { done: { "12": "2026-08-03" } }, "2026-08-07", plan).k, "done");
  eq("마지노선 = 시점이면 당일은 오늘 할 일(마지노선)", L.stepStatus(step(plan, "20"), ev, "2026-08-18", plan).last, true);

  // 오늘 화면 묶음과 아침 알림 문구
  var g = L.todayGroups(ev, [], "2026-08-07").g;
  var critIds = g.crit.map(function (i) { return i.s.id; });
  eq("8/7: 마지노선 경고에 11·12번", [critIds.indexOf("11") >= 0, critIds.indexOf("12") >= 0], [true, true]);
  var m = L.morningSummary([ev], [], "2026-08-07");
  eq("알림 문구 형식", /^오늘 할 일 \d+건, 지연 \d+건, 마지노선 \d+건$/.test(m.headline), true);
  eq("알림 첫 줄은 마지노선", m.lines[0].indexOf("[마지노선]") === 0, true);
  eq("CP 단계 표시", [L.isCp({ id: "29" }), L.isCp({ id: "30" }), L.isCp({ id: "12" })], [true, true, false]);

  var failed = results.filter(function (r) { return !r.ok; });
  if (typeof module !== "undefined" && module.exports && typeof process !== "undefined") {
    results.forEach(function (r) { console.log((r.ok ? "  통과  " : "  실패  ") + r.name + (r.ok ? "" : "  — " + r.detail)); });
    console.log("\n" + (results.length - failed.length) + " / " + results.length + " 통과");
    if (failed.length) process.exit(1);
  } else {
    root.TEST_RESULTS = results;
  }
})(typeof window !== "undefined" ? window : this);
