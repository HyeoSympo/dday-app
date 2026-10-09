/* 서비스 워커: 오프라인에서도 앱이 열리게 캐시하고, 아침 알림(웹 푸시)을 표시한다.
   앱 파일을 고친 뒤 배포할 때는 VERSION 을 올려 주면 기기의 캐시가 새로 바뀐다. */
const VERSION = "v2";
const CACHE = "dday-" + VERSION;
const SHELL = ["./", "index.html", "tokens.css", "app.js", "store.js", "config.js", "logic.js", "manifest.webmanifest", "icons/icon-192.png", "icons/badge-96.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("dday-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Firebase SDK·글꼴: 주소에 버전이 박혀 있으므로 캐시 우선
  if (url.hostname === "www.gstatic.com" || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // 앱 파일: 네트워크 우선, 안 되면 캐시 (항상 최신 화면을 보되 오프라인에서도 열림)
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html"))));
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "D-day 수첩", {
    body: d.body || "오늘 할 일을 확인하십시오.",
    icon: "icons/icon-192.png",
    badge: "icons/badge-96.png",
    tag: d.tag || "morning",
    data: { url: d.url || "./" }
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.registration.scope) && "focus" in c) return c.focus();
    return self.clients.openWindow(target);
  }));
});
