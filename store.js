/* 저장소. Firebase(로그인 + Firestore)와, 설정 전 확인용 미리보기(이 기기 localStorage) 두 가지가 같은 모양을 가진다.
   데이터 위치: users/{uid}/events/{행사}, users/{uid}/config/main, users/{uid}/push/{기기} */
import { firebaseConfig } from "./config.js";

export const configured = !!(firebaseConfig && firebaseConfig.apiKey);

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";

export async function createStore() {
  return configured ? firebaseStore() : previewStore();
}

async function firebaseStore() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(SDK + "firebase-app.js"), import(SDK + "firebase-auth.js"), import(SDK + "firebase-firestore.js")
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  let db;
  try { db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
  catch (e) { db = F.getFirestore(app); }
  let uid = null;
  const evCol = () => F.collection(db, "users", uid, "events");
  const evDoc = (id) => F.doc(db, "users", uid, "events", id);
  const cfgDoc = () => F.doc(db, "users", uid, "config", "main");
  const pushDoc = (id) => F.doc(db, "users", uid, "push", id);
  return {
    kind: "firebase",
    onAuth(cb) { return A.onAuthStateChanged(auth, (u) => { uid = u ? u.uid : null; cb(u ? { uid: u.uid, email: u.email } : null); }); },
    signIn: (email, pw) => A.signInWithEmailAndPassword(auth, email, pw),
    signOut: () => A.signOut(auth),
    resetPassword: (email) => A.sendPasswordResetEmail(auth, email),
    watchEvents(cb, err) { return F.onSnapshot(evCol(), (snap) => cb(snap.docs.map((d) => Object.assign({}, d.data(), { id: d.id }))), err); },
    watchConfig(cb, err) { return F.onSnapshot(cfgDoc(), (d) => cb(d.exists() ? d.data() : {}), err); },
    newId: () => F.doc(evCol()).id,
    saveEvent: (id, data) => F.setDoc(evDoc(id), data),
    patchEvent: (id, patch) => F.updateDoc(evDoc(id), patch),
    setDone: (id, step, on) => F.updateDoc(evDoc(id), new F.FieldPath("done", step), on || F.deleteField()),
    deleteEvent: (id) => F.deleteDoc(evDoc(id)),
    saveConfig: (patch) => F.setDoc(cfgDoc(), patch, { merge: true }),
    savePush: (id, data) => F.setDoc(pushDoc(id), data),
    deletePush: (id) => F.deleteDoc(pushDoc(id))
  };
}

/* 미리보기: Firebase 설정 전에도 화면과 계산을 확인할 수 있게 이 기기에만 저장한다. */
function previewStore() {
  const KEY = "dday.preview";
  let data = { events: {}, config: {} };
  try { data = JSON.parse(localStorage.getItem(KEY)) || data; } catch (e) {}
  const subs = { events: [], config: [] };
  function emit() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
    const evs = Object.keys(data.events).map((id) => Object.assign({}, JSON.parse(JSON.stringify(data.events[id])), { id }));
    subs.events.forEach((cb) => cb(evs));
    subs.config.forEach((cb) => cb(JSON.parse(JSON.stringify(data.config))));
  }
  const later = (fn) => new Promise((ok) => setTimeout(() => { fn(); emit(); ok(); }, 0));
  return {
    kind: "preview",
    onAuth(cb) { setTimeout(() => cb({ uid: "preview", email: "미리보기" }), 0); return () => {}; },
    signIn: async () => {}, signOut: async () => {}, resetPassword: async () => {},
    watchEvents(cb) { subs.events.push(cb); setTimeout(emit, 0); return () => {}; },
    watchConfig(cb) { subs.config.push(cb); setTimeout(emit, 0); return () => {}; },
    newId: () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    saveEvent: (id, d) => later(() => { data.events[id] = JSON.parse(JSON.stringify(d)); }),
    patchEvent: (id, p) => later(() => { Object.assign(data.events[id], p); }),
    setDone: (id, step, on) => later(() => { const d = data.events[id].done || (data.events[id].done = {}); if (on) d[step] = on; else delete d[step]; }),
    deleteEvent: (id) => later(() => { delete data.events[id]; }),
    saveConfig: (p) => later(() => { Object.assign(data.config, p); }),
    savePush: async () => {}, deletePush: async () => {}
  };
}
