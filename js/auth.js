/* 가입(계정) 모듈 — 서버 연결 전 데모용 "가짜 서버".
   규칙(아이디/비밀번호 검사, 초대코드 정원)은 실서비스에서 반드시 서버에서 다시 검사해야 한다. (SECURITY.md)
   이 파일의 AuthApi.signup()만 서버 호출(fetch)로 바꾸면 화면(signup.js)은 그대로 쓸 수 있다. */
const AUTH_KEY = 'deeplayer-accounts';
const ID_RE = /^[a-z0-9_]{4,16}$/;
const PW_MIN = 10, PW_MAX = 64, PBKDF2_ITER = 150000;
const COMMON_PW = ['password', 'passw0rd', '1234567890', 'qwertyuiop', 'qwerty1234', 'abcd123456', 'iloveyou12', 'asdf123456', '0123456789', 'deeplayer1'];
/* 초대코드는 코드 자체가 아니라 SHA-256 해시로만 둔다. max = 이 코드로 가입할 수 있는 인원 */
const INVITE_TABLE = [
  { hash: '5908851d928ddb05e6dd278469c47b1527aabbced547de57c32e402b950e1ef5', max: 50 } // 일반 유저용 초대코드 (50명). 코드 원문은 운영자만 안다
];

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
async function sha256(text) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))); }
async function hashPassword(pw, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256));
}
function readDb() {
  try {
    const d = JSON.parse(localStorage.getItem(AUTH_KEY));
    if (d && typeof d === 'object' && d.users && d.invites) return d;
  } catch (e) { /* 없거나 깨짐 */ }
  return { users: {}, invites: {}, fails: 0, lockUntil: 0 };
}
const writeDb = d => { try { localStorage.setItem(AUTH_KEY, JSON.stringify(d)); return true; } catch (e) { return false; } };

/* 입력 검사 (화면의 실시간 안내와 가입 시 검사가 같은 함수를 쓴다). 문제 없으면 null */
const Check = {
  id: v => ID_RE.test(v) ? null : '영문 소문자·숫자·_ 로 4~16자여야 해요.',
  pw: (v, id) => {
    if (v.length < PW_MIN) return `${PW_MIN}자 이상이어야 해요.`;
    if (v.length > PW_MAX) return `${PW_MAX}자 이하여야 해요.`;
    if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return '영문과 숫자를 모두 넣어 주세요.';
    if (id && v.toLowerCase().includes(id.toLowerCase())) return '아이디가 들어간 비밀번호는 쓸 수 없어요.';
    if (/^(.)\1+$/.test(v) || COMMON_PW.includes(v.toLowerCase())) return '너무 흔한 비밀번호예요.';
    return null;
  },
  strength: v => Math.min(4, (v.length >= 10) + (v.length >= 14) + (/[A-Z]/.test(v) && /[a-z]/.test(v)) + /[^A-Za-z0-9]/.test(v))
};

const AuthApi = {
  /* → { ok: true } | { err, field? } */
  async signup({ id, pw, pw2, invite, other }) {
    id = String(id || '').trim().toLowerCase(); invite = String(invite || '').trim().toUpperCase();
    if (!window.crypto || !crypto.subtle) return { err: '이 환경에서는 안전한 암호화를 쓸 수 없어 가입할 수 없어요. (https 또는 최신 브라우저 필요)' };
    const db = readDb(), now = Date.now();
    if (db.lockUntil > now) return { err: `초대코드를 여러 번 틀렸어요. ${Math.ceil((db.lockUntil - now) / 1000)}초 뒤에 다시 시도해 주세요.`, field: 'invite' };
    let e = Check.id(id); if (e) return { err: e, field: 'id' };
    e = Check.pw(String(pw || ''), id); if (e) return { err: e, field: 'pw' };
    if (pw !== pw2) return { err: '비밀번호 확인이 달라요.', field: 'pw2' };
    if (!other) return { err: '다른 곳에서 쓰는 비밀번호와 다른지 확인해 주세요.', field: 'other' };
    if (Cloud.enabled) { // 서버 연결: 초대코드·아이디 중복은 서버가 검사한다
      const r = await Cloud.signup(id, pw, invite);
      return r.ok ? { ok: true, left: '?' } : { err: r.err, field: /초대/.test(r.err) ? 'invite' : /아이디/.test(r.err) ? 'id' : undefined };
    }
    const inviteHash = await sha256(invite), row = INVITE_TABLE.find(r => r.hash === inviteHash);
    if (!row) {
      db.fails = (db.fails || 0) + 1;
      if (db.fails >= 5) { db.fails = 0; db.lockUntil = now + 30000; }
      writeDb(db);
      return { err: '초대코드가 올바르지 않아요.', field: 'invite' };
    }
    if ((db.invites[row.hash] || 0) >= row.max) return { err: `이 초대코드는 정원(${row.max}명)이 가득 찼어요.`, field: 'invite' };
    if (db.users[id]) return { err: '이미 사용 중인 아이디예요.', field: 'id' };
    const salt = crypto.getRandomValues(new Uint8Array(16));
    db.users[id] = { salt: b64(salt), pw: await hashPassword(pw, salt), at: now, invite: row.hash.slice(0, 8) };
    db.invites[row.hash] = (db.invites[row.hash] || 0) + 1; db.fails = 0;
    if (!writeDb(db)) return { err: '저장할 수 없어요. (브라우저 저장소가 막혀 있어요)' };
    return { ok: true, left: row.max - db.invites[row.hash] };
  }
};
