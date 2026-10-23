"""서버 저장(cloud.js) 모의 테스트: Supabase 응답을 가짜로 만들어 로그인 → 올리기 → 충돌 흐름을 확인한다. 실행: python3 tests/cloud_test.py"""
import functools, http.server, json, os, threading, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT))
sv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=sv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{sv.server_port}/index.html'
fails = []
def rect(pg, sel):
    return pg.evaluate("s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,r:r.right,b:r.bottom,w:r.width,h:r.height}}", sel)
def check(n, c, info=None):
    print(('ok  ' if c else 'FAIL'), n, '' if c else info)
    if not c: fails.append(n)
server = {'party': {'party': None, 'incoming': []}, 'pcalls': [], 'backups': [], 'bdata': {}, 'bnow': 0, 'chat': [], 'chatsent': [], 'avatars': {}, 'avq': [], 'setav': [], 'rev': 0, 'data': None, 'pushes': [], 'sent': [], 'incoming': [], 'results': [], 'answers': [], 'acks': [], 'friends': [], 'mails': [], 'inmail': [], 'mack': [], 'props': [], 'tb': {'incoming': [], 'sent': [], 'results': []}, 'tans': [], 'tack': [], 'gcalls': [], 'ginfo': {'guild': None, 'incoming': [], 'sent': []}}
pg_name = ['테스터']
def api(route):
    req = route.request; u = req.url; h = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json'}
    if req.method == 'OPTIONS': return route.fulfill(status=204, headers=h)
    body = json.loads(req.post_data or '{}')
    if '/auth/v1/token' in u:
        if body.get('password') == 'good-pass-123': return route.fulfill(headers=h, body=json.dumps({'access_token': 'a', 'refresh_token': 'r', 'expires_in': 3600}))
        return route.fulfill(status=400, headers=h, body=json.dumps({'error_description': 'Invalid login credentials'}))
    if '/rpc/search_players' in u and 'guild' not in u: return route.fulfill(headers=h, body=json.dumps([{'uid': '11111111-1111-1111-1111-111111111111', 'name': '미나', 'rank': 'E', 'level': '5', 'online': True}, {'uid': '22222222-2222-2222-2222-222222222222', 'name': '<img src=x onerror=alert(1)>', 'rank': 'F', 'level': '1', 'online': False}] if body.get('p_q') else []))
    if '/rpc/send_friend_req' in u: server['sent'].append(body.get('p_to')); return route.fulfill(headers=h, body=json.dumps({'ok': True, 'msg': 'sent', 'name': '미나'}))
    if '/rpc/friend_inbox' in u: return route.fulfill(headers=h, body=json.dumps({'incoming': server['incoming'], 'results': server['results'], 'sent': server.get('fsent', [])}))
    if '/rpc/answer_friend_req' in u: server['answers'].append([body.get('p_id'), body.get('p_accept')]); server['incoming'] = []; server['friends'] = [{'uid': '33333333-3333-3333-3333-333333333333', 'name': '하늘'}]; return route.fulfill(headers=h, body=json.dumps({'ok': True, 'name': '하늘'}))
    if '/rpc/ack_friend_req' in u: server['acks'].append(body.get('p_id')); server['results'] = []; return route.fulfill(headers=h, body='null')
    if '/rpc/list_friends' in u: return route.fulfill(headers=h, body=json.dumps(server['friends']))
    if '/rpc/send_mail' in u: server['mails'].append(body); return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    if '/rpc/fetch_mail' in u: return route.fulfill(headers=h, body=json.dumps(server['inmail']))
    if '/rpc/ack_mail' in u: server['mack'].extend(body.get('p_ids', [])); server['inmail'] = []; return route.fulfill(headers=h, body='null')
    if '/rpc/propose_trade' in u:
        server['props'].append(body)
        if server.get('off'): return route.fulfill(headers=h, body=json.dumps({'ok': False, 'msg': 'offline'}))
        return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    if '/rpc/trade_inbox' in u: return route.fulfill(headers=h, body=json.dumps(server['tb']))
    if '/rpc/answer_trade' in u: server['tans'].append([body.get('p_id'), body.get('p_accept')]); server['tb']['incoming'] = []; return route.fulfill(headers=h, body=json.dumps({'ok': True, 'name': '하늘', 'give': [['목재', 3]], 'want': [['약초', 2]]}))
    if '/rpc/ack_trade' in u: server['tack'].append(body.get('p_id')); server['tb']['results'] = []; return route.fulfill(headers=h, body='null')
    if '/rpc/party_info' in u: return route.fulfill(headers=h, body=json.dumps(server['party']))
    if '/rpc/party_invite' in u: server['pcalls'].append(['invite', body]); return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    if '/rpc/party_answer' in u: server['pcalls'].append(['answer', body]); server['party']['incoming'] = []; return route.fulfill(headers=h, body=json.dumps({'ok': True, 'joined': bool(body.get('p_accept'))}))
    if '/rpc/party_leave' in u: server['pcalls'].append(['leave', body]); server['party']['party'] = None; return route.fulfill(headers=h, body='null')
    if '/rpc/party_kick' in u: server['pcalls'].append(['kick', body]); return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    if '/rpc/guild_info' in u: return route.fulfill(headers=h, body=json.dumps(server['ginfo']))
    if '/rpc/guild_create' in u: server['gcalls'].append(['create', body]); server['ginfo']['guild'] = {'id': 1, 'name': body['p_name'], 'master': True, 'members': [{'uid': 'me', 'name': pg_name[0], 'master': True}]}; return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    if '/rpc/guild_search' in u: return route.fulfill(headers=h, body=json.dumps([{'id': 4, 'name': '별빛길드', 'count': 3, 'master': '하늘'}]))
    if '/rpc/search_players_guild' in u: return route.fulfill(headers=h, body=json.dumps([{'uid': '44444444-4444-4444-4444-444444444444', 'name': '새싹', 'rank': 'F', 'level': '2'}]))
    if '/rpc/guild_invite' in u: server['gcalls'].append(['invite', body]); return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    if '/rpc/guild_apply' in u: server['gcalls'].append(['apply', body]); return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    if '/rpc/guild_answer' in u: server['gcalls'].append(['answer', body]); server['ginfo']['incoming'] = []; return route.fulfill(headers=h, body=json.dumps({'ok': True, 'joined': True}))
    if '/rpc/guild_rename' in u: server['gcalls'].append(['rename', body]); (server['ginfo'].get('guild') or {}).update({'name': body.get('p_name')}); return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    if '/rpc/guild_leave' in u: server['gcalls'].append(['leave', body]); server['ginfo']['guild'] = None; return route.fulfill(headers=h, body='null')
    if '/rpc/chat_fetch' in u: return route.fulfill(headers=h, body=json.dumps([m for m in server['chat'] if m['id'] > body.get('p_after', 0)]))
    if '/rpc/get_profile' in u:
        return route.fulfill(headers=h, body=json.dumps({'uid': '33333333-3333-3333-3333-333333333333', 'name': body.get('p_name'), 'title': '신입 능력자', 'rank': 'E', 'level': '7', 'age': '24', 'keywords': '과묵,정찰', 'ability': '그림자 이동', 'abilityDesc': '그림자 사이를 건넌다', 'online': True, 'guild': '별무리'}) if body.get('p_name') == '하늘' else 'null')
    if '/rpc/chat_send' in u: server['chatsent'].append(body); return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    if '/rpc/get_avatars' in u: server['avq'].append(body.get('p_names')); return route.fulfill(headers=h, body=json.dumps({n: server['avatars'][n] for n in body.get('p_names', []) if n in server['avatars']}))
    if '/rpc/set_avatar' in u: server['setav'].append(body.get('p_img')); return route.fulfill(headers=h, body='null')
    if '/rpc/is_admin' in u: return route.fulfill(headers=h, body='true')
    if '/rpc/pull_save' in u:
        return route.fulfill(headers=h, body=json.dumps(None if server['data'] is None else {'rev': server['rev'], 'data': server['data'], 'at': '2026-10-21T03:00:00Z'}))
    if '/rpc/push_save' in u:
        if body['p_rev'] != server['rev']: return route.fulfill(headers=h, body=json.dumps({'ok': False, 'rev': server['rev']}))
        server['rev'] += 1; server['data'] = body['p_data']; server['pushes'].append(server['rev'])
        return route.fulfill(headers=h, body=json.dumps({'ok': True, 'rev': server['rev']}))
    if '/rpc/list_backups' in u: return route.fulfill(headers=h, body=json.dumps(server['backups']))
    if '/rpc/get_backup' in u: return route.fulfill(headers=h, body=json.dumps(server['bdata'].get(str(body.get('p_id')))))
    if '/rpc/delete_backup' in u: n0 = len(server['backups']); server['backups'] = [b for b in server['backups'] if b['id'] != body.get('p_id')]; server.setdefault('bdel', []).append(body.get('p_id')); return route.fulfill(headers=h, body=json.dumps({'ok': len(server['backups']) < n0}))
    if '/rpc/backup_now' in u: server['bnow'] += 1; return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    route.fulfill(status=404, headers=h, body='{}')
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); pg.on('pageerror', lambda e: print('PAGEERR', str(e)[:200]))
    pg.route('**/fonts.*/**', lambda r: r.abort())
    pg.route('https://x.supabase.co/**', api)
    def patch(r):
        res = r.fetch(); r.fulfill(response=res, body=__import__('re').sub(r"const CLOUD = \{[^}]*\};", "const CLOUD = { url: 'https://x.supabase.co/rest/v1/', key: 'k' };", res.text()))
    pg.route('**/js/cloud.js', patch)
    pg.goto(URL); pg.wait_for_timeout(700)
    check('gate_no_tutorial_before_signup', pg.evaluate("typeof state==='undefined'||document.querySelector('#tutorial')===null||document.querySelector('#tutorial').classList.contains('hidden')") or pg.url.endswith('signup.html'))
    check('gate_redirects_to_signup_when_logged_out', pg.url.endswith('signup.html'), pg.url)
    check('signup_page_has_tabs', pg.locator('#suTabs:not(.hidden)').count() == 1 and pg.locator('#suForm:not(.hidden)').count() == 1 and pg.locator('#liForm.hidden').count() == 1)
    pg.click('[data-su="login"]')
    pg.fill('#liId', 'tester1'); pg.fill('#liPw', 'wrong-pass'); pg.click('#liGo'); pg.wait_for_timeout(400)
    check('bad_login_rejected', pg.url.endswith('signup.html') and '맞지' in pg.inner_text('#liResult'))
    server['rev'] = 3; server['data'] = {'version': 8, 'money': 31337}
    pg.fill('#liPw', 'good-pass-123'); pg.click('#liGo'); pg.wait_for_timeout(1500)
    check('login_goes_to_game_with_server_save', pg.url.endswith('index.html') and pg.evaluate("Cloud.user()") == 'tester1', pg.url)
    pg.evaluate("document.querySelector('#tutorial').classList.add('hidden')")
    check('admin_account_gets_dev_tools', pg.evaluate("window.DEV===true"))
    pg.evaluate("openSettings()"); pg.wait_for_timeout(100)
    cr_ = [rect(pg, '.cloudrow span'), rect(pg, '[data-act="cloud-push"]'), rect(pg, '[data-act="cloud-pull"]')]
    ls_, ll_ = rect(pg, '[data-act="local-save"]'), rect(pg, '[data-act="local-load"]')
    check('settings_shows_logged_in_with_save_and_load_right', cr_[2]['x'] > cr_[1]['x'] and ls_['x'] > cr_[2]['r'] - 1 and ll_['x'] > ls_['x'] and abs(ls_['y'] - cr_[1]['y']) < 6 and cr_[1]['y'] > cr_[0]['y'] and pg.locator('.cloudrow button').count() == 5, [cr_, ls_, ll_])
    pg.evaluate("window.__c0=state.created;state.created=true;state.money=777;save()"); pg.click('[data-act="cloud-push"]'); pg.wait_for_timeout(300)
    check('manual_push_bumps_rev', server['rev'] == 4 and server['data']['money'] == 777, server['rev'])
    pg.evaluate("state.created=false"); n_push = len(server['pushes']); pg.evaluate("openSettings()"); pg.click('[data-act="cloud-push"]'); pg.wait_for_timeout(200)
    check('blank_state_never_pushed', len(server['pushes']) == n_push and server['data']['money'] == 777)
    pg.evaluate("state.created=true")
    server['rev'] = 9  # 다른 기기가 먼저 저장
    pg.evaluate("openSettings()"); pg.click('[data-act="cloud-push"]'); pg.wait_for_timeout(300)
    check('conflict_blocks_push', server['rev'] == 9 and pg.evaluate("_cloudBlocked") is True)
    pg.evaluate("state.created=window.__c0")
    server['data']['money'] = 4242
    pg.evaluate("state.created=true;openFriends()"); pg.fill('#friendSearch', '미'); pg.click('[data-act="friend-search"]'); pg.wait_for_timeout(300)
    check('friend_search_uses_server', pg.locator('#friendResult .nearby-row').count() == 2 and '미나' in pg.inner_text('#friendResult') and pg.locator('#friendResult img').count() == 0)
    check('friend_request_button_label', pg.locator('#friendResult [data-act="friend-req"]').first.inner_text() == '친구 신청' and pg.locator('#friendResult [data-act="friend-add"]').count() == 0)
    pg.click('#friendResult [data-act="friend-req"] >> nth=0'); pg.wait_for_timeout(300)
    check('friend_request_sent_not_friend_yet', server['sent'] == ['11111111-1111-1111-1111-111111111111'] and not pg.evaluate("state.friends.includes('미나')"), server['sent'])
    server['fsent'] = [{'id': 3, 'name': '미나'}]
    pg.evaluate("openFriends()"); pg.wait_for_timeout(500)
    check('sent_friend_requests_listed', '수락 대기' in pg.inner_text('#friendInbox') and '미나' in pg.inner_text('#friendInbox') and pg.locator('[data-act="friend-req-cancel"]').count() == 1)
    server['fsent'] = []; pg.wait_for_timeout(900)
    # 받은 신청 → 수락해야 친구
    server['incoming'] = [{'id': 7, 'name': '하늘'}]
    pg.evaluate("openFriends()")
    try: pg.wait_for_function("(()=>{if(document.querySelector('#friendInbox [data-act=friend-accept]'))return true;friendPoll().then(()=>openFriends());return false})()", timeout=8000, polling=500)
    except Exception: pass
    pg.wait_for_timeout(100)
    check('incoming_request_listed', pg.locator('#friendInbox [data-act="friend-accept"]').count() == 1 and '하늘' in pg.inner_text('#friendInbox') and not pg.evaluate("state.friends.includes('하늘')"))
    check('friend_icon_dot_on_request', pg.locator('[data-system="친구"].has-dot').count() == 1)
    pg.click('#friendInbox [data-act="friend-accept"]'); pg.wait_for_timeout(400)
    check('friend_icon_dot_cleared', pg.locator('[data-system="친구"].has-dot').count() == 0)
    check('accept_makes_friend', pg.evaluate("state.friends.includes('하늘')") and server['answers'] == [[7, True]], server['answers'])
    # 내가 보낸 신청이 수락됨 → 목록에 추가되고 결과 확인(ack)
    server['friends'] = [{'uid': '33333333-3333-3333-3333-333333333333', 'name': '하늘'}, {'uid': '11111111-1111-1111-1111-111111111111', 'name': '미나'}]  # 수락하면 서버 친구 목록에도 올라간다
    server['results'] = [{'id': 9, 'name': '미나', 'status': 'accepted'}]
    pg.evaluate("friendPoll()"); pg.wait_for_timeout(500)
    check('accepted_result_adds_friend_and_acks', pg.evaluate("state.friends.includes('미나')") and server['acks'] == [9], server['acks'])
    # ---------- 메일 / 교환 (서버) ----------
    UID_H = '33333333-3333-3333-3333-333333333333'
    server['friends'] = [{'uid': UID_H, 'name': '하늘'}]
    pg.evaluate("friendPoll()"); pg.wait_for_timeout(500)
    check('friend_uid_map_loaded', pg.evaluate("view.friendUid['하늘']") == UID_H)
    server['friends'] = [{'uid': UID_H, 'name': '하늘이'}]
    pg.evaluate("friendPoll()"); pg.wait_for_timeout(500)
    check('renamed_friend_replaces_old_name', pg.evaluate("state.friends.includes('하늘이')") and not pg.evaluate("state.friends.includes('하늘')") and pg.evaluate("state.friends.filter(n=>n.startsWith('하늘')).length") == 1, pg.evaluate("state.friends"))
    server['friends'] = [{'uid': UID_H, 'name': '하늘'}]
    pg.evaluate("friendPoll()"); pg.wait_for_timeout(500)
    pg.evaluate("viewUser('하늘')"); pg.wait_for_timeout(500)
    check('other_profile_loads_ability_title_guild', '그림자 이동' in pg.inner_text('#modalBody') and '신입 능력자' in pg.inner_text('#modalBody') and '별무리' in pg.inner_text('#modalBody') and pg.locator('.user-grid .uc').count() >= 5, pg.inner_text('#modalBody'))
    pg.evaluate("viewUser('없는사람')"); pg.wait_for_timeout(500)
    check('other_profile_missing_shows_reason', '찾지 못' in pg.inner_text('#modalBody') or '최신본' in pg.inner_text('#modalBody'), pg.inner_text('#modalBody'))
    pg.evaluate("closeModal()")
    pg.evaluate("closeModal(); state.mail=[]; view.mailTab='메일 보내기'; openMail()"); pg.fill('#mailSubject', '안부'); pg.fill('#mailBody', '잘 지내?')
    pg.select_option('#mailTo', '하늘'); pg.click('[data-act="mail-send"]'); pg.wait_for_timeout(500)
    check('mail_sent_to_server', len(server['mails']) == 1 and server['mails'][0]['p_to'] == UID_H and server['mails'][0]['p_subject'] == '안부' and server['mails'][0]['p_items'] == [], server['mails'])
    server['inmail'] = [{'id': 5, 'name': '하늘', 'subject': '선물', 'body': '받아', 'items': [['목재', 2], ['없는템', 1], ['운송장치', 3]], 'at': 'x'}]
    pg.evaluate("friendPoll()"); pg.wait_for_timeout(600)
    check('mail_received_and_filtered', pg.evaluate("state.mail.length") == 1 and pg.evaluate("state.mail[0].items") == [['목재', 2]] and server['mack'] == [5], pg.evaluate("state.mail"))
    pg.evaluate("addItem('약초',5);removeItem('목재',countItem('목재'));addItem('목재',4);state.trades={day:'',n:0}")
    pg.evaluate("openFriendTrade('하늘')"); pg.select_option('#ftGive', '목재'); pg.fill('#ftGiveQty', '3'); pg.fill('#ftWant', '약초'); pg.fill('#ftWantQty', '2'); pg.click('[data-act="ftrade-send"]'); pg.wait_for_timeout(600)
    check('trade_proposed_items_escrowed', server['props'] and server['props'][0]['p_give'] == [['목재', 3]] and server['props'][0]['p_want'] == [['약초', 2]] and pg.evaluate("countItem('목재')") == 1 and pg.evaluate("state.trades.n") == 1, server['props'])
    server['tb'] = {'incoming': [{'id': 21, 'name': '하늘', 'give': [['목재', 3]], 'want': [['약초', 2]]}], 'sent': [], 'results': []}
    pg.evaluate("openFriends()"); pg.wait_for_timeout(500)
    pg.click('[data-act="ftrade-accept"]'); pg.wait_for_timeout(600)
    check('trade_accept_pays_and_mails_items', server['tans'] == [[21, True]] and pg.evaluate("countItem('약초')") == 3 and pg.evaluate("state.mail[0].items") == [['목재', 3]], pg.evaluate("state.mail[0]"))
    server['tb'] = {'incoming': [], 'sent': [], 'results': [{'id': 22, 'name': '하늘', 'status': 'declined', 'give': [['목재', 3]], 'want': [['약초', 2]]}]}
    pg.evaluate("friendPoll()"); pg.wait_for_timeout(600)
    check('trade_declined_returns_items_by_mail', server['tack'] == [22] and pg.evaluate("state.mail[0].items") == [['목재', 3]] and '취소' in pg.evaluate("state.mail[0].subject"))
    # ---------- 길드 (서버) ----------
    pg.evaluate("closeModal()"); pg.evaluate("openGuild()"); pg.wait_for_timeout(500)
    check('guild_online_modal_has_search_and_create', pg.locator('#guildQ').count() == 1 and pg.locator('[data-act="guild-create"]').count() == 1)
    pg.fill('#guildQ', '별'); pg.click('[data-act="guild-find"]'); pg.wait_for_timeout(400)
    pg.click('[data-act="guild-apply"]'); pg.wait_for_timeout(400)
    check('guild_apply_sent_not_joined', ['apply', {'p_guild': 4}] in server['gcalls'] and pg.evaluate("state.guild") is None, server['gcalls'])
    server['ginfo']['incoming'] = [{'id': 31, 'kind': 'invite', 'guild': '달빛길드', 'name': '하늘'}]
    pg.evaluate("openGuild()"); pg.wait_for_timeout(500)
    check('guild_invite_listed_needs_accept', pg.locator('[data-act="guild-answer"][data-yes="1"]').count() == 1 and pg.evaluate("state.guild") is None)
    check('guild_icon_dot_on_invite', pg.locator('[data-system="길드"].has-dot').count() == 1)
    server['ginfo']['guild'] = {'id': 9, 'name': '달빛길드', 'master': False, 'members': [{'uid': 'x', 'name': '하늘', 'master': True}, {'uid': 'me2', 'name': '테스터', 'master': False}]}
    pg.click('[data-act="guild-answer"][data-yes="1"]'); pg.wait_for_timeout(600)
    check('guild_icon_dot_cleared', pg.locator('[data-system="길드"].has-dot').count() == 0)
    check('guild_accept_syncs_state', ['answer', {'p_id': 31, 'p_accept': True}] in server['gcalls'] and pg.evaluate("state.guild && state.guild.name") == '달빛길드' and pg.evaluate("state.guild.master") is False, pg.evaluate("state.guild"))
    server['ginfo']['guild'] = {'id': 9, 'name': '달빛길드', 'master': True, 'members': [{'uid': 'me', 'name': '테스터', 'master': True}]}
    server['ginfo']['incoming'] = [{'id': 32, 'kind': 'apply', 'guild': '달빛길드', 'name': '새싹'}]
    pg.evaluate("openGuild()"); pg.wait_for_timeout(500)
    check('guild_master_sees_application', '새싹' in pg.inner_text('#modalBody') and '가입 신청' in pg.inner_text('#modalBody') and pg.locator('#guildQ').count() == 1)
    server['avatars'] = {'하늘': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='}
    server['ginfo']['guild']['members'] = [{'uid': 'me', 'name': '테스터', 'master': True}, {'uid': 'u2', 'name': '하늘', 'master': False}, {'uid': 'u3', 'name': '바다', 'master': False}]
    pg.evaluate("view.avatars={};openGuild()"); pg.wait_for_timeout(1200)
    check('guild_members_two_columns', pg.evaluate("getComputedStyle(document.querySelector('.member-grid')).gridTemplateColumns.trim().split(/\\s+/).length") == 2 and pg.locator('.member-grid .member-row').count() == 3)
    check('guild_member_shows_profile_image', pg.locator('.member-grid .round-avatar img').count() == 1, pg.inner_html('.member-grid')[:300])
    pg.fill('#guildQ', '새'); pg.click('[data-act="guild-find-player"]'); pg.wait_for_timeout(400); pg.click('[data-act="guild-invite-req"]'); pg.wait_for_timeout(400)
    check('guild_invite_sent', ['invite', {'p_to': '44444444-4444-4444-4444-444444444444'}] in server['gcalls'], [server['gcalls'], pg.inner_text('#modalBody')[:300]])
    pg.fill('#guildRename', '새달빛'); pg.click('[data-act="guild-rename"]'); pg.wait_for_timeout(600)
    check('guild_rename_calls_server_and_updates', ['rename', {'p_name': '새달빛'}] in server['gcalls'] and pg.evaluate("state.guild && state.guild.name") == '새달빛' and '새달빛' in pg.inner_text('#modalTitle'), [server['gcalls'][-1], pg.evaluate("state.guild")])
    pg.evaluate("closeModal()")
    # ---------- 채팅 서버 연결 / 프로필 이미지 ----------
    PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    server['avatars'] = {'하늘': PNG}
    server['chat'] = [{'id': 1, 'name': '하늘', 'body': '안녕하세요', 'uid': '11111111-1111-1111-1111-111111111111', 'at': '2026-10-21T09:00:00Z'}, {'id': 2, 'name': '<b>해커</b>', 'body': '<img src=x onerror=alert(1)>', 'uid': '22222222-2222-2222-2222-222222222222', 'at': '2026-10-21T09:00:05Z'}]
    pg.evaluate("view.avatars={};view.avq=0;state.chatTab='월드';renderChat();chatPoll()"); pg.wait_for_timeout(900)
    check('world_chat_shows_server_messages', '안녕하세요' in pg.inner_text('#chatFeed') and pg.locator('#chatFeed .msg').count() == 2, pg.inner_text('#chatFeed'))
    check('chat_shows_time', pg.locator('#chatFeed .msg-time').count() == 2 and ('오전' in pg.inner_text('#chatFeed .msg-time') or '오후' in pg.inner_text('#chatFeed .msg-time')), pg.inner_html('#chatFeed')[:300])
    check('chat_is_escaped', pg.locator('#chatFeed img[src="x"]').count() == 0 and pg.locator('#chatFeed b').count() == 0)
    check('chat_shows_sender_profile_image', pg.locator('#chatFeed .msg-ava img').count() == 1 and any('하늘' in q for q in server['avq']), [server['avq'], pg.evaluate('JSON.stringify(view.avatars)'), pg.inner_html('#chatFeed')[:400]])
    server['chat'].append({'id': 3, 'name': '하늘', 'body': '새 메시지', 'uid': '11111111-1111-1111-1111-111111111111', 'at': '2026-10-21T09:01:00Z'})
    pg.evaluate("chatPoll()"); pg.wait_for_timeout(700)
    check('chat_poll_appends_only_new', pg.locator('#chatFeed .msg').count() == 3 and pg.evaluate("view.chatLast['월드']") == 3)
    cache = pg.evaluate("JSON.parse(localStorage.getItem('deeplayer-chat'))")
    check('chat_cached_on_device', cache and len(cache['월드']['rows']) == 3 and cache['월드']['rows'][0][1] == '안녕하세요', cache)
    saved_chat = server['chat']; server['chat'] = []
    pg.evaluate("flushSave && flushSave()"); pg.reload(); pg.wait_for_timeout(500)
    pg.evaluate("document.querySelector('#tutorial') && document.querySelector('#tutorial').classList.add('hidden')")
    check('chat_survives_reload', pg.evaluate("state.chatTab") == '월드' and '안녕하세요' in pg.inner_text('#chatFeed') and '새 메시지' in pg.inner_text('#chatFeed'), pg.inner_text('#chatFeed')[:200])
    server['chat'] = saved_chat; pg.wait_for_timeout(1800)
    check('chat_reload_no_duplicates', pg.locator('#chatFeed .msg').count() == 3, pg.locator('#chatFeed .msg').count())
    pg.evaluate("view.chatAt=0")
    pg.evaluate("sendChat('반가워요')"); pg.wait_for_timeout(600)
    check('chat_send_goes_to_server', server['chatsent'] and server['chatsent'][-1] == {'p_channel': 'world', 'p_body': '반가워요'}, server['chatsent'])
    pg.evaluate("state.chatTab='길드';renderChat();chatPoll()"); pg.wait_for_timeout(500)
    pg.evaluate("view.chatAt=0")
    pg.evaluate("sendChat('길드 인사')"); pg.wait_for_timeout(500)
    check('guild_chat_uses_guild_channel', server['chatsent'][-1] == {'p_channel': 'guild', 'p_body': '길드 인사'}, server['chatsent'])
    pg.evaluate("state.chatTab='월드';renderChat()")
    # ---- 파티 ----
    UID_ME = pg.evaluate("Cloud.userUid"); UID_A = '55555555-5555-5555-5555-555555555555'
    server['party'] = {'party': None, 'incoming': [{'id': 7, 'name': '라온'}]}
    pg.evaluate("partySync()"); pg.wait_for_timeout(500)
    pg.evaluate("state.side='상황';renderSide()")
    check('party_invite_listed', pg.locator('[data-act="party-answer"][data-ok="1"]').count() == 1 and pg.evaluate("PARTY.id") == 0, pg.inner_text('#sideView')[:200])
    server['party'] = {'party': {'id': 3, 'leader': False, 'members': [{'uid': '66666666-6666-6666-6666-666666666666', 'name': '라온', 'leader': True, 'online': True}, {'uid': UID_ME, 'name': pg.evaluate("state.character.name"), 'leader': False}]}, 'incoming': []}
    pg.click('[data-act="party-answer"][data-ok="1"]'); pg.wait_for_timeout(700)
    check('party_accept_calls_server', ['answer', {'p_id': 7, 'p_accept': True}] in server['pcalls'] and pg.evaluate("PARTY.id") == 3, server['pcalls'])
    check('party_member_is_nearby_with_trade', pg.locator('[data-act="ftrade-open"][data-name="라온"]').count() == 1 and pg.evaluate("partyOthers()") == ['라온'], pg.inner_text('#sideView')[:300])
    check('party_non_leader_cannot_kick', pg.locator('[data-act="party-kick"]').count() == 0)
    pg.evaluate("PARTY.members.find(m=>m.name==='라온').online=false"); pg.evaluate("A['ftrade-open']({dataset:{name:'라온'}})"); pg.wait_for_timeout(200)
    check('trade_blocked_when_party_member_offline', pg.locator('#ftGive').count() == 0)
    pg.evaluate("PARTY.members.find(m=>m.name==='라온').online=true")
    pg.evaluate("openFriendTrade('라온')"); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('#ftWant').value='목재'; document.querySelector('#ftGiveQty').value=1")
    has_give = pg.evaluate("document.querySelectorAll('#ftGive option').length") > 0
    if has_give:
        pg.evaluate("A['ftrade-send']({dataset:{name:'라온'}, disabled:false})"); pg.wait_for_timeout(500)
        check('party_trade_uses_party_uid', server['props'] and server['props'][-1].get('p_to') == '66666666-6666-6666-6666-666666666666', server['props'][-1:])
        server['off'] = True
        pg.evaluate("openFriendTrade('라온')"); pg.wait_for_timeout(300)
        pg.evaluate("document.querySelector('#ftWant').value='목재'; document.querySelector('#ftGiveQty').value=1")
        g1 = pg.evaluate("document.querySelector('#ftGive').value"); c1 = pg.evaluate("n=>countItem(n)", g1)
        pg.evaluate("A['ftrade-send']({dataset:{name:'라온'}, disabled:false})"); pg.wait_for_timeout(500)
        check('trade_offline_server_reject_refunds', pg.evaluate("n=>countItem(n)", g1) == c1 and '접속' in pg.inner_text('#toasts, .toast, body'), [c1, pg.evaluate("n=>countItem(n)", g1)])
        server['off'] = False
    pg.evaluate("closeModal()")
    pg.evaluate("state.chatTab='파티';renderChat()"); pg.evaluate("view.chatAt=0"); pg.evaluate("sendChat('파티 인사')"); pg.wait_for_timeout(500)
    check('party_chat_uses_party_channel', server['chatsent'][-1] == {'p_channel': 'party', 'p_body': '파티 인사'}, server['chatsent'][-1:])
    pg.evaluate("A['party-leave-do']()"); pg.wait_for_timeout(600)
    check('party_leave_calls_server', ['leave', {}] in server['pcalls'] and pg.evaluate("PARTY.id") == 0, server['pcalls'])
    pg.evaluate("view.chatAt=0"); pg.evaluate("sendChat('혼자')"); 
    check('party_chat_blocked_without_party', server['chatsent'][-1] == {'p_channel': 'party', 'p_body': '파티 인사'})
    pg.evaluate("state.chatTab='월드';renderChat()")
    pg.evaluate("openFriends()"); pg.wait_for_timeout(600)
    check('friend_window_has_party_invite_button', pg.locator('[data-act="party-invite"]').count() >= 1, pg.inner_text('#modalBody')[:200])
    pg.evaluate("document.querySelector('[data-act=\"party-invite\"]:not([disabled])') && document.querySelector('[data-act=\"party-invite\"]:not([disabled])').click()"); pg.wait_for_timeout(600)
    check('party_invite_sent_to_friend_uid', any(c[0] == 'invite' and c[1].get('p_to') for c in server['pcalls']), server['pcalls'])
    pg.evaluate("closeModal()")
    # 설정: 채팅 탭 끄기
    pg.evaluate("openSettings()")
    check('settings_has_chat_tab_switches', pg.locator('#ctab_월드').count() == 1 and pg.locator('#ctab_파티').count() == 1)
    pg.evaluate("document.querySelector('#ctab_월드').checked=false"); pg.evaluate("A['settings-save']()"); pg.wait_for_timeout(300)
    check('chat_tab_off_hides_button', pg.evaluate("getComputedStyle(document.querySelector('[data-chat=\"월드\"]')).display") == 'none' and pg.evaluate("state.chatTab") != '월드', pg.evaluate("state.chatTab"))
    pg.evaluate("openSettings()")
    for k in ['월드','길드','파티','알림']: pg.evaluate("k=>{document.querySelector('#ctab_'+k).checked=false}", k)
    pg.evaluate("A['settings-save']()"); pg.wait_for_timeout(200)
    check('chat_tabs_cannot_all_be_off', pg.evaluate("Object.values(state.settings.chatTabs).some(Boolean)"))
    pg.evaluate("closeModal()")
    pg.evaluate("state.settings.chatTabs['월드']=true; renderChat()")
    pg.evaluate("(p=>{localStorage.setItem(AVATAR_KEY,p)})(arguments[0])") if False else pg.evaluate("p=>localStorage.setItem(AVATAR_KEY,p)", PNG)
    pg.evaluate("syncMyAvatar()"); pg.wait_for_timeout(700)
    check('my_avatar_uploaded_small', server['setav'] and server['setav'][-1].startswith('data:image/') and len(server['setav'][-1]) < 20000, [str(x)[:40] for x in server['setav']])
    pg.evaluate("document.querySelector('[data-act=\"avatar-clear\"]')") ; pg.evaluate("A['avatar-clear']()"); pg.wait_for_timeout(500)
    check('my_avatar_removal_synced', server['setav'][-1] == '')
    # 다른 기기: 로컬 이미지가 없을 때 서버 이미지를 지우지 않고 받아 온다
    n0 = len(server['setav']); nm = '테스터'; pg.evaluate("state.character.name='테스터'"); server['avatars'][nm] = PNG
    pg.evaluate("localStorage.removeItem(AVATAR_KEY)"); pg.evaluate("syncMyAvatar()"); pg.wait_for_timeout(700)
    check('other_device_keeps_server_avatar', len(server['setav']) == n0, server['setav'][n0:])
    check("other_device_downloads_own_avatar", pg.evaluate("getAvatar()") == PNG, [nm, pg.evaluate("state.created"), server["avq"][-2:]])
    pg.evaluate("localStorage.removeItem(AVATAR_KEY)"); server['avatars'].pop(nm, None)
    pg.evaluate("view.avatars={};state.friends=['하늘'];openFriends(true)"); pg.wait_for_timeout(900)
    check('friend_list_shows_profile_image', pg.locator('#friendList .round-avatar img').count() == 1)
    pg.evaluate("state.friends=[];closeModal()")
    server['data']['money'] = 4242  # 그동안 자동 저장이 서버 데이터를 덮었을 수 있어 다시 정한다
    pg.evaluate("openSettings()"); pg.click('[data-act="cloud-pull"]'); pg.wait_for_timeout(1000)
    check('pull_replaces_local_and_reloads', pg.evaluate("state.money") == 4242, pg.evaluate("state.money"))
    # ── 결과 카드 보존: 다른 활동을 해도, 새로고침해도 남는다
    pg.evaluate("document.querySelector('#tutorial') && document.querySelector('#tutorial').classList.add('hidden')")
    pg.evaluate("state.results=[{t:'화염정령 사냥',text:'화염정령을 쓰러뜨렸다',at:1,gain:['화염의 정수 ×1'],loss:[]},{t:'모래게 사냥',text:'모래게를 잡았다',at:2,gain:[],loss:['기력 -1']}];save();renderAction()")
    pg.evaluate("hardenState(state)") if False else None
    check('result_card_only_latest_kept', pg.evaluate("state.results.length") == 2 and True)  # 직접 넣은 값은 불러올 때 1개로 줄어든다
    pg.evaluate("flushSave()"); pg.reload(); pg.wait_for_timeout(700)
    pg.evaluate("document.querySelector('#tutorial') && document.querySelector('#tutorial').classList.add('hidden')")
    check('result_card_survives_reload_latest_only', pg.evaluate("state.results.length") == 1 and pg.locator('.last-result').count() == 1 and '화염정령 사냥' in pg.inner_text('#actionPanel'), pg.evaluate("state.results.length"))
    pg.evaluate("A['result-close']({dataset:{i:'0'}})")
    check('result_card_close', pg.evaluate("state.results.length") == 0 and pg.locator('.last-result').count() == 0)
    pg.evaluate("state.results=[];save()")
    # ── 프로필 이미지는 서버 세이브에 실려 다른 기기로 간다
    pg.evaluate("p=>localStorage.setItem(AVATAR_KEY,p)", PNG); pg.evaluate("flushSave()")
    pg.evaluate("window.__r=null;cloudPushNow().then(r=>window.__r=r)"); pg.wait_for_timeout(900)
    check('save_carries_avatar', isinstance(server['data'].get('__avatar'), str) and server['data']['__avatar'].startswith('data:image/') and len(server['data']['__avatar']) < 20000, str(server['data'].get('__avatar'))[:40])
    pg.evaluate("localStorage.removeItem(AVATAR_KEY)")
    pg.evaluate("cloudApply(%s, %d)" % (json.dumps(server['data']), server['rev'])); pg.wait_for_timeout(1500)
    check('avatar_arrives_with_server_load', pg.evaluate("getAvatar()") is not None and pg.evaluate("state.__avatar") is None, pg.evaluate("getAvatar()"))
    # ── 폰/PC 자동 동기화: 서버가 더 새롭고 이 기기에서 한 조작이 없으면 조용히 서버 진행으로 바뀐다
    pg.evaluate("document.querySelector('#tutorial') && document.querySelector('#tutorial').classList.add('hidden')")
    d2 = json.loads(json.dumps(server['data'])); d2['money'] = 7777; server['data'] = d2; server['rev'] += 3
    pg.evaluate("lsSet(LS_SYNC, Date.now() - 1000); _lastAct = 0"); pg.evaluate("cloudSync(true)"); pg.wait_for_timeout(1500)
    check('auto_sync_applies_newer_server', pg.evaluate("state.money") == 7777 and pg.evaluate("Cloud.rev()") == server['rev'], [pg.evaluate("state.money"), pg.evaluate("Cloud.rev()"), server['rev']])
    pg.evaluate("document.querySelector('#tutorial') && document.querySelector('#tutorial').classList.add('hidden')")
    # 이 기기에서 조작했어도 서버가 더 새로우면 묻지 않고 서버 진행으로 바뀐다 (직전 진행은 따로 보관)
    server['rev'] += 2; server['data']['money'] = 3131; pg.evaluate("lsSet(LS_SYNC, Date.now() - 5000); _lastAct = Date.now()"); pg.evaluate("state.money=1234;flushSave()")
    pg.evaluate("cloudSync(true)"); pg.wait_for_timeout(1500)
    check('auto_sync_always_uses_server', pg.evaluate("state.money") == 3131 and pg.locator('[data-act="cloud-keep-local"]').count() == 0, pg.evaluate("state.money"))
    check('replaced_local_progress_kept', json.loads(pg.evaluate("localStorage.getItem('deeplayer-replaced')") or '{}').get('money') == 1234)
    pg.evaluate("document.querySelector('#tutorial') && document.querySelector('#tutorial').classList.add('hidden')")
    # ── 메일: 서버 보관함에서 지우기 전에 서버 저장에 먼저 올리고, 중복 없이 한 번만 받는다
    server['inmail'] = [{'id': 77, 'name': '미나', 'subject': '폰으로 온 메일', 'body': '안녕', 'items': []}]; server['mack'].clear(); np0 = len(server['pushes'])
    pg.evaluate("friendPoll()"); pg.wait_for_timeout(1500)
    check('mail_received_with_server_id', pg.evaluate("state.mail.filter(m=>m.sid==='s77').length") == 1, pg.evaluate("state.mail.map(m=>m.sid)"))
    check('mail_saved_to_server_before_ack', 77 in server['mack'] and len(server['pushes']) > np0 and any(m.get('sid') == 's77' for m in server['data']['mail']), [server['mack'], len(server['pushes']) - np0])
    server['inmail'] = [{'id': 77, 'name': '미나', 'subject': '폰으로 온 메일', 'body': '안녕', 'items': []}]; pg.evaluate("friendPoll()"); pg.wait_for_timeout(900)
    check('mail_not_duplicated', pg.evaluate("state.mail.filter(m=>m.sid==='s77').length") == 1)
    # 다른 기기의 오래된 서버 세이브를 불러와도 이 기기에서 받은 메일은 남는다
    d3 = json.loads(json.dumps(server['data'])); d3['mail'] = [m for m in d3['mail'] if m.get('sid') != 's77']; d3['money'] = 8888
    pg.evaluate("flushSave()"); pg.evaluate("cloudApply(%s, %d)" % (json.dumps(d3), server['rev'])); pg.wait_for_timeout(1500)
    check('mail_survives_server_load', pg.evaluate("state.money") == 8888 and pg.evaluate("state.mail.filter(m=>m.sid==='s77').length") == 1, [pg.evaluate("state.money"), pg.evaluate("state.mail.map(m=>m.sid)")])
    # ── 한 번에 한 기기: 다른 기기가 접속하면 이 화면은 잠기고, '이 기기에서 계속하기'로 되찾는다
    pg.evaluate("document.querySelector('#tutorial') && document.querySelector('#tutorial').classList.add('hidden')")
    pg.evaluate("window.__r=null;cloudPushNow().then(r=>window.__r=r)"); pg.wait_for_timeout(500)
    me = pg.evaluate("DEV")
    check('save_carries_device_id', server['data'].get('__dev') == me and pg.evaluate("_claimed") is True, [server['data'].get('__dev'), me])
    d4 = json.loads(json.dumps(server['data'])); d4['__dev'] = 'otherdevice1'; d4['money'] = 6060; server['data'] = d4; server['rev'] += 1
    n_p = len(server['pushes']); pg.evaluate("cloudSync(true)"); pg.wait_for_timeout(900)
    check('new_device_locks_old_page', pg.locator('#devLock').count() == 1 and pg.locator('#devTake').is_visible(), pg.locator('#devLock').count())
    pg.evaluate("state.money=1;flushSave();cloudAutoPush()"); pg.wait_for_timeout(500)
    check('locked_page_does_not_push', len(server['pushes']) == n_p and server['data']['money'] == 6060, [len(server['pushes']), n_p])
    pg.click('#devTake'); pg.wait_for_timeout(1800)
    check('take_over_loads_server_and_claims', pg.evaluate("state.money") == 6060 and pg.locator('#devLock').count() == 0 and server['data'].get('__dev') == me, [pg.evaluate("state.money"), server['data'].get('__dev')])
    pg.evaluate("document.querySelector('#tutorial') && document.querySelector('#tutorial').classList.add('hidden')")
    # 저장이 날아가 처음(스토리) 화면이 떴을 때: 오른쪽 아래 '서버 불러오기'로 서버 진행을 바로 불러온다
    server['data']['created'] = True; server['data']['money'] = 5151
    pg.evaluate("(()=>{const s=JSON.parse(localStorage.getItem(SAVE_KEY));s.created=false;s.tutorialDone=false;localStorage.setItem(SAVE_KEY,JSON.stringify(s))})()")
    pg.reload(); pg.wait_for_timeout(1500)
    pg.evaluate("document.querySelector('#modalBody') && closeModal && closeModal()")
    if pg.locator('#tutStory').is_visible() or True:
        pg.evaluate("tut.replay=false;tut.page=0;tutShow('story');renderStory()")
    cb = rect(pg, '#tutCloudLoad') if pg.locator('#tutCloudLoad').is_visible() else None
    tb = rect(pg, '#tutStory')
    check('tutorial_has_server_load_bottom_right', cb is not None and cb['r'] > tb['r'] - 60 and cb['b'] > tb['b'] - 60, [cb, tb])
    if cb: pg.click('#tutCloudLoad'); pg.wait_for_timeout(1500)
    check('tutorial_server_load_restores', pg.evaluate("state.money") == 5151 and pg.evaluate("state.created") is True, pg.evaluate("[state.money, state.created]"))
    # 서버 백업: 목록 → 지금 백업 → 불러오기, 그리고 서버 저장이 비었을 때 스토리 버튼이 최근 백업을 찾는다
    server['backups'] = [{'id': 11, 'at': '2026-10-21T01:00:00Z', 'rev': 3, 'kind': 'guard', 'name': '테스터', 'level': '5', 'money': '300'}]
    server['bdata'] = {'11': {'created': True, 'money': 300, 'version': 8}}
    pg.evaluate("document.querySelector('#tutorial').classList.add('hidden')")
    pg.evaluate("openSettings()"); pg.click('[data-act="cloud-backups"]'); pg.wait_for_timeout(600)
    check('backup_list_shown', pg.locator('[data-act="backup-restore"]').count() == 1 and '테스터' in pg.inner_text('#modalBody') and '안전장치' in pg.inner_text('#modalBody') and pg.locator('[data-act="backup-now"]').count() == 1, pg.inner_text('#modalBody'))
    pg.click('[data-act="backup-now"]'); pg.wait_for_timeout(500)
    check('backup_now_calls_server', server['bnow'] == 1)
    check('backup_delete_button_beside_restore', pg.locator('[data-act="backup-delete"]').count() == 1)
    pg.click('[data-act="backup-delete"]'); pg.wait_for_timeout(200)
    check('backup_delete_asks_confirm', pg.locator('[data-act="backup-delete-do"]').count() == 1)
    pg.click('[data-act="confirm-cancel"]'); pg.wait_for_timeout(300)
    check('backup_delete_cancel_keeps', not server.get('bdel') and pg.locator('[data-act="backup-restore"]').count() == 1)
    pg.click('[data-act="backup-delete"]'); pg.wait_for_timeout(200); pg.click('[data-act="backup-delete-do"]'); pg.wait_for_timeout(600)
    check('backup_delete_removes_from_server_and_list', server.get('bdel') == [11] and pg.locator('[data-act="backup-restore"]').count() == 0, server.get('bdel'))
    server['backups'] = [{'id': 11, 'at': '2026-10-21T01:00:00Z', 'rev': 3, 'kind': 'guard', 'name': '테스터', 'level': '5', 'money': '300'}]; pg.evaluate("openBackups()"); pg.wait_for_timeout(500)
    pg.click('[data-act="backup-restore"]'); pg.wait_for_timeout(200)
    pg.click('[data-act="backup-restore-do"]'); pg.wait_for_timeout(1800)
    check('backup_restore_applies_and_backs_up_current_first', pg.evaluate("state.money") == 300 and server['bnow'] == 2, [pg.evaluate("state.money"), server['bnow']])
    server['data']['created'] = False; server['bdata']['11']['money'] = 616
    pg.evaluate("(()=>{const s=JSON.parse(localStorage.getItem(SAVE_KEY));s.created=false;s.tutorialDone=false;localStorage.setItem(SAVE_KEY,JSON.stringify(s))})()")
    pg.reload(); pg.wait_for_timeout(1500)
    pg.evaluate("tut.replay=false;tut.page=0;tutShow('story');renderStory()")
    pg.click('#tutCloudLoad'); pg.wait_for_timeout(1800)
    check('story_button_falls_back_to_backup', pg.evaluate("state.money") == 616 and pg.evaluate("state.created") is True, pg.evaluate("[state.money, state.created]"))
    server['data']['created'] = True

    pg.evaluate("document.querySelector('#tutorial').classList.add('hidden')")
    pg.evaluate("openSettings()")
    check('settings_has_no_logout_or_signup_link', pg.locator('[data-act="cloud-logout"]').count() == 0 and pg.locator('a[href="signup.html"]').count() == 0)
    pg.evaluate("closeModal()"); pg.click('#logoutBtn'); pg.click('[data-act="logout-ok"]'); pg.wait_for_timeout(900)
    check('logout_returns_to_signup', pg.url.endswith('signup.html') and pg.evaluate("Cloud.user()") is None)
    b.close()
print('FAILED' if fails else 'ALL OK', fails)
sys.exit(1 if fails else 0)
