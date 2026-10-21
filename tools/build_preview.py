"""미리보기 단일 HTML 빌드. 사용법: python3 tools/build_preview.py 출력경로.html
- css/js를 인라인하고, CSP 메타를 제거하고(인라인 스크립트가 필요), BGM을 base64로 넣고, 가입 링크를 뺀다.
- 개발자 도구(js/dev.js)는 이 빌드에 처음부터 합쳐진다. 배포본(index.html)에서는 설정의 개발자 코드를 맞게 입력했을 때만 불러온다.
"""
import base64, re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
out = Path(sys.argv[1])
h = (ROOT / 'index.html').read_text(encoding='utf8')
h = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>\n?', '', h)
h = h.replace('<title>공중도시 DEEP LAYER</title>', '<title>DEEP LAYER UI</title>')
for css in ('theme', 'style'):
    h = h.replace(f'<link rel="stylesheet" href="css/{css}.css">', '<style>\n' + (ROOT / f'css/{css}.css').read_text(encoding='utf8') + '\n</style>')
bgm = 'data:audio/mpeg;base64,' + base64.b64encode((ROOT / 'audio/bgm.mp3').read_bytes()).decode()
def js(name):
    t = (ROOT / f'js/{name}.js').read_text(encoding='utf8')
    if name == 'data':
        t = t.replace("'audio/bgm.mp3'", "'" + bgm + "'")
    if name == 'cloud':
        t = t.replace("location.replace('signup.html')", 'void 0')
    if name == 'ui':
        t = t.replace('<a class="btn-link" href="signup.html">가입 페이지</a>', '').replace('<a class="btn-link" href="signup.html">가입</a>', '').replace("location.href = 'signup.html'", "location.reload()")
        t += '\n' + (ROOT / 'js/dev.js').read_text(encoding='utf8')  # 미리보기에는 개발자 도구가 처음부터 켜져 있다
    return t
for n in ('data', 'core', 'cloud', 'ui'):
    h = h.replace(f'<script src="js/{n}.js"></script>', '<script>\n' + js(n) + '\n</script>')
assert 'src="js/' not in h and 'href="css/' not in h
out.write_text(h, encoding='utf8')
print('OK', out, round(out.stat().st_size / 1024 / 1024, 1), 'MB')
