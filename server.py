from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse
import json, os, hashlib, hmac, secrets, base64, time, urllib.request, urllib.error
import psycopg
from psycopg.rows import dict_row
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATABASE_URL = os.environ.get('DATABASE_URL','').strip()
SESSION_TTL = 60 * 60 * 24 * 30


def db():
    if not DATABASE_URL:
        raise RuntimeError('DATABASE_URL não configurada. Defina a Internal Database URL do PostgreSQL no Render.')
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def init_db():
    c = db()
    schema = '''
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS operations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      name TEXT,
      volume REAL NOT NULL DEFAULT 0,
      result REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Em andamento',
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS promos (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      operator TEXT,
      benefit REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Em andamento',
      deadline TEXT,
      requirements_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS freebets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      promo_id INTEGER REFERENCES promos(id) ON DELETE SET NULL,
      operator TEXT,
      value REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Disponível',
      deadline TEXT,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bank (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      active REAL NOT NULL DEFAULT 1000,
      reserve REAL NOT NULL DEFAULT 0,
      pocket REAL NOT NULL DEFAULT 0,
      tax REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS goals (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      target REAL NOT NULL DEFAULT 0,
      current REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bank_movements (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      note TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bookmaker_balances (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, name)
    );
    CREATE TABLE IF NOT EXISTS settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      distribution_json TEXT NOT NULL DEFAULT '{"bank":60,"reserve":15,"pocket":15,"tax":10}',
      currency TEXT NOT NULL DEFAULT 'BRL',
      hide_values INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS academy_progress (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(user_id, lesson_id)
    );
    CREATE TABLE IF NOT EXISTS entitlements (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      starts_at INTEGER NOT NULL,
      expires_at INTEGER,
      source TEXT NOT NULL DEFAULT 'system',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, code)
    );
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_code TEXT NOT NULL,
      amount_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'BRL',
      status TEXT NOT NULL DEFAULT 'pending',
      gateway TEXT,
      external_id TEXT UNIQUE,
      paid_at INTEGER,
      access_until INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'system',
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      read_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS user_acquisition (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      first_source TEXT,
      first_medium TEXT,
      first_campaign TEXT,
      first_content TEXT,
      first_term TEXT,
      first_referral_code TEXT,
      first_landing_page TEXT,
      first_referrer TEXT,
      last_source TEXT,
      last_medium TEXT,
      last_campaign TEXT,
      last_content TEXT,
      last_term TEXT,
      last_landing_page TEXT,
      captured_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS referral_codes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversion_events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      event_name TEXT NOT NULL,
      product_code TEXT,
      source TEXT,
      medium TEXT,
      campaign TEXT,
      value_cents INTEGER,
      currency TEXT NOT NULL DEFAULT 'BRL',
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS marketing_spend (
      id SERIAL PRIMARY KEY,
      source TEXT NOT NULL,
      medium TEXT,
      campaign TEXT,
      amount_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'BRL',
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL
    );
    '''
    # PostgreSQL/psycopg does not expose sqlite executescript; execute statements individually.
    with c.cursor() as cur:
        for statement in schema.split(';'):
            statement = statement.strip()
            if statement:
                cur.execute(statement)
        # Idempotent production migrations for the central operation ledger.
        cur.execute("ALTER TABLE operations ADD COLUMN IF NOT EXISTS source_type TEXT")
        cur.execute("ALTER TABLE operations ADD COLUMN IF NOT EXISTS source_id TEXT")
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS operations_source_unique ON operations(user_id, source_type, source_id) WHERE source_type IS NOT NULL AND source_id IS NOT NULL")
        cur.execute("CREATE INDEX IF NOT EXISTS operations_user_created_idx ON operations(user_id, created_at DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications(user_id, created_at DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS conversion_events_user_created_idx ON conversion_events(user_id, created_at DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS conversion_events_campaign_idx ON conversion_events(source, campaign, created_at DESC)")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at INTEGER")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_accepted_at INTEGER")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS age_confirmed_at INTEGER")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version TEXT")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_version TEXT")
    c.commit(); c.close()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    rounds = 210_000
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, rounds)
    return f'pbkdf2_sha256${rounds}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}'


def verify_password(password: str, encoded: str) -> bool:
    try:
        alg, rounds, salt_b64, digest_b64 = encoded.split('$')
        if alg != 'pbkdf2_sha256': return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
        actual = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, int(rounds))
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


def json_response(handler, status, payload):
    raw = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json; charset=utf-8')
    handler.send_header('Content-Length', str(len(raw)))
    handler.send_header('Cache-Control', 'no-store')
    handler.end_headers(); handler.wfile.write(raw)


def read_json(handler):
    try:
        n = int(handler.headers.get('Content-Length', '0'))
        return json.loads(handler.rfile.read(n) or b'{}')
    except Exception:
        return None


def bearer(handler):
    h = handler.headers.get('Authorization','')
    return h[7:] if h.startswith('Bearer ') else None


def current_user(handler):
    token = bearer(handler)
    if not token: return None
    c = db()
    row = c.execute('''SELECT u.id,u.name,u.email FROM sessions s JOIN users u ON u.id=s.user_id
                       WHERE s.token=%s AND s.expires_at>%s''', (token, int(time.time()))).fetchone()
    c.close(); return dict(row) if row else None


def active_entitlements(uid):
    now=int(time.time()); c=db()
    rows=c.execute("SELECT code,status,starts_at,expires_at,source FROM entitlements WHERE user_id=%s AND status='active' AND (expires_at IS NULL OR expires_at>%s) ORDER BY code",(uid,now)).fetchall()
    c.close(); return [dict(r) for r in rows]

def has_entitlement(uid, code):
    return any(x['code']==code for x in active_entitlements(uid))

def grant_basic(uid, now=None):
    now=now or int(time.time()); c=db()
    c.execute("INSERT INTO entitlements(user_id,code,status,starts_at,expires_at,source,created_at,updated_at) VALUES(%s,'EQP_BASIC','active',%s,NULL,'system',%s,%s) ON CONFLICT(user_id,code) DO UPDATE SET status='active',updated_at=excluded.updated_at",(uid,now,now,now)); c.commit(); c.close()


def user_summary(uid):
    c=db()
    ops=[dict(r) for r in c.execute("SELECT * FROM operations WHERE user_id=%s",(uid,))]
    promos=[dict(r) for r in c.execute("SELECT * FROM promos WHERE user_id=%s",(uid,))]
    freebets=[dict(r) for r in c.execute("SELECT * FROM freebets WHERE user_id=%s",(uid,))]
    bank=dict(c.execute("SELECT active,reserve,pocket,tax FROM bank WHERE user_id=%s",(uid,)).fetchone())
    goals=[dict(r) for r in c.execute("SELECT name,target,current FROM goals WHERE user_id=%s",(uid,))]
    c.close()
    done=[o for o in ops if o['status']=='Concluída']
    volume=sum(float(o['volume'] or 0) for o in done)
    gross=sum(float(o['result'] or 0) for o in done)
    costs=0.0
    for o in done:
        try: costs += float(json.loads(o.get('meta_json') or '{}').get('costs') or 0)
        except Exception: pass
    net=gross-costs
    return {'operations':len(ops),'completed':len(done),'volume':volume,'gross_result':gross,'costs':costs,'net_result':net,'roi':(net/volume*100 if volume else 0),'promos_active':sum(1 for x in promos if x['status']!='Concluída'),'freebets_available':sum(1 for x in freebets if x['status']=='Disponível'),'freebets_value':sum(float(x['value'] or 0) for x in freebets if x['status']=='Disponível'),'bank':bank,'goals':goals}

def reset_log(event):
    # Never log addresses, reset links, tokens or API credentials.
    print(f'[EQP password recovery] {event}', flush=True)


def send_password_reset_email(to_email: str, reset_url: str):
    api_key=os.environ.get('RESEND_API_KEY','').strip()
    from_email=os.environ.get('PASSWORD_RESET_FROM_EMAIL','').strip() or 'EQP Centro <onboarding@resend.dev>'
    if not api_key:
        reset_log('configuration_missing_api_key')
        return False
    html=(
        '<div style="font-family:Arial,sans-serif;color:#111">'
        '<h2>Redefinir senha</h2>'
        '<p>Recebemos uma solicitação para redefinir sua senha da EQP Centro.</p>'
        f'<p><a href="{reset_url}" style="display:inline-block;padding:12px 18px;background:#3478F6;color:#fff;text-decoration:none;border-radius:8px">Criar nova senha</a></p>'
        '<p>Este link expira em 30 minutos. Se você não solicitou a troca, ignore este e-mail.</p></div>'
    )
    payload={'from':from_email,'to':[to_email],'subject':'Redefinição de senha • EQP Centro','html':html}
    req=urllib.request.Request('https://api.resend.com/emails',data=json.dumps(payload).encode(),headers={'Authorization':f'Bearer {api_key}','Content-Type':'application/json'},method='POST')
    reset_log('provider_request_started')
    try:
        with urllib.request.urlopen(req,timeout=15) as resp:
            success=200 <= resp.status < 300
            reset_log('provider_accepted' if success else f'provider_unexpected_http_{resp.status}')
            return success
    except urllib.error.HTTPError as e:
        reset_log(f'provider_http_{e.code}')
        try:
            body = e.read().decode('utf-8', errors='replace')
            try:
                details = json.loads(body)
            except (ValueError, TypeError):
                reset_log('provider_error_response_non_json')
            else:
                if not isinstance(details, dict):
                    reset_log('provider_error_response_unexpected_json')
                else:
                    name = details.get('name') or details.get('type') or 'unknown'
                    safe_name = ''.join(ch for ch in str(name).lower() if ch.isascii() and (ch.isalnum() or ch in '_-'))[:60] or 'unknown'
                    message = str(details.get('message') or '').lower()
                    if 'domain' in message:
                        reason = 'domain'
                    elif 'testing' in message or 'test email' in message:
                        reason = 'testing_restriction'
                    elif 'permission' in message or 'access' in message:
                        reason = 'permission'
                    elif 'sender' in message or 'from address' in message:
                        reason = 'sender'
                    elif 'account' in message:
                        reason = 'account'
                    else:
                        reason = 'other'
                    reset_log(f'provider_error_name_{safe_name}')
                    reset_log(f'provider_error_reason_{reason}')
        except Exception:
            reset_log('provider_error_response_unreadable')
        return False
    except Exception as e:
        reset_log('provider_transport_error_'+type(e).__name__)
        return False


def openai_promo_analyze(image_data=None, terms=''):
    key=os.environ.get('OPENAI_API_KEY','').strip()
    if not key: raise RuntimeError('OPENAI_API_KEY não configurada no servidor.')
    content=[{'type':'input_text','text':'Analise esta promoção de apostas apenas para organização. Extraia os termos sem inventar dados. Retorne SOMENTE JSON válido com: title, operator, type, benefit, deadline, min_value, min_odd, count, notes, warnings. Campos desconhecidos devem ser null. warnings deve ser array de strings.'}]
    if terms: content.append({'type':'input_text','text':terms[:12000]})
    if image_data: content.append({'type':'input_image','image_url':image_data})
    payload={'model':os.environ.get('OPENAI_MODEL','gpt-5-mini'),'input':[{'role':'user','content':content}]}
    req=urllib.request.Request('https://api.openai.com/v1/responses',data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=45) as r: out=json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError('Falha na API de IA: '+e.read().decode()[:500])
    text=out.get('output_text')
    if not text:
        parts=[]
        for item in out.get('output',[]):
            for c in item.get('content',[]):
                if c.get('type') in ('output_text','text') and c.get('text'): parts.append(c['text'])
        text=''.join(parts)
    text=(text or '').strip().removeprefix('```json').removesuffix('```').strip()
    return json.loads(text)


def create_session(c, user_id):
    token = secrets.token_urlsafe(32)
    c.execute('INSERT INTO sessions(token,user_id,expires_at) VALUES(%s,%s,%s)',
              (token,user_id,int(time.time())+SESSION_TTL))
    return token


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # Serve frontend files from ROOT and never expose DB.
        parsed = urlparse(path).path.lstrip('/') or 'index.html'
        if parsed in {'server.py','requirements.txt'} or parsed.startswith('.'):
            return str(ROOT / '__blocked__')
        return str(ROOT / parsed)

    def do_OPTIONS(self):
        self.send_response(204); self.end_headers()

    def do_GET(self):
        p = urlparse(self.path).path
        if p == '/api/health': return json_response(self,200,{'ok':True,'app':'EQP Centro','version':'17'})
        if p == '/api/me':
            u=current_user(self)
            return json_response(self,200,{'user':u}) if u else json_response(self,401,{'error':'Não autenticado'})
        if p == '/api/bootstrap':
            u=current_user(self)
            if not u: return json_response(self,401,{'error':'Não autenticado'})
            c=db(); uid=u['id']
            ops=[dict(r) for r in c.execute('SELECT * FROM operations WHERE user_id=%s ORDER BY id',(uid,))]
            promos=[dict(r) for r in c.execute('SELECT * FROM promos WHERE user_id=%s ORDER BY id',(uid,))]
            freebets=[dict(r) for r in c.execute('SELECT * FROM freebets WHERE user_id=%s ORDER BY id',(uid,))]
            bank=dict(c.execute('SELECT active,reserve,pocket,tax FROM bank WHERE user_id=%s',(uid,)).fetchone())
            goals=[dict(r) for r in c.execute('SELECT id,name,target,current FROM goals WHERE user_id=%s ORDER BY id',(uid,))]
            movements=[dict(r) for r in c.execute('SELECT id,kind,amount,note,created_at FROM bank_movements WHERE user_id=%s ORDER BY id DESC LIMIT 100',(uid,))]
            bookmakers=[dict(r) for r in c.execute('SELECT id,name,balance,active,updated_at FROM bookmaker_balances WHERE user_id=%s AND active=1 ORDER BY balance DESC,name',(uid,))]
            settings=dict(c.execute('SELECT distribution_json,currency,hide_values FROM settings WHERE user_id=%s',(uid,)).fetchone())
            academy=[dict(r) for r in c.execute('SELECT lesson_id,completed FROM academy_progress WHERE user_id=%s',(uid,))]
            ents=active_entitlements(uid)
            # Compatibility object for the current frontend; authorization is entitlement-based on the backend.
            is_pro=any(e['code']=='EQP_PRO' for e in ents)
            subscription={'plan':'PRO' if is_pro else 'FREE','status':'Ativo','trial_until':None}
            notes=[dict(r) for r in c.execute('SELECT id,kind,title,body,read_at,created_at FROM notifications WHERE user_id=%s ORDER BY created_at DESC LIMIT 30',(uid,))]
            acquisition=c.execute('SELECT first_source,first_medium,first_campaign,first_content,first_term,first_referral_code,first_landing_page FROM user_acquisition WHERE user_id=%s',(uid,)).fetchone()
            referral=c.execute('SELECT code FROM referral_codes WHERE user_id=%s AND active=1 ORDER BY id LIMIT 1',(uid,)).fetchone()
            c.close()
            return json_response(self,200,{'user':u,'operations':ops,'promos':promos,'freebets':freebets,'bank':bank,'goals':goals,'movements':movements,'bookmakers':bookmakers,'settings':settings,'academy':academy,'subscription':subscription,'entitlements':ents,'notifications':notes,'acquisition':dict(acquisition) if acquisition else None,'referral_code':referral['code'] if referral else None})
        return super().do_GET()

    def do_POST(self):
        p = urlparse(self.path).path
        data = read_json(self)
        if data is None: return json_response(self,400,{'error':'JSON inválido'})
        if p == '/api/register':
            name=' '.join((data.get('name') or '').strip().split()); email=(data.get('email') or '').strip().lower(); password=data.get('password') or ''
            terms_ok=bool(data.get('terms_accepted')); age_ok=bool(data.get('age_confirmed'))
            if len(name.split()) < 2 or any(len(part)<2 for part in name.split()[:2]):
                return json_response(self,400,{'error':'Informe seu nome completo.'})
            if '@' not in email or '.' not in email.split('@')[-1]:
                return json_response(self,400,{'error':'Informe um e-mail válido.'})
            if len(password)<8:
                return json_response(self,400,{'error':'A senha deve ter pelo menos 8 caracteres.'})
            if not terms_ok:
                return json_response(self,400,{'error':'Você precisa aceitar os Termos de Uso e a Política de Privacidade.'})
            if not age_ok:
                return json_response(self,400,{'error':'É necessário confirmar que você tem 18 anos ou mais.'})
            c=db(); now=int(time.time())
            try:
                cur=c.execute('''INSERT INTO users(name,email,password_hash,created_at,terms_accepted_at,privacy_accepted_at,age_confirmed_at,terms_version,privacy_version) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id''',(name,email,hash_password(password),now,now,now,now,'2026-09','2026-09'))
                uid=cur.fetchone()['id']
                attr=data.get('attribution') if isinstance(data.get('attribution'),dict) else {}
                def clean_attr(k, limit=500):
                    v=attr.get(k)
                    return str(v).strip()[:limit] if v not in (None,'') else None
                source=clean_attr('utm_source',120) or clean_attr('source',120) or 'direct'
                medium=clean_attr('utm_medium',120)
                campaign=clean_attr('utm_campaign',200)
                content=clean_attr('utm_content',200)
                term=clean_attr('utm_term',200)
                referral=clean_attr('ref',120)
                landing=clean_attr('landing_page',500)
                referrer=clean_attr('referrer',500)
                c.execute('''INSERT INTO user_acquisition(user_id,first_source,first_medium,first_campaign,first_content,first_term,first_referral_code,first_landing_page,first_referrer,last_source,last_medium,last_campaign,last_content,last_term,last_landing_page,captured_at,updated_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',(uid,source,medium,campaign,content,term,referral,landing,referrer,source,medium,campaign,content,term,landing,now,now))
                c.execute("INSERT INTO conversion_events(user_id,event_name,source,medium,campaign,meta_json,created_at) VALUES(%s,'SIGNUP',%s,%s,%s,%s,%s)",(uid,source,medium,campaign,json.dumps({'ref':referral},ensure_ascii=False),now))
                # Every account gets a stable referral code for future invite attribution.
                referral_code=('EQP'+str(uid)+secrets.token_hex(3)).upper()
                c.execute('INSERT INTO referral_codes(user_id,code,created_at) VALUES(%s,%s,%s)',(uid,referral_code,now))
                c.execute('INSERT INTO bank(user_id,active,reserve,pocket,tax,updated_at) VALUES(%s,%s,%s,%s,%s,%s)',(uid,1000,0,0,0,now))
                c.execute('INSERT INTO goals(user_id,name,target,current,created_at) VALUES(%s,%s,%s,%s,%s)',(uid,'Meta da banca',5000,1000,now))
                c.execute('INSERT INTO settings(user_id,updated_at) VALUES(%s,%s)',(uid,now))
                c.execute("INSERT INTO entitlements(user_id,code,status,starts_at,expires_at,source,created_at,updated_at) VALUES(%s,'EQP_BASIC','active',%s,NULL,'system',%s,%s)",(uid,now,now,now))
                c.execute("INSERT INTO notifications(user_id,kind,title,body,created_at) VALUES(%s,'system','Bem-vindo à EQP Centro','Sua conta foi criada e o acesso EQP Basic está ativo.',%s)",(uid,now))
                token=create_session(c,uid); c.commit()
                return json_response(self,201,{'token':token,'user':{'id':uid,'name':name,'email':email}})
            except psycopg.errors.UniqueViolation:
                c.rollback(); return json_response(self,409,{'error':'Já existe uma conta com este e-mail.'})
            finally: c.close()
        if p == '/api/login':
            email=(data.get('email') or '').strip().lower(); password=data.get('password') or ''
            c=db(); row=c.execute('SELECT * FROM users WHERE email=%s',(email,)).fetchone()
            if not row or not verify_password(password,row['password_hash']):
                c.close(); return json_response(self,401,{'error':'E-mail ou senha incorretos.'})
            token=create_session(c,row['id']); c.commit(); c.close()
            return json_response(self,200,{'token':token,'user':{'id':row['id'],'name':row['name'],'email':row['email']}})
        if p == '/api/logout':
            token=bearer(self); c=db();
            if token: c.execute('DELETE FROM sessions WHERE token=%s',(token,)); c.commit()
            c.close(); return json_response(self,200,{'ok':True})

        if p == '/api/password/forgot':
            email=(data.get('email') or '').strip().lower()
            reset_log('request_received')
            c=db()
            try:
                row=c.execute('SELECT id FROM users WHERE email=%s',(email,)).fetchone()
                if row:
                    reset_log('account_found')
                    raw=secrets.token_urlsafe(32); token_hash=hashlib.sha256(raw.encode()).hexdigest(); now=int(time.time())
                    c.execute('DELETE FROM password_reset_tokens WHERE user_id=%s OR expires_at<%s',(row['id'],now))
                    c.execute('INSERT INTO password_reset_tokens(token_hash,user_id,expires_at,created_at) VALUES(%s,%s,%s,%s)',(token_hash,row['id'],now+1800,now)); c.commit()
                    base=os.environ.get('PUBLIC_BASE_URL','').strip().rstrip('/') or 'https://eqp-centro.onrender.com'
                    reset_url=f"{base}/?reset={raw}"
                    send_password_reset_email(email,reset_url)
                else:
                    reset_log('account_not_found')
            finally:
                c.close()
            return json_response(self,200,{'ok':True,'message':'Se o e-mail estiver cadastrado, enviaremos as instruções de recuperação.'})
        if p == '/api/password/reset':
            raw=(data.get('token') or '').strip(); password=data.get('password') or ''
            if len(password)<8: return json_response(self,400,{'error':'A nova senha deve ter pelo menos 8 caracteres.'})
            token_hash=hashlib.sha256(raw.encode()).hexdigest(); now=int(time.time()); c=db()
            row=c.execute('SELECT user_id FROM password_reset_tokens WHERE token_hash=%s AND used_at IS NULL AND expires_at>%s',(token_hash,now)).fetchone()
            if not row: c.close(); return json_response(self,400,{'error':'Link inválido ou expirado.'})
            c.execute('UPDATE users SET password_hash=%s WHERE id=%s',(hash_password(password),row['user_id']))
            c.execute('UPDATE password_reset_tokens SET used_at=%s WHERE token_hash=%s',(now,token_hash)); c.execute('DELETE FROM sessions WHERE user_id=%s',(row['user_id'],)); c.commit(); c.close()
            return json_response(self,200,{'ok':True})

        u=current_user(self)
        if not u: return json_response(self,401,{'error':'Não autenticado'})
        uid=u['id']; c=db(); now=int(time.time())
        try:
            if p == '/api/password/change':
                current=data.get('current_password') or ''; new=data.get('new_password') or ''
                if len(new)<8: return json_response(self,400,{'error':'A nova senha deve ter pelo menos 8 caracteres.'})
                row=c.execute('SELECT password_hash FROM users WHERE id=%s',(uid,)).fetchone()
                if not row or not verify_password(current,row['password_hash']): return json_response(self,400,{'error':'Senha atual incorreta.'})
                c.execute('UPDATE users SET password_hash=%s WHERE id=%s',(hash_password(new),uid)); c.execute('DELETE FROM sessions WHERE user_id=%s AND token<>%s',(uid,bearer(self) or '')); c.commit(); return json_response(self,200,{'ok':True})
            if p == '/api/notifications/read':
                nid=int(data.get('id') or 0); c.execute('UPDATE notifications SET read_at=%s WHERE id=%s AND user_id=%s',(now,nid,uid)); c.commit(); return json_response(self,200,{'ok':True})
            if p == '/api/notifications/read-all':
                c.execute('UPDATE notifications SET read_at=%s WHERE user_id=%s AND read_at IS NULL',(now,uid)); c.commit(); return json_response(self,200,{'ok':True})
            if p == '/api/ai/summary':
                return json_response(self,200,{'summary':user_summary(uid)})
            if p == '/api/ai/promo-analyze':
                if not has_entitlement(uid,'EQP_PRO'):
                    return json_response(self,403,{'error':'A análise inteligente de promoções é um recurso do EQP Centro Pro.','upgrade_required':True})
                try:
                    result=openai_promo_analyze(data.get('image_data'), data.get('terms') or '')
                    return json_response(self,200,{'analysis':result})
                except RuntimeError as e:
                    return json_response(self,503,{'error':str(e),'needs_api_key':True})
                except Exception as e:
                    return json_response(self,502,{'error':'Não foi possível interpretar a resposta da IA.','detail':str(e)[:300]})
            if p == '/api/operations':
                source_type=(data.get('source_type') or '').strip() or None; source_id=str(data.get('source_id') or '').strip() or None
                cur=c.execute('INSERT INTO operations(user_id,type,name,volume,result,status,meta_json,source_type,source_id,created_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id',
                              (uid,data.get('type','Outro'),data.get('name',''),float(data.get('volume') or 0),float(data.get('result') or 0),data.get('status','Em andamento'),json.dumps(data.get('meta') or {}),source_type,source_id,now))
                new_id=cur.fetchone()['id']; c.commit(); return json_response(self,201,{'id':new_id})
            if p == '/api/operations/update':
                oid=int(data.get('id') or 0)
                row=c.execute('SELECT * FROM operations WHERE id=%s AND user_id=%s',(oid,uid)).fetchone()
                if not row: return json_response(self,404,{'error':'Operação não encontrada'})
                name=data.get('name',row['name']); volume=float(data.get('volume',row['volume']) or 0); result=float(data.get('result',row['result']) or 0)
                status=data.get('status',row['status']); meta=data.get('meta')
                meta_json=json.dumps(meta) if meta is not None else row['meta_json']
                c.execute('UPDATE operations SET name=%s,volume=%s,result=%s,status=%s,meta_json=%s WHERE id=%s AND user_id=%s',(name,volume,result,status,meta_json,oid,uid))
                c.commit(); return json_response(self,200,{'ok':True})
            if p == '/api/operations/delete':
                oid=int(data.get('id') or 0)
                c.execute('DELETE FROM operations WHERE id=%s AND user_id=%s',(oid,uid)); c.commit()
                return json_response(self,200,{'ok':True})
            if p == '/api/promos':
                cur=c.execute('INSERT INTO promos(user_id,title,operator,benefit,status,deadline,requirements_json,created_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id',
                              (uid,data.get('title','Promoção'),data.get('operator',''),float(data.get('benefit') or 0),data.get('status','Em andamento'),data.get('deadline'),json.dumps(data.get('requirements') or []),now))
                new_id=cur.fetchone()['id']; c.commit(); return json_response(self,201,{'id':new_id})
            if p == '/api/promos/update':
                pid=int(data.get('id') or 0)
                row=c.execute('SELECT * FROM promos WHERE id=%s AND user_id=%s',(pid,uid)).fetchone()
                if not row: return json_response(self,404,{'error':'Promoção não encontrada'})
                title=data.get('title',row['title']); operator=data.get('operator',row['operator']); benefit=float(data.get('benefit',row['benefit']) or 0)
                status=data.get('status',row['status']); deadline=data.get('deadline',row['deadline']); requirements=data.get('requirements')
                req_json=json.dumps(requirements) if requirements is not None else row['requirements_json']
                c.execute('UPDATE promos SET title=%s,operator=%s,benefit=%s,status=%s,deadline=%s,requirements_json=%s WHERE id=%s AND user_id=%s',(title,operator,benefit,status,deadline,req_json,pid,uid))
                c.commit(); return json_response(self,200,{'ok':True})
            if p == '/api/freebets':
                cur=c.execute('INSERT INTO freebets(user_id,promo_id,operator,value,status,deadline,meta_json,created_at) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id',
                              (uid,data.get('promo_id'),data.get('operator',''),float(data.get('value') or 0),data.get('status','Disponível'),data.get('deadline'),json.dumps(data.get('meta') or {}),now))
                new_id=cur.fetchone()['id']; c.commit(); return json_response(self,201,{'id':new_id})
            if p == '/api/freebets/update':
                fid=int(data.get('id') or 0)
                row=c.execute('SELECT * FROM freebets WHERE id=%s AND user_id=%s',(fid,uid)).fetchone()
                if not row: return json_response(self,404,{'error':'Freebet não encontrada'})
                c.execute('UPDATE freebets SET value=%s,status=%s,deadline=%s,meta_json=%s WHERE id=%s AND user_id=%s',
                          (float(data.get('value',row['value']) or 0),data.get('status',row['status']),data.get('deadline',row['deadline']),json.dumps(data.get('meta') or json.loads(row['meta_json'] or '{}')),fid,uid))
                c.commit(); return json_response(self,200,{'ok':True})
            if p == '/api/bookmakers':
                name=' '.join(str(data.get('name','')).strip().split())[:80]
                balance=float(data.get('balance') or 0)
                if not name: return json_response(self,400,{'error':'Informe o nome da casa.'})
                try:
                    cur=c.execute('INSERT INTO bookmaker_balances(user_id,name,balance,active,created_at,updated_at) VALUES(%s,%s,%s,1,%s,%s) RETURNING id',(uid,name,balance,now,now))
                    bid=cur.fetchone()['id']; c.commit(); return json_response(self,201,{'id':bid})
                except psycopg.errors.UniqueViolation:
                    c.rollback(); return json_response(self,409,{'error':'Essa casa já está cadastrada.'})
            if p == '/api/bookmakers/update':
                bid=int(data.get('id') or 0); row=c.execute('SELECT id,name,balance FROM bookmaker_balances WHERE id=%s AND user_id=%s AND active=1',(bid,uid)).fetchone()
                if not row: return json_response(self,404,{'error':'Casa não encontrada.'})
                name=' '.join(str(data.get('name',row['name'])).strip().split())[:80]
                balance=float(data.get('balance',row['balance']) or 0)
                c.execute('UPDATE bookmaker_balances SET name=%s,balance=%s,updated_at=%s WHERE id=%s AND user_id=%s',(name,balance,now,bid,uid)); c.commit(); return json_response(self,200,{'ok':True})
            if p == '/api/bookmakers/delete':
                bid=int(data.get('id') or 0); c.execute('UPDATE bookmaker_balances SET active=0,updated_at=%s WHERE id=%s AND user_id=%s',(now,bid,uid)); c.commit(); return json_response(self,200,{'ok':True})
            if p == '/api/bank':
                vals=[float(data.get(k) or 0) for k in ('active','reserve','pocket','tax')]
                c.execute('UPDATE bank SET active=%s,reserve=%s,pocket=%s,tax=%s,updated_at=%s WHERE user_id=%s',(*vals,now,uid)); c.commit()
                return json_response(self,200,{'ok':True})
            if p == '/api/goals':
                cur=c.execute('INSERT INTO goals(user_id,name,target,current,created_at) VALUES(%s,%s,%s,%s,%s) RETURNING id',(uid,data.get('name','Meta'),float(data.get('target') or 0),float(data.get('current') or 0),now)); new_id=cur.fetchone()['id']; c.commit()
                return json_response(self,201,{'id':new_id})
            if p == '/api/goals/update':
                gid=int(data.get('id') or 0); row=c.execute('SELECT * FROM goals WHERE id=%s AND user_id=%s',(gid,uid)).fetchone()
                if not row: return json_response(self,404,{'error':'Meta não encontrada'})
                c.execute('UPDATE goals SET name=%s,target=%s,current=%s WHERE id=%s AND user_id=%s',(data.get('name',row['name']),float(data.get('target',row['target']) or 0),float(data.get('current',row['current']) or 0),gid,uid)); c.commit(); return json_response(self,200,{'ok':True})
            if p == '/api/goals/delete':
                gid=int(data.get('id') or 0); c.execute('DELETE FROM goals WHERE id=%s AND user_id=%s',(gid,uid)); c.commit(); return json_response(self,200,{'ok':True})
            if p == '/api/academy/progress':
                lesson=str(data.get('lesson_id','')).strip(); completed=1 if data.get('completed') else 0
                if not lesson: return json_response(self,400,{'error':'Lição inválida'})
                c.execute('INSERT INTO academy_progress(user_id,lesson_id,completed,updated_at) VALUES(%s,%s,%s,%s) ON CONFLICT(user_id,lesson_id) DO UPDATE SET completed=excluded.completed,updated_at=excluded.updated_at',(uid,lesson,completed,now)); c.commit(); return json_response(self,200,{'ok':True})
            if p == '/api/profile':
                name=' '.join(str(data.get('name','')).strip().split())
                if len(name.split())<2: return json_response(self,400,{'error':'Informe seu nome completo.'})
                c.execute('UPDATE users SET name=%s WHERE id=%s',(name,uid)); c.commit(); return json_response(self,200,{'ok':True})
            if p == '/api/preferences':
                currency=str(data.get('currency','BRL')).upper()[:3]; hide=1 if data.get('hide_values') else 0
                c.execute('UPDATE settings SET currency=%s,hide_values=%s,updated_at=%s WHERE user_id=%s',(currency,hide,now,uid)); c.commit(); return json_response(self,200,{'ok':True})
            if p == '/api/subscription':
                return json_response(self,403,{'error':'Alteração de acesso exige pagamento confirmado.'})
            if p == '/api/settings':
                dist=data.get('distribution') or {'bank':60,'reserve':15,'pocket':15,'tax':10}
                if abs(sum(float(dist.get(k,0)) for k in ('bank','reserve','pocket','tax'))-100)>0.001: return json_response(self,400,{'error':'A distribuição precisa somar 100%.'})
                c.execute('UPDATE settings SET distribution_json=%s,updated_at=%s WHERE user_id=%s',(json.dumps(dist),now,uid)); c.commit(); return json_response(self,200,{'ok':True})
            if p == '/api/bank/movement':
                kind=data.get('kind','Ajuste'); amount=float(data.get('amount') or 0); note=data.get('note','')
                if amount==0: return json_response(self,400,{'error':'Informe um valor diferente de zero.'})
                cur=c.execute('INSERT INTO bank_movements(user_id,kind,amount,note,created_at) VALUES(%s,%s,%s,%s,%s) RETURNING id',(uid,kind,amount,note,now)); new_id=cur.fetchone()['id']; c.commit(); return json_response(self,201,{'id':new_id})
            if p == '/api/bank/distribute':
                amount=float(data.get('amount') or 0)
                if amount<=0: return json_response(self,400,{'error':'Informe um resultado positivo.'})
                sr=c.execute('SELECT distribution_json FROM settings WHERE user_id=%s',(uid,)).fetchone(); dist=json.loads(sr['distribution_json'])
                br=c.execute('SELECT active,reserve,pocket,tax FROM bank WHERE user_id=%s',(uid,)).fetchone(); vals=dict(br)
                mapping={'bank':'active','reserve':'reserve','pocket':'pocket','tax':'tax'}; parts={}
                for k,target in mapping.items(): parts[k]=round(amount*float(dist.get(k,0))/100,2); vals[target]+=parts[k]
                c.execute('UPDATE bank SET active=%s,reserve=%s,pocket=%s,tax=%s,updated_at=%s WHERE user_id=%s',(vals['active'],vals['reserve'],vals['pocket'],vals['tax'],now,uid))
                c.execute('INSERT INTO bank_movements(user_id,kind,amount,note,created_at) VALUES(%s,%s,%s,%s,%s)',(uid,'Distribuição',amount,'Distribuição automática de resultado positivo',now)); c.commit(); return json_response(self,200,{'ok':True,'parts':parts})

            return json_response(self,404,{'error':'Rota não encontrada'})
        finally: c.close()

    def log_message(self, fmt, *args):
        print('[EQP]', fmt % args)


if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT','8080'))
    print(f'EQP Centro Build 17 em http://localhost:{port}', flush=True)
    ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()
