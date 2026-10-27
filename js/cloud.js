/* 서버 저장(Supabase) 클라이언트 — SDK 없이 fetch만 쓴다. url/key 를 채우면 켜지고, 비어 있으면 지금처럼 브라우저에만 저장한다.
   key 는 공개해도 되는 anon(publishable) 키다. 서비스 롤 키는 절대 여기에 넣지 않는다. (supabase/schema.sql, SECURITY.md) */
const CLOUD = { url: 'https://gpqfhophmjzwgarizpbw.supabase.co', key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdwcWZob3BobWp6d2dhcml6cGJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NTU2MjgsImV4cCI6MjEwODEzMTYyOH0.lo_KOTLArUIVqS1ECQRBiD73PelM-dEdzaFiQeMn1r8' };
const Cloud = (() => {
  const SKEY = 'deeplayer-cloud', FAKE = '@deeplayer.game';
  const base = () => { try { return new URL(CLOUD.url).origin; } catch (e) { return ''; } }; // 주소 뒤에 /rest/v1/ 같은 경로가 붙어 있어도 주소 부분만 쓴다
  const on = () => !!(CLOUD.url && CLOUD.key);
  const rd = () => { try { const s = JSON.parse(localStorage.getItem(SKEY)); return s && s.access ? s : null; } catch (e) { return null; } };
  const wr = s => { try { s ? localStorage.setItem(SKEY, JSON.stringify(s)) : localStorage.removeItem(SKEY); } catch (e) { /* 저장 불가 */ } };
  const kor = m => /invalid_invite|Database error saving new user/i.test(m) ? '초대코드가 올바르지 않거나 정원이 찼어요. (계속 안 되면 서버의 초대코드 등록을 확인해 주세요)' : /signups? (are )?(not allowed|disabled)/i.test(m) ? '지금은 가입이 막혀 있어요. (서버의 가입 허용 설정 확인 필요)' : kor0(m);
  const kor0 = m => /invalid_invite/.test(m) ? '초대코드가 올바르지 않거나 정원이 찼어요.' : /already registered|already been registered/i.test(m) ? '이미 사용 중인 아이디예요.' : /invalid login/i.test(m) ? '아이디 또는 비밀번호가 맞지 않아요.' : /rate|too many/i.test(m) ? '시도가 너무 많아요. 잠시 뒤에 다시 해 주세요.' : `서버 요청에 실패했어요. 잠시 뒤에 다시 시도해 주세요. (${String(m).slice(0, 90)})`;
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
  const _pre = new Map(); // prefetchInbox 로 받아 둔 값 (한 번 쓰면 지운다)
  return {
    get enabled() { return on(); },
    user: () => (rd() || {}).id || null,
    get userUid() { try { const t = (rd() || {}).access; return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || ''; } catch (e) { return ''; } },
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
    async postNotice(head, body) { await call('/rest/v1/rpc/post_notice', { p_head: head, p_body: body }, await token()); },
    async deleteNotice(id) { await call('/rest/v1/rpc/delete_notice', { p_id: id }, await token()); },
    async listNotices() { return (await call('/rest/v1/rpc/list_notices', {}, await token())) || []; },
    async getProfile(name) { return await call('/rest/v1/rpc/get_profile', { p_name: String(name || '').slice(0, 12) }, await token()); },
    async searchPlayers(q) { return (await call('/rest/v1/rpc/search_players', { p_q: String(q || '').slice(0, 12) }, await token())) || []; },
    async sendFriendReq(uid) { return await call('/rest/v1/rpc/send_friend_req', { p_to: uid }, await token()); },
    async friendInbox() { if (_pre.has('friend_inbox')) { const v = _pre.get('friend_inbox'); _pre.delete('friend_inbox'); return v; } return (await call('/rest/v1/rpc/friend_inbox', {}, await token())) || { incoming: [], results: [] }; },
    async cancelFriendReq(id) { await call('/rest/v1/rpc/cancel_friend_req', { p_id: id }, await token()); },
    async answerFriendReq(id, accept) { return await call('/rest/v1/rpc/answer_friend_req', { p_id: id, p_accept: !!accept }, await token()); },
    async ackFriendReq(id) { await call('/rest/v1/rpc/ack_friend_req', { p_id: id }, await token()); },
    async listFriends() { if (_pre.has('list_friends')) { const v = _pre.get('list_friends'); _pre.delete('list_friends'); return v; } return (await call('/rest/v1/rpc/list_friends', {}, await token())) || []; },
    async removeFriend(uid) { await call('/rest/v1/rpc/remove_friend', { p_uid: uid }, await token()); },
    async sendMail(uid, subject, body, items) { return await call('/rest/v1/rpc/send_mail', { p_to: uid, p_subject: subject, p_body: body, p_items: items }, await token()); },
    async fetchMail() { if (_pre.has('fetch_mail')) { const v = _pre.get('fetch_mail'); _pre.delete('fetch_mail'); return v; } return (await call('/rest/v1/rpc/fetch_mail', {}, await token())) || []; },
    async ackMail(ids) { await call('/rest/v1/rpc/ack_mail', { p_ids: ids }, await token()); },
    async proposeTrade(uid, give, want) { return await call('/rest/v1/rpc/propose_trade', { p_to: uid, p_give: give, p_want: want }, await token()); },
    async tradeInbox() { if (_pre.has('trade_inbox')) { const v = _pre.get('trade_inbox'); _pre.delete('trade_inbox'); return v; } return (await call('/rest/v1/rpc/trade_inbox', {}, await token())) || { incoming: [], sent: [], results: [] }; },
    async answerTrade(id, accept) { return await call('/rest/v1/rpc/answer_trade', { p_id: id, p_accept: !!accept }, await token()); },
    async cancelTrade(id) { return await call('/rest/v1/rpc/cancel_trade', { p_id: id }, await token()); },
    async ackTrade(id) { await call('/rest/v1/rpc/ack_trade', { p_id: id }, await token()); },
    async announceRank(rank) { return await call('/rest/v1/rpc/announce_rank', { p_rank: rank }, await token()); },
    /* 실시간 교환 */
    async marketList(key, item, qty, price, mk) { // 제작자 표시가 있을 때만 p_mk 를 보낸다. 서버가 아직 옛 SQL이면 표시 없이 다시 올린다
      const b = { p_ckey: key, p_item: item, p_qty: qty, p_price: price };
      if (!mk) return await call('/rest/v1/rpc/market_list', b, await token());
      try { return await call('/rest/v1/rpc/market_list', { ...b, p_mk: mk }, await token()); }
      catch (e) { if (/market_list|PGRST|function/i.test(String(e && e.message))) return await call('/rest/v1/rpc/market_list', b, await token()); throw e; }
    },
    async marketBrowse(q) { return await call('/rest/v1/rpc/market_browse', { p_q: q || '' }, await token()); },
    async marketMine() { return await call('/rest/v1/rpc/market_mine', {}, await token()); },
    async marketBuy(id, qty, req) { return await call('/rest/v1/rpc/market_buy', { p_id: id, p_qty: qty, p_req: req }, await token()); },
    async marketCancel(id) { return await call('/rest/v1/rpc/market_cancel', { p_id: id }, await token()); },
    async marketAck(id) { await call('/rest/v1/rpc/market_ack', { p_id: id }, await token()); },
    async getRoom(name) { return await call('/rest/v1/rpc/get_room', { p_name: name }, await token()); },
    async setRoomBg(img) { return await call('/rest/v1/rpc/set_room_bg', { p_img: img || '' }, await token()); },
    async myRoomBg() { return await call('/rest/v1/rpc/get_my_room_bg', {}, await token()); },
    async nearbyPlayers(loc) { return await call('/rest/v1/rpc/nearby_players', { p_loc: loc || '' }, await token()); },
    async liveTradeView() { return await call('/rest/v1/rpc/live_trade_view', {}, await token()); },
    async liveTradeInvite(uid) { return await call('/rest/v1/rpc/live_trade_invite', { p_to: uid }, await token()); },
    async liveTradeAnswer(id, accept) { return await call('/rest/v1/rpc/live_trade_answer', { p_id: id, p_accept: !!accept }, await token()); },
    async liveTradeSet(id, items, cr) { return await call('/rest/v1/rpc/live_trade_set', { p_id: id, p_items: items, p_cr: cr | 0 }, await token()); },
    async liveTradeConfirm(id, ver) { return await call('/rest/v1/rpc/live_trade_confirm', { p_id: id, p_ver: ver }, await token()); },
    async liveTradeCancel(id) { return await call('/rest/v1/rpc/live_trade_cancel', { p_id: id }, await token()); },
    async liveTradeAck(id) { await call('/rest/v1/rpc/live_trade_ack', { p_id: id }, await token()); },
    async guildInfo() { if (_pre.has('guild_info')) { const v = _pre.get('guild_info'); _pre.delete('guild_info'); return v; } return await call('/rest/v1/rpc/guild_info', {}, await token()); },
    async guildCreate(name) { return await call('/rest/v1/rpc/guild_create', { p_name: name }, await token()); },
    async guildSearch(q) { return (await call('/rest/v1/rpc/guild_search', { p_q: String(q || '').slice(0, 12) }, await token())) || []; },
    async searchGuildTargets(q) { return (await call('/rest/v1/rpc/search_players_guild', { p_q: String(q || '').slice(0, 12) }, await token())) || []; },
    async guildInvite(uid) { return await call('/rest/v1/rpc/guild_invite', { p_to: uid }, await token()); },
    async guildApply(id) { return await call('/rest/v1/rpc/guild_apply', { p_guild: id }, await token()); },
    async guildAnswer(id, accept) { return await call('/rest/v1/rpc/guild_answer', { p_id: id, p_accept: !!accept }, await token()); },
    async guildCancel(id) { await call('/rest/v1/rpc/guild_cancel', { p_id: id }, await token()); },
    async guildRename(name) { return await call('/rest/v1/rpc/guild_rename', { p_name: name }, await token()); },
    async guildLeave() { await call('/rest/v1/rpc/guild_leave', {}, await token()); },
    async setPlace(p, spd, fol, eta) { // eta: 이동이 끝날 때까지 남은 ms (옛 서버면 빼고 다시 보낸다)
      const b = { p_place: String(p || '').slice(0, 40), p_spd: Math.max(0, Math.min(600, Math.round(+spd) || 0)), p_fol: !!fol };
      if (!this._noEta) { try { return await call('/rest/v1/rpc/set_place', { ...b, p_eta: Math.max(0, Math.min(3600000, Math.round(+eta) || 0)) }, await token()); } catch (e) { if (!/404|PGRST202|Could not find|function/i.test(String(e && e.message))) throw e; this._noEta = true; } }
      return await call('/rest/v1/rpc/set_place', b, await token());
    },
    async partyInfo() { return await call('/rest/v1/rpc/party_info', {}, await token()); },
    async partyInvite(uid) { return await call('/rest/v1/rpc/party_invite', { p_to: uid }, await token()); },
    async partyAnswer(id, accept) { return await call('/rest/v1/rpc/party_answer', { p_id: id, p_accept: !!accept }, await token()); },
    async partyLeave() { await call('/rest/v1/rpc/party_leave', {}, await token()); },
    async partyKick(uid) { return await call('/rest/v1/rpc/party_kick', { p_uid: uid }, await token()); },
    async setAvatar(img) { await call('/rest/v1/rpc/set_avatar', { p_img: img || '' }, await token()); },
    async setAvatarBig(img) { await call('/rest/v1/rpc/set_avatar_big', { p_img: img || '' }, await token()); },
    async avatarBig(name) { return await call('/rest/v1/rpc/get_avatar_big', { p_name: name }, await token()); },
    async getAvatars(names) { return (await call('/rest/v1/rpc/get_avatars', { p_names: names.slice(0, 40) }, await token())) || {}; },
    async chatSend(channel, body) { return await call('/rest/v1/rpc/chat_send', { p_channel: channel, p_body: body }, await token()); },
    async prefetchInbox() { // 친구·메일·교환·길드 소식을 요청 한 번으로 받아 두고, 뒤따르는 각 함수 호출이 한 번씩 꺼내 쓴다 (서버에 poll_inbox 가 없으면 아무것도 안 함)
      _pre.clear(); if (this._noInbox) return false;
      try { const r = await call('/rest/v1/rpc/poll_inbox', {}, await token()); if (r && typeof r === 'object') { Object.entries(r).forEach(([k, v]) => _pre.set(k, k === 'guild_info' ? v : (v || (k === 'list_friends' || k === 'fetch_mail' ? [] : v)))); return true; } }
      catch (e) { if (/404|PGRST202|Could not find/i.test(String(e && e.message))) this._noInbox = true; }
      return false;
    },
    clearPrefetch() { _pre.clear(); },
    async duelList() { return (await call('/rest/v1/rpc/duel_list', {}, await token())) || []; },
    async duelCreate(title, snap, team) { const b = { p_title: String(title || '').slice(0, 20), p_snap: snap }; try { return await call('/rest/v1/rpc/duel_create', { ...b, p_team: team === 2 ? 2 : 1 }, await token()); } catch (e) { if (!/404|PGRST202|Could not find/i.test(String(e && e.message))) throw e; return await call('/rest/v1/rpc/duel_create', b, await token()); } },
    async duelJoin(id, team, snap) { return await call('/rest/v1/rpc/duel_join', { p_room: id, p_team: team, p_snap: snap }, await token()); },
    async duelLeave(id) { await call('/rest/v1/rpc/duel_leave', { p_room: id }, await token()); },
    async duelStart(id) { return await call('/rest/v1/rpc/duel_start', { p_room: id }, await token()); },
    async duelView(id) { return await call('/rest/v1/rpc/duel_view', { p_room: id }, await token()); },
    async chatFetchAll(after) { return (await call('/rest/v1/rpc/chat_fetch_all', { p_after: after }, await token())) || {}; },
    async chatFetch(channel, after) { return (await call('/rest/v1/rpc/chat_fetch', { p_channel: channel, p_after: after || 0 }, await token())) || []; },
    async isAdmin() { return (await call('/rest/v1/rpc/is_admin', {}, await token())) === true; },
    /* → { rev, data, at } | null(서버에 세이브 없음) */
    async myItemMailCount() { return await call('/rest/v1/rpc/my_item_mail_count', {}, await token()); }, // 내가 보낸 아이템 메일 중 서버에 남은 수
    async head() { return await call('/rest/v1/rpc/save_head', {}, await token()); }, // { rev, dev, created } 만 (가벼운 확인)
    async pull(keepRev) { const j = await call('/rest/v1/rpc/pull_save', {}, await token()); if (j && !keepRev) { const s = rd(); if (s) { s.rev = j.rev; wr(s); } } return j; },
    /* 이 기기가 마지막으로 서버와 맞춘 버전 */
    rev() { const s = rd(); return s && Number.isFinite(s.rev) ? s.rev : 0; },
    setRev(r) { const s = rd(); if (s && Number.isFinite(r)) { s.rev = r; wr(s); } },
    /* 서버 백업 (supabase/backups.sql) */
    async listBackups() { return (await call('/rest/v1/rpc/list_backups', {}, await token())) || []; },
    async getBackup(id) { return await call('/rest/v1/rpc/get_backup', { p_id: id }, await token()); },
    async deleteBackup(id) { return await call('/rest/v1/rpc/delete_backup', { p_id: id }, await token()); },
    async backupNow() { return await call('/rest/v1/rpc/backup_now', {}, await token()); },
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
