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
server = {'rev': 0, 'data': None, 'pushes': [], 'sent': [], 'incoming': [], 'results': [], 'answers': [], 'acks': [], 'friends': [], 'mails': [], 'inmail': [], 'mack': [], 'props': [], 'tb': {'incoming': [], 'sent': [], 'results': []}, 'tans': [], 'tack': [], 'gcalls': [], 'ginfo': {'guild': None, 'incoming': [], 'sent': []}}
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
    if '/rpc/answer_friend_req' in u: server['answers'].append([body.get('p_id'), body.get('p_accept')]); server['incoming'] = []; return route.fulfill(headers=h, body=json.dumps({'ok': True, 'name': '하늘'}))
    if '/rpc/ack_friend_req' in u: server['acks'].append(body.get('p_id')); server['results'] = []; return route.fulfill(headers=h, body='null')
    if '/rpc/list_friends' in u: return route.fulfill(headers=h, body=json.dumps(server['friends']))
    if '/rpc/send_mail' in u: server['mails'].append(body); return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    if '/rpc/fetch_mail' in u: return route.fulfill(headers=h, body=json.dumps(server['inmail']))
    if '/rpc/ack_mail' in u: server['mack'].extend(body.get('p_ids', [])); server['inmail'] = []; return route.fulfill(headers=h, body='null')
    if '/rpc/propose_trade' in u: server['props'].append(body); return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    if '/rpc/trade_inbox' in u: return route.fulfill(headers=h, body=json.dumps(server['tb']))
    if '/rpc/answer_trade' in u: server['tans'].append([body.get('p_id'), body.get('p_accept')]); server['tb']['incoming'] = []; return route.fulfill(headers=h, body=json.dumps({'ok': True, 'name': '하늘', 'give': [['목재', 3]], 'want': [['약초', 2]]}))
    if '/rpc/ack_trade' in u: server['tack'].append(body.get('p_id')); server['tb']['results'] = []; return route.fulfill(headers=h, body='null')
    if '/rpc/guild_info' in u: return route.fulfill(headers=h, body=json.dumps(server['ginfo']))
    if '/rpc/guild_create' in u: server['gcalls'].append(['create', body]); server['ginfo']['guild'] = {'id': 1, 'name': body['p_name'], 'master': True, 'members': [{'uid': 'me', 'name': pg_name[0], 'master': True}]}; return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    if '/rpc/guild_search' in u: return route.fulfill(headers=h, body=json.dumps([{'id': 4, 'name': '별빛길드', 'count': 3, 'master': '하늘'}]))
    if '/rpc/search_players_guild' in u: return route.fulfill(headers=h, body=json.dumps([{'uid': '44444444-4444-4444-4444-444444444444', 'name': '새싹', 'rank': 'F', 'level': '2'}]))
    if '/rpc/guild_invite' in u: server['gcalls'].append(['invite', body]); return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    if '/rpc/guild_apply' in u: server['gcalls'].append(['apply', body]); return route.fulfill(headers=h, body=json.dumps({'ok': True}))
    if '/rpc/guild_answer' in u: server['gcalls'].append(['answer', body]); server['ginfo']['incoming'] = []; return route.fulfill(headers=h, body=json.dumps({'ok': True, 'joined': True}))
    if '/rpc/guild_leave' in u: server['gcalls'].append(['leave', body]); server['ginfo']['guild'] = None; return route.fulfill(headers=h, body='null')
    if '/rpc/is_admin' in u: return route.fulfill(headers=h, body='true')
    if '/rpc/pull_save' in u:
        return route.fulfill(headers=h, body=json.dumps(None if server['data'] is None else {'rev': server['rev'], 'data': server['data'], 'at': '2026-10-21T03:00:00Z'}))
    if '/rpc/push_save' in u:
        if body['p_rev'] != server['rev']: return route.fulfill(headers=h, body=json.dumps({'ok': False, 'rev': server['rev']}))
        server['rev'] += 1; server['data'] = body['p_data']; server['pushes'].append(server['rev'])
        return route.fulfill(headers=h, body=json.dumps({'ok': True, 'rev': server['rev']}))
    route.fulfill(status=404, headers=h, body='{}')
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
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
    check('settings_shows_logged_in_with_save_and_load_right', cr_[2]['x'] > cr_[1]['x'] and ls_['x'] > cr_[2]['r'] - 1 and ll_['x'] > ls_['x'] and abs(ls_['y'] - cr_[1]['y']) < 6 and cr_[1]['y'] > cr_[0]['y'] and pg.locator('.cloudrow button').count() == 4, [cr_, ls_, ll_])
    pg.evaluate("state.money=777;save()"); pg.click('[data-act="cloud-push"]'); pg.wait_for_timeout(300)
    check('manual_push_bumps_rev', server['rev'] == 4 and server['data']['money'] == 777, server['rev'])
    server['rev'] = 9  # 다른 기기가 먼저 저장
    pg.evaluate("openSettings()"); pg.click('[data-act="cloud-push"]'); pg.wait_for_timeout(300)
    check('conflict_blocks_push', server['rev'] == 9 and pg.evaluate("_cloudBlocked") is True)
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
    pg.evaluate("openFriends()"); pg.wait_for_timeout(400)
    check('incoming_request_listed', pg.locator('#friendInbox [data-act="friend-accept"]').count() == 1 and '하늘' in pg.inner_text('#friendInbox') and not pg.evaluate("state.friends.includes('하늘')"))
    check('friend_icon_dot_on_request', pg.locator('[data-system="친구"].has-dot').count() == 1)
    pg.click('#friendInbox [data-act="friend-accept"]'); pg.wait_for_timeout(400)
    check('friend_icon_dot_cleared', pg.locator('[data-system="친구"].has-dot').count() == 0)
    check('accept_makes_friend', pg.evaluate("state.friends.includes('하늘')") and server['answers'] == [[7, True]], server['answers'])
    # 내가 보낸 신청이 수락됨 → 목록에 추가되고 결과 확인(ack)
    server['results'] = [{'id': 9, 'name': '미나', 'status': 'accepted'}]
    pg.evaluate("friendPoll()"); pg.wait_for_timeout(500)
    check('accepted_result_adds_friend_and_acks', pg.evaluate("state.friends.includes('미나')") and server['acks'] == [9], server['acks'])
    # ---------- 메일 / 교환 (서버) ----------
    UID_H = '33333333-3333-3333-3333-333333333333'
    server['friends'] = [{'uid': UID_H, 'name': '하늘'}]
    pg.evaluate("friendPoll()"); pg.wait_for_timeout(500)
    check('friend_uid_map_loaded', pg.evaluate("view.friendUid['하늘']") == UID_H)
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
    pg.fill('#guildQ', '새'); pg.click('[data-act="guild-find-player"]'); pg.wait_for_timeout(400); pg.click('[data-act="guild-invite-req"]'); pg.wait_for_timeout(400)
    check('guild_invite_sent', ['invite', {'p_to': '44444444-4444-4444-4444-444444444444'}] in server['gcalls'], [server['gcalls'], pg.inner_text('#modalBody')[:300]])
    pg.evaluate("closeModal()")
    pg.evaluate("openSettings()"); pg.click('[data-act="cloud-pull"]'); pg.wait_for_timeout(1000)
    check('pull_replaces_local_and_reloads', pg.evaluate("state.money") == 4242, pg.evaluate("state.money"))
    pg.evaluate("document.querySelector('#tutorial').classList.add('hidden')")
    pg.evaluate("openSettings()")
    check('settings_has_no_logout_or_signup_link', pg.locator('[data-act="cloud-logout"]').count() == 0 and pg.locator('a[href="signup.html"]').count() == 0)
    pg.evaluate("closeModal()"); pg.click('#logoutBtn'); pg.click('[data-act="logout-ok"]'); pg.wait_for_timeout(900)
    check('logout_returns_to_signup', pg.url.endswith('signup.html') and pg.evaluate("Cloud.user()") is None)
    b.close()
print('FAILED' if fails else 'ALL OK', fails)
sys.exit(1 if fails else 0)
