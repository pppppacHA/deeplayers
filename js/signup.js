/* 가입 페이지 화면. 검사 규칙은 auth.js(Check/AuthApi) */
const $s = id => document.getElementById(id);
const msg = (id, t, ok) => { const e = $s(id); e.textContent = t || ''; e.classList.toggle('ok', !!ok && !!t); };
function liveCheck() {
  const id = $s('suId').value.trim().toLowerCase(), pw = $s('suPw').value, pw2 = $s('suPw2').value;
  msg('suIdMsg', id ? (Check.id(id) || '사용할 수 있는 형식이에요.') : '', id && !Check.id(id));
  msg('suPwMsg', pw ? (Check.pw(pw, id) || '좋아요.') : '', pw && !Check.pw(pw, id));
  $s('suMeter').style.width = (pw ? Check.strength(pw) * 25 : 0) + '%';
  msg('suPw2Msg', pw2 ? (pw === pw2 ? '일치해요.' : '비밀번호가 달라요.') : '', pw2 && pw === pw2);
}
['suId', 'suPw', 'suPw2'].forEach(i => $s(i).addEventListener('input', liveCheck));
$s('suForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $s('suGo'), out = $s('suResult');
  btn.disabled = true; out.textContent = ''; out.className = 'su-result';
  ['suIdMsg', 'suInvMsg'].forEach(i => msg(i, ''));
  try {
    const r = await AuthApi.signup({ id: $s('suId').value, pw: $s('suPw').value, pw2: $s('suPw2').value, invite: $s('suInv').value, other: $s('suOther').checked });
    if (r.ok) {
      out.textContent = `가입이 완료되었어요! 이제 게임으로 돌아가 탐색을 시작하세요. ${r.left === '?' ? '' : `(이 초대코드 남은 자리 ${r.left}명)`}`; out.classList.add('ok');
      $s('suForm').querySelectorAll('input').forEach(i => { i.value = ''; i.checked = false; }); liveCheck();
    } else {
      out.textContent = r.err; out.classList.add('err');
      if (r.field === 'invite') msg('suInvMsg', r.err);
      if (r.field === 'id') msg('suIdMsg', r.err);
    }
  } catch (err) { out.textContent = '가입 처리 중 문제가 생겼어요. 잠시 뒤에 다시 시도해 주세요.'; out.classList.add('err'); }
  btn.disabled = false;
});

/* ---- 서버 연결 시: 가입/로그인 탭. 가입·로그인에 성공하면 게임으로 이동한다 ---- */
const goGame = () => { location.href = 'index.html'; };
function suTab(which) {
  $s('suForm').classList.toggle('hidden', which !== 'signup'); $s('liForm').classList.toggle('hidden', which !== 'login');
  $s('suTitle').textContent = which === 'signup' ? '탐색자 등록' : '로그인';
  const note = document.querySelector('.signup-card > p.tiny'); if (note) note.classList.toggle('hidden', which !== 'signup');
  document.querySelectorAll('[data-su]').forEach(b => b.classList.toggle('active', b.dataset.su === which));
}
if (Cloud.enabled) {
  $s('suTabs').classList.remove('hidden'); $s('suBack').classList.add('hidden');
  document.querySelectorAll('[data-su]').forEach(b => b.addEventListener('click', () => suTab(b.dataset.su)));
  if (Cloud.user()) goGame(); // 이미 로그인되어 있으면 바로 게임으로
  $s('liForm').addEventListener('submit', async e => {
    e.preventDefault();
    const out = $s('liResult'), btn = $s('liGo'); btn.disabled = true; out.className = 'su-result'; out.textContent = '';
    try {
      const r = await Cloud.login($s('liId').value, $s('liPw').value);
      if (!r.ok) { out.textContent = r.err; out.classList.add('err'); }
      else {
        const s = await Cloud.pull(); // 서버에 진행이 있으면 이 기기의 저장을 서버 것으로 바꾼다
        if (s && s.data) { try { localStorage.setItem('deeplayer-ui', JSON.stringify(s.data)); } catch (e2) { /* 저장 불가 */ } }
        goGame();
      }
    } catch (err) { out.textContent = '서버와 연결하지 못했어요. 잠시 뒤에 다시 시도해 주세요.'; out.classList.add('err'); }
    btn.disabled = false;
  });
  $s('suForm').addEventListener('submit', () => { /* 가입 성공 후 이동은 아래 관찰자가 처리 */ });
  new MutationObserver(() => { if ($s('suResult').classList.contains('ok') && Cloud.user()) setTimeout(goGame, 900); else if ($s('suResult').classList.contains('ok')) suTab('login'); }).observe($s('suResult'), { attributes: true, childList: true });
}
