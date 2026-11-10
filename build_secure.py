#!/usr/bin/env python3
"""
Сборка защищённой версии дашборда КНП.

Из исходника с открытыми данными собирает папку сайта из шести файлов:
  index.html, config.js, app.js, style.css, logo.webp — интерфейс без данных;
  knp.bin — данные, зашифрованные паролем (AES-256-GCM, PBKDF2-SHA256, 600 000 итераций).
Все шесть файлов выкладываются вместе, в корень сайта.

Запуск:
    pip install cryptography
    python build_secure.py ИСХОДНИК_НЕ_ПУБЛИКОВАТЬ.html site

Пароль запрашивается интерактивно и нигде не сохраняется.
Сам скрипт и исходник на сайт НЕ выкладывать: исходник содержит открытые данные.
"""
import base64, getpass, json, os, re, sys
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ITER = 600_000
DATA_FILE = 'knp.bin'

def build(src_path, out_dir, password):
    s = open(src_path, encoding='utf-8').read()
    m_data = re.search(r'^let DATA = (.*);$', s, re.M)
    m_map = re.search(r'^let MAP_HTML = (.*);$', s, re.M)
    if not (m_data and m_map and re.search(r'^const PAYLOAD = null;$', s, re.M)):
        sys.exit('Это не исходник дашборда: не найдены let DATA / let MAP_HTML / const PAYLOAD = null.')
    plain = json.dumps({'d': json.loads(m_data.group(1)), 'm': json.loads(m_map.group(1))},
                       ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    salt, iv = os.urandom(16), os.urandom(12)
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(password.encode('utf-8'))
    blob = salt + iv + AESGCM(key).encrypt(iv, plain, None)
    s = s[:m_data.start()] + 'let DATA = null;' + s[m_data.end():]
    s = re.sub(r'^let MAP_HTML = .*;$', lambda _: "let MAP_HTML = '';", s, count=1, flags=re.M)
    s = re.sub(r'^const PAYLOAD = null;$', lambda _: 'const PAYLOAD = %s;' % json.dumps({'v': 2, 'iter': ITER, 'file': DATA_FILE}), s, count=1, flags=re.M)
    os.makedirs(out_dir, exist_ok=True)
    w = lambda name, data, mode='w': open(os.path.join(out_dir, name), mode, **({'encoding': 'utf-8'} if mode == 'w' else {})).write(data)
    # логотип — отдельным файлом
    logos = re.findall(r'data:image/webp;base64,([A-Za-z0-9+/=]+)', s)
    if logos:
        w('logo.webp', base64.b64decode(logos[0]), 'wb')
        s = re.sub(r'data:image/webp;base64,[A-Za-z0-9+/=]+', 'logo.webp', s)
    # стили — в style.css
    css = []
    def take_css(m): css.append(m.group(2)); return ''
    s = re.sub(r'<style([^>]*)>(.*?)</style>', take_css, s, flags=re.S)
    w('style.css', '\n'.join(css))
    s = s.replace('</head>', '<link rel="stylesheet" href="style.css">\n</head>', 1)
    # скрипты — в отдельные файлы, порядок сохраняется
    names = iter(['config.js', 'app.js'])
    def take_js(m):
        name = next(names); w(name, m.group(1)); return f'<script src="{name}"></script>'
    s = re.sub(r'<script>(.*?)</script>', take_js, s, flags=re.S)
    w('index.html', s)
    w(DATA_FILE, blob, 'wb')
    files = sorted(os.listdir(out_dir))
    print('Готово, папка ' + out_dir + ':')
    for f in files: print(f'  {f:12} {os.path.getsize(os.path.join(out_dir, f))//1024} КБ')

if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit('Использование: python build_secure.py ИСХОДНИК_НЕ_ПУБЛИКОВАТЬ.html папка_сайта')
    pw = os.environ.get('KNP_PASSWORD') or getpass.getpass('Пароль: ')
    if len(pw) < 12:
        sys.exit('Пароль слишком короткий: нужно не меньше 12 символов.')
    if not os.environ.get('KNP_PASSWORD') and getpass.getpass('Повторите пароль: ') != pw:
        sys.exit('Пароли не совпадают.')
    build(sys.argv[1], sys.argv[2], pw)
