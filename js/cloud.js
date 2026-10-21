/* 서버 저장(Supabase) 클라이언트 — SDK 없이 fetch만 쓴다. url/key 를 채우면 켜지고, 비어 있으면 지금처럼 브라우저에만 저장한다.
   key 는 공개해도 되는 anon(publishable) 키다. 서비스 롤 키는 절대 여기에 넣지 않는다. (supabase/schema.sql, SECURITY.md) */
const CLOUD = { url: 'https://gpqfhophmjzwgarizpbw.supabase.co', key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdwcWZob3BobWp6d2dhcml6cGJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NTU2MjgsImV4cCI6MjEwODEzMTYyOH0.lo_KOTLArUIVqS1ECQRBiD73PelM-dEdzaFiQeMn1r8' };
const Cloud = (() => {
  const SKEY = 'deeplayer-cloud', FAKE = '@deeplayer.game';
  const base = () => { try { return new URL(CLOUD.url).origin; } catch (e) { return ''; } }; // 주소 뒤에 /rest/v1/ 같은 경로가 붙어 있어도 주소 부분만 쓴다
  const on = () => !!(CLOUD.url && CLOUD.key);
  const rd = () => { try { const s = JSON.parse(localStorage.getItem(SKEY)); return s && s.access ? s : null; } catch (e) { return null; } };
  const wr = s => { try { s ? localStorage.setItem(SKEY, JSON.stringify(s)) : localStorage.removeItem(SKEY); } catch (e) { /* 저장 불가 */ } };
  const kor = m => /invalid_invite/.test(m) ? '초대코드가 올바르지 않거나 정원이 찼어요.' : /already registered|already been registered/i.test(m) ? '이미 사용 중인 아이디예요.' : /invalid login/i.test(m) ? '아이디 또는 비밀번호가 맞지 않아요.' : /rate|too many/i.test(m) ? '시도가 너무 많아요. 잠시 뒤에 다시 해 주세요.' : '서버 요청에 실패했어요. 잠시 뒤에 다시 시도해 주세요.';
  async function call(path, body, token) {
    const r = await fetch(base() + path, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CLOUD.key, Authorization: 'Bearer ' + (token || CLOUD.key) }, body: JSON.stringify(body || {}) });
    let j = null; try { j = await r.json(); } catch (e) { /* 본문 없음 */ }
    if (!r.ok) throw new Error((j && (j.msg || j.message || j.error_description || j.error)) || String(r.status));
    return j;
  }
  const keep = (j, id) => { const s = { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000 - 60000, id: id || (rd() || {}).id || '', rev: (rd() || {}).rev || 0 }; wr(s); return s; };
  async function token() {
    const s = rd(); if (!s) throw new Error('로그인이 필요해요.');
    if (Date.now() < s.exp) return s.access;
    try { return keep(await call('/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh }), s.id).access; } catch (e) { wr(null); throw new Error('로그인이 만료되었어요. 다시 로그인해 주세요.'); }
  }
  return {
    get enabled() { return on(); },
    user: () => (rd() || {}).id || null,
    async signup(id, pw, invite) {
      try { const j = await call('/auth/v1/signup', { email: id + FAKE, password: pw, data: { invite: String(invite || '').trim() } }); if (j.access_token) keep(j, id); return { ok: true }; }
      catch (e) { return { err: kor(e.message) }; }
    },
    async login(id, pw) {
      try { keep(await call('/auth/v1/token?grant_type=password', { email: String(id).trim().toLowerCase() + FAKE, password: pw }), String(id).trim().toLowerCase()); return { ok: true }; }
      catch (e) { return { err: kor(e.message) }; }
    },
    logout() { wr(null); },
    async submitBug(body, ctx) { await call('/rest/v1/rpc/submit_bug', { p_body: body, p_ctx: ctx }, await token()); },
    async listBugs() { return (await call('/rest/v1/rpc/list_bugs', {}, await token())) || []; },
    async deleteBug(id) { await call('/rest/v1/rpc/delete_bug', { p_id: id }, await token()); },
    async isAdmin() { return (await call('/rest/v1/rpc/is_admin', {}, await token())) === true; },
    /* → { rev, data, at } | null(서버에 세이브 없음) */
    async pull() { const j = await call('/rest/v1/rpc/pull_save', {}, await token()); if (j) { const s = rd(); if (s) { s.rev = j.rev; wr(s); } } return j; },
    /* → { ok, rev } — ok:false 면 다른 기기가 먼저 저장한 것 */
    async push(data) {
      const s = rd(); const j = await call('/rest/v1/rpc/push_save', { p_rev: s ? s.rev : 0, p_data: data }, await token());
      const c = rd(); if (c && j && Number.isFinite(j.rev)) { c.rev = j.rev; wr(c); }
      return j;
    }
  };
})();

/* 서버가 켜져 있는데 로그인하지 않았다면 가입/로그인 페이지부터 보여 준다 */
if (Cloud.enabled && !Cloud.user() && document.body && !document.body.classList.contains('signup-body')) { document.documentElement.style.visibility = 'hidden'; location.replace('signup.html'); } // 로그인 전에는 튜토리얼 등 게임 화면이 잠깐도 보이지 않게 한다
