/* Firebase 연결 정보. 설치 안내 3단계에서 Firebase 콘솔의 값을 복사해 아래 따옴표 안에 붙여 넣으십시오.
   이 값들은 웹앱에 공개되는 정보이며, 데이터 보호는 Firestore 보안 규칙(firestore.rules)이 담당합니다.
   apiKey 가 비어 있으면 이 기기에만 저장되는 "미리보기 모드"로 열립니다. */
export const firebaseConfig = {
  apiKey: "AIzaSyCP5ZZ07Th_KDg6jWhdLSgkjI41GKOkv1o",
  authDomain: "dday-notebook.firebaseapp.com",
  projectId: "dday-notebook",
  storageBucket: "dday-notebook.firebasestorage.app",
  messagingSenderId: "443640022256",
  appId: "1:443640022256:web:f3a3d4daa3770f1dc4ee35"
};

/* 아침 알림용 공개 키. 설치 안내 5단계에서 tools/make-keys.html 로 만든 "공개 키"를 붙여 넣으십시오. */
export const vapidPublicKey = "BJFK1rNLBfFGHMB4JyJYfv7gPFllvu-NhL-bzOTnR2whvT6FBd67SyVUrN5w6DC5bch65eCcimLv60Jzss4D2zM";
