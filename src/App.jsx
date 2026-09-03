import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Trash2, AlertTriangle, Wallet, Ticket, TrendingUp, ArrowUpRight,
  Percent, Coins, Download, Target, ChevronDown, ChevronUp, Calculator, Camera, Loader2,
} from 'lucide-react';

// ---------- storage (localStorage, persiste no navegador do dispositivo) ----------
const storage = {
  get: async (key) => {
    const v = localStorage.getItem(key);
    return v === null ? null : { key, value: v };
  },
  set: async (key, value) => {
    localStorage.setItem(key, value);
    return { key, value };
  },
};

// ---------- helpers ----------
const uid = () => Math.random().toString(36).slice(2, 10);
const fmtBRL = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  return Math.round((d - today) / 86400000);
};
const weekKey = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day + 3);
  const firstThursday = new Date(d.getFullYear(), 0, 4);
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-S${String(week).padStart(2, '0')}`;
};
const monthKey = (dateStr) => dateStr.slice(0, 7);
const weekLabel = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  const day = (d.getDay() + 6) % 7;
  const monday = new Date(d); monday.setDate(d.getDate() - day);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const f = (x) => x.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${f(monday)} – ${f(sunday)}`;
};
const monthLabel = (dateStr) => new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const dayLabel = (dateStr) => new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', weekday: 'short' });

const GOLD = '#E6B84D';
const GREEN = '#3ECF6A';
const RED = '#F2564D';
const BLUE = '#5B93F5';
const ORANGE = '#F5A544';
const PURPLE = '#A981F5';

const STATUS_CONTA = ['ativa', 'limitada', 'bloqueada'];
const STATUS_FREEBET = ['pendente', 'extraida', 'expirada'];
const STATUS_MISSAO = ['pendente', 'cumprida', 'perdida'];
const STATUS_DOT = {
  pendente: ORANGE, extraida: GREEN, expirada: RED,
  ativa: GREEN, limitada: ORANGE, bloqueada: RED,
  cumprida: GREEN, perdida: RED,
};
const TIPOS_APOSTA = [
  { v: 'simples', l: 'Simples' }, { v: 'multipla', l: 'Múltipla' }, { v: 'cria_aposta', l: 'Cria sua aposta' },
];

const STORAGE_KEY = 'freebets_app_state_v5';
const emptyState = { casas: ['Novibet', 'Betano', 'Rei do Pitaco'], contas: [], freebets: [], missoes: [], cashbacks: [] };

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'missoes', label: 'Missões' },
  { id: 'freebets', label: 'Freebets' },
  { id: 'fechamentos', label: 'Resumo' },
  { id: 'contas', label: 'Contas' },
];

// ============ CALCULADORA COMBINATÓRIA ============
// Gera todos os "tickets" (combinações) a partir das seleções que são "cobertas" (branching),
// multiplicando pelas odds das seleções "fixas" (não cobertas) em todos eles.
function gerarCombos(selecoes) {
  const branching = selecoes.filter(s => !s.fixo && s.outcomes.length > 0);
  const fixas = selecoes.filter(s => s.fixo && s.outcomes.length > 0);
  const oddFixasProduto = fixas.reduce((acc, s) => acc * (Number(s.outcomes[0].odd) || 1), 1);
  const labelFixas = fixas.map(s => s.outcomes[0].label || s.nome).join(' + ');

  if (branching.length === 0) return [];

  let combos = [[]];
  branching.forEach(sel => {
    const novos = [];
    combos.forEach(combo => {
      sel.outcomes.forEach(o => novos.push([...combo, { selNome: sel.nome, label: o.label, odd: Number(o.odd) || 1 }]));
    });
    combos = novos;
  });

  return combos.map((combo, idx) => {
    const oddCombo = combo.reduce((a, c) => a * c.odd, 1) * oddFixasProduto;
    const label = [labelFixas, ...combo.map(c => c.label)].filter(Boolean).join(' + ');
    const key = combo.map(c => c.label).join('|');
    return { key: key || String(idx), label, odd: oddCombo };
  });
}

function calcularStakesDutching(combos, stakeTotal, overrides) {
  const travados = combos.filter(c => overrides[c.key] !== undefined);
  const livres = combos.filter(c => overrides[c.key] === undefined);
  const somaTravado = travados.reduce((a, c) => a + Number(overrides[c.key] || 0), 0);
  const restante = Math.max(stakeTotal - somaTravado, 0);
  const invOddSum = livres.reduce((a, c) => a + (c.odd > 0 ? 1 / c.odd : 0), 0);
  return combos.map(c => {
    if (overrides[c.key] !== undefined) return { ...c, stake: Number(overrides[c.key]) || 0, travado: true };
    const stake = invOddSum > 0 ? restante * (1 / c.odd) / invOddSum : 0;
    return { ...c, stake, travado: false };
  });
}

function EmptyHint({ text }) {
  return <div style={{ textAlign: 'center', padding: '32px 16px', color: '#6E6E6E', fontSize: 13 }}>{text}</div>;
}
function LegendDot({ color, label, value }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#C9C9C9' }}>
      <span className="dot glow-dot" style={{ background: color, color }} /> {label}: <b style={{ color: '#FFFFFF' }}>{value}</b>
    </span>
  );
}

// ---------- DASHBOARD ----------
function Dashboard({ stats, state }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <StatCard icon={<Ticket size={16} color={GOLD} />} accent={GOLD} label="Freebets pendentes" value={fmtBRL(stats.valorPendente)} sub={`${stats.pendentes.length} em aberto`} />
        <StatCard icon={<Coins size={16} color={GREEN} />} accent={GREEN} label="Lucro já extraído" value={fmtBRL(stats.lucroExtraido)} sub={`freebets + cashback`} />
        <StatCard icon={<Wallet size={16} color={BLUE} />} accent={BLUE} label="Investido no total" value={fmtBRL(stats.investimentoTotal)} sub="pra liberar tudo" />
        <StatCard icon={<Target size={16} color={PURPLE} />} accent={PURPLE} label="Missões pendentes" value={stats.missoesPendentes.length} sub="aguardando conclusão" />
      </div>

      {(stats.roiLiberacaoMedio !== null || stats.roiRetornoMedio !== null) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="card" style={{ padding: 13 }}>
            <div style={{ fontSize: 11, color: '#8C8C8C' }}>ROI de liberação (médio)</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: GREEN, marginTop: 3 }}>{stats.roiLiberacaoMedio !== null ? `${stats.roiLiberacaoMedio.toFixed(0)}%` : '—'}</div>
            <div style={{ fontSize: 10, color: '#5F5F5F' }}>freebet ÷ custo pra destravar</div>
          </div>
          <div className="card" style={{ padding: 13 }}>
            <div style={{ fontSize: 11, color: '#8C8C8C' }}>ROI de retorno (médio)</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: BLUE, marginTop: 3 }}>{stats.roiRetornoMedio !== null ? `${stats.roiRetornoMedio.toFixed(0)}%` : '—'}</div>
            <div style={{ fontSize: 10, color: '#5F5F5F' }}>lucro ÷ valor nominal</div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 11.5, color: '#8C8C8C', marginBottom: 10, fontWeight: 700, letterSpacing: '0.05em' }}>STATUS DAS FREEBETS</div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13 }}>
          <LegendDot color={ORANGE} label="Pendentes" value={stats.pendentes.length} />
          <LegendDot color={GREEN} label="Extraídas" value={stats.extraidas.length} />
          <LegendDot color={RED} label="Expiradas" value={stats.expiradas.length} />
        </div>
      </div>

      {stats.venceLogo.length > 0 && (
        <div className="card" style={{ padding: 14, border: '1px solid rgba(245,165,68,0.35)', boxShadow: '0 0 20px rgba(245,165,68,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: ORANGE, marginBottom: 8 }}>
            <AlertTriangle size={15} /> Vencendo em breve
          </div>
          {stats.venceLogo.map(f => {
            const conta = state.contas.find(c => c.id === f.contaId);
            const d = daysUntil(f.prazo);
            return (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '7px 0', borderTop: '1px solid #1A1A1A' }}>
                <span>{f.casa} · {conta?.titular || f.obs || '—'}</span>
                <span style={{ color: d <= 0 ? RED : ORANGE, fontWeight: 600 }}>{fmtBRL(f.valor)} · {d <= 0 ? 'vence hoje' : `${d}d`}</span>
              </div>
            );
          })}
        </div>
      )}

      {state.contas.length === 0 && <EmptyHint text="Ainda não tem nenhuma conta cadastrada. Vá na aba Contas pra começar." />}
    </div>
  );
}

function StatCard({ icon, label, value, sub, accent }) {
  return (
    <div className="card" style={{ padding: 14, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -20, right: -20, width: 70, height: 70, borderRadius: '50%', background: accent, opacity: 0.08, filter: 'blur(10px)' }} />
      <div className="icon-badge" style={{ background: `${accent}20`, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 11.5, color: '#8C8C8C' }}>{label}</div>
      <div style={{ fontSize: 18.5, fontWeight: 800, color: '#FFFFFF', marginTop: 3 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: '#5F5F5F', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

// ---------- CONTAS ----------
function ContasTab({ state, addConta, updateConta, deleteConta, addCasa }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ casa: state.casas[0] || '', titular: '', cpfFinal: '', status: 'ativa', saldo: '', valorFixo: '' });
  const [novaCasa, setNovaCasa] = useState('');

  const submit = () => {
    if (!form.casa || !form.titular) return;
    addConta({ ...form, saldo: Number(form.saldo) || 0, valorFixo: Number(form.valorFixo) || 0 });
    setForm({ casa: state.casas[0] || '', titular: '', cpfFinal: '', status: 'ativa', saldo: '', valorFixo: '' });
    setShowForm(false);
  };

  const byCasa = state.casas.map(casa => ({ casa, contas: state.contas.filter(c => c.casa === casa) }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <button className="btn-primary" onClick={() => setShowForm(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Plus size={16} /> {showForm ? 'Fechar' : 'Nova Conta'}
      </button>

      {showForm && (
        <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <select className="field" value={form.casa} onChange={e => setForm({ ...form, casa: e.target.value })}>
            {state.casas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="field" placeholder="Nova casa..." value={novaCasa} onChange={e => setNovaCasa(e.target.value)} />
            <button className="btn-ghost" onClick={() => { addCasa(novaCasa.trim()); if (novaCasa.trim()) setForm(f => ({ ...f, casa: novaCasa.trim() })); setNovaCasa(''); }}>Add</button>
          </div>
          <input className="field" placeholder="Titular (quem opera)" value={form.titular} onChange={e => setForm({ ...form, titular: e.target.value })} />
          <input className="field" placeholder="Últimos dígitos do CPF (opcional)" value={form.cpfFinal} onChange={e => setForm({ ...form, cpfFinal: e.target.value })} />
          <select className="field" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            {STATUS_CONTA.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="field" type="number" placeholder="Saldo atual" value={form.saldo} onChange={e => setForm({ ...form, saldo: e.target.value })} />
            <input className="field" type="number" placeholder="Valor fixo a manter" value={form.valorFixo} onChange={e => setForm({ ...form, valorFixo: e.target.value })} />
          </div>
          <button className="btn-primary" onClick={submit}>Salvar conta</button>
        </div>
      )}

      {state.contas.length === 0 && !showForm && <EmptyHint text="Nenhuma conta cadastrada ainda." />}

      {byCasa.filter(g => g.contas.length > 0).map(g => (
        <div key={g.casa}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#8C8C8C', marginBottom: 7, letterSpacing: '0.05em' }}>{g.casa.toUpperCase()}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {g.contas.map(c => <ContaCard key={c.id} conta={c} update={updateConta} del={deleteConta} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ContaCard({ conta, update, del }) {
  const color = STATUS_DOT[conta.status];
  return (
    <div className="card" style={{ padding: 13, display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7 }}>
          <span className="dot glow-dot" style={{ background: color, color }} />
          {conta.titular}{conta.cpfFinal ? ` · •••${conta.cpfFinal}` : ''}
        </div>
        <button onClick={() => del(conta.id)} style={{ background: 'none', border: 'none', color: '#6E6E6E' }}><Trash2 size={15} /></button>
      </div>
      <select className="field" style={{ fontSize: 12.5 }} value={conta.status} onChange={e => update(conta.id, { status: e.target.value })}>
        {STATUS_CONTA.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="field" type="number" style={{ fontSize: 12.5 }} value={conta.saldo} onChange={e => update(conta.id, { saldo: Number(e.target.value) || 0 })} placeholder="Saldo" />
        <input className="field" type="number" style={{ fontSize: 12.5 }} value={conta.valorFixo} onChange={e => update(conta.id, { valorFixo: Number(e.target.value) || 0 })} placeholder="Fixo" />
      </div>
    </div>
  );
}

// ---------- FREEBETS ----------
function FreebetsTab({ state, stats, addFreebet, updateFreebet, deleteFreebet }) {
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('todas');
  const [form, setForm] = useState({ contaId: '', casa: '', valor: '', investimento: '', prazo: '', status: 'pendente', dataExtracao: '', valorExtraido: '', lucro: '' });

  const submit = () => {
    if (!form.contaId || !form.valor) return;
    const conta = state.contas.find(c => c.id === form.contaId);
    addFreebet({
      ...form, casa: conta?.casa || form.casa,
      valor: Number(form.valor) || 0, investimento: Number(form.investimento) || 0,
      valorExtraido: Number(form.valorExtraido) || 0, lucro: Number(form.lucro) || 0,
      dataExtracao: form.status === 'extraida' ? (form.dataExtracao || todayISO()) : '',
    });
    setForm({ contaId: '', casa: '', valor: '', investimento: '', prazo: '', status: 'pendente', dataExtracao: '', valorExtraido: '', lucro: '' });
    setShowForm(false);
  };

  const list = state.freebets.filter(f => filter === 'todas' || f.status === filter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 15.5, fontWeight: 800 }}>{state.freebets.length} freebets</div>
        <button className="btn-primary" onClick={() => setShowForm(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 15px' }}>
          <Plus size={15} /> {showForm ? 'Fechar' : 'Manual'}
        </button>
      </div>
      <div style={{ fontSize: 11.5, color: '#5F5F5F', marginTop: -8 }}>Freebets vindas de missão aparecem aqui sozinhas ao concluir a missão. Use "Manual" só pra freebets sem requisito (ex: boas-vindas direta).</div>

      <div style={{ display: 'flex', gap: 16, fontSize: 12.5, flexWrap: 'wrap' }}>
        <LegendDot color={ORANGE} label="Pendentes" value={stats.pendentes.length} />
        <LegendDot color={GREEN} label="Extraídas" value={stats.extraidas.length} />
        <LegendDot color={RED} label="Expiradas" value={stats.expiradas.length} />
      </div>

      {showForm && (
        <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <select className="field" value={form.contaId} onChange={e => setForm({ ...form, contaId: e.target.value })}>
            <option value="">Conta...</option>
            {state.contas.map(c => <option key={c.id} value={c.id}>{c.casa} · {c.titular}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="field" type="number" placeholder="Valor nominal da freebet" value={form.valor} onChange={e => setForm({ ...form, valor: e.target.value })} />
            <input className="field" type="date" value={form.prazo} onChange={e => setForm({ ...form, prazo: e.target.value })} title="Prazo de validade da freebet" />
          </div>
          <div style={{ fontSize: 11, color: '#5F5F5F', marginTop: -4 }}>A data acima é o prazo de validade da freebet (até quando ela expira), não a data em que foi liberada.</div>
          <input className="field" type="number" placeholder="Investido pra liberar (se houve)" value={form.investimento} onChange={e => setForm({ ...form, investimento: e.target.value })} />
          <select className="field" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            {STATUS_FREEBET.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {form.status === 'extraida' && (
            <>
              <input className="field" type="date" value={form.dataExtracao || todayISO()} onChange={e => setForm({ ...form, dataExtracao: e.target.value })} title="Data em que extraiu o lucro" />
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="field" type="number" placeholder="Valor extraído" value={form.valorExtraido} onChange={e => setForm({ ...form, valorExtraido: e.target.value })} />
                <input className="field" type="number" placeholder="Lucro" value={form.lucro} onChange={e => setForm({ ...form, lucro: e.target.value })} />
              </div>
            </>
          )}
          <button className="btn-primary" onClick={submit}>Salvar freebet</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
        {['todas', 'pendente', 'extraida', 'expirada'].map(s => (
          <button key={s} onClick={() => setFilter(s)} className="btn-ghost" style={{
            borderColor: filter === s ? GOLD : '#2A2A2A', color: filter === s ? GOLD : '#8C8C8C',
            boxShadow: filter === s ? '0 0 10px rgba(230,184,77,0.2)' : 'none',
          }}>{s}</button>
        ))}
      </div>

      {list.length === 0 && <EmptyHint text="Nada por aqui nesse filtro." />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map(f => {
          const conta = state.contas.find(c => c.id === f.contaId);
          const d = daysUntil(f.prazo);
          const color = STATUS_DOT[f.status];
          const roiLib = f.investimento > 0 ? (f.valor / f.investimento) * 100 : null;
          const roiRet = f.status === 'extraida' && f.valor > 0 ? (f.lucro / f.valor) * 100 : null;
          return (
            <div key={f.id} className="card" style={{ padding: 13, display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span className="dot glow-dot" style={{ background: color, color }} />
                  {f.casa} · {conta?.titular || f.obs || 'Manual'}
                </div>
                <button onClick={() => deleteFreebet(f.id)} style={{ background: 'none', border: 'none', color: '#6E6E6E' }}><Trash2 size={15} /></button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#C9C9C9' }}>
                <span>Freebet: {fmtBRL(f.valor)}{f.investimento ? ` · inv. ${fmtBRL(f.investimento)}` : ''}</span>
                {f.prazo && <span style={{ color: d !== null && d <= 3 ? ORANGE : '#6E6E6E' }}>{f.prazo} {d !== null ? `(${d}d)` : ''}</span>}
              </div>
              {(roiLib !== null || roiRet !== null) && (
                <div style={{ display: 'flex', gap: 14, fontSize: 11.5 }}>
                  {roiLib !== null && <span style={{ color: '#8C8C8C' }}>ROI liberação: <b style={{ color: GREEN }}>{roiLib.toFixed(0)}%</b></span>}
                  {roiRet !== null && <span style={{ color: '#8C8C8C' }}>ROI retorno: <b style={{ color: BLUE }}>{roiRet.toFixed(0)}%</b></span>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <select className="field" style={{ fontSize: 12.5 }} value={f.status} onChange={e => updateFreebet(f.id, { status: e.target.value, dataExtracao: e.target.value === 'extraida' ? (f.dataExtracao || todayISO()) : f.dataExtracao })}>
                  {STATUS_FREEBET.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {f.status === 'extraida' && (
                  <input className="field" type="date" style={{ fontSize: 12.5 }} value={f.dataExtracao || todayISO()} onChange={e => updateFreebet(f.id, { dataExtracao: e.target.value })} />
                )}
              </div>
              {f.status === 'extraida' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="field" type="number" style={{ fontSize: 12.5 }} placeholder="Valor extraído" value={f.valorExtraido} onChange={e => updateFreebet(f.id, { valorExtraido: Number(e.target.value) || 0 })} />
                  <input className="field" type="number" style={{ fontSize: 12.5 }} placeholder="Lucro" value={f.lucro} onChange={e => updateFreebet(f.id, { lucro: Number(e.target.value) || 0 })} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- FECHAMENTOS ----------
function FechamentosTab({ state, stats }) {
  const [view, setView] = useState('dia');
  const extraidas = state.freebets.filter(f => f.status === 'extraida' && f.dataExtracao)
    .map(f => ({ data: f.dataExtracao, lucro: Number(f.lucro) || 0, investimento: Number(f.investimento) || 0, giro: (Number(f.valor) || 0) + (Number(f.investimento) || 0) }));
  const cashbackEntries = state.cashbacks.map(c => ({ data: c.data, lucro: Number(c.valor) || 0, investimento: Number(c.investimento) || 0, giro: (Number(c.investimento) || 0) + (Number(c.valor) || 0) }));
  const todas = [...extraidas, ...cashbackEntries];

  const groups = useMemo(() => {
    const keyFn = view === 'dia' ? (f => f.data) : view === 'semana' ? (f => weekKey(f.data)) : (f => monthKey(f.data));
    const labelFn = view === 'dia' ? dayLabel : view === 'semana' ? weekLabel : monthLabel;
    const map = {};
    todas.forEach(f => {
      const k = keyFn(f);
      if (!map[k]) map[k] = { key: k, lucro: 0, investimento: 0, giro: 0, qtd: 0, sampleDate: f.data };
      map[k].lucro += f.lucro; map[k].investimento += f.investimento; map[k].giro += f.giro; map[k].qtd += 1;
    });
    return Object.values(map).map(g => ({ ...g, label: labelFn(g.sampleDate), roi: g.investimento > 0 ? (g.lucro / g.investimento) * 100 : null })).sort((a, b) => b.key.localeCompare(a.key));
  }, [state, view]);

  const atual = groups[0];
  const currentKey = view === 'dia' ? todayISO() : view === 'semana' ? weekKey(todayISO()) : monthKey(todayISO());
  const isCurrentPeriod = atual && atual.key === currentKey;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {[['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']].map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} className="btn-ghost" style={{
            flex: 1, textAlign: 'center', borderColor: view === k ? GOLD : '#2A2A2A', color: view === k ? GOLD : '#8C8C8C',
            boxShadow: view === k ? '0 0 10px rgba(230,184,77,0.2)' : 'none',
          }}>{l}</button>
        ))}
      </div>

      <div className="card" style={{ padding: 18, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: GREEN, opacity: 0.08, filter: 'blur(20px)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="icon-badge" style={{ background: 'rgba(62,207,106,0.12)' }}><TrendingUp size={16} color={GREEN} /></div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>
            {isCurrentPeriod ? `${view === 'dia' ? 'Hoje' : view === 'semana' ? 'Esta semana' : 'Este mês'} · em andamento` : 'Nenhum fechamento no período atual ainda'}
          </div>
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: GREEN, marginTop: 8 }}>{fmtBRL(isCurrentPeriod ? atual.lucro : 0)}</div>
        <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: '#8C8C8C', flexWrap: 'wrap' }}>
          <span>Investido: {fmtBRL(isCurrentPeriod ? atual.investimento : 0)}</span>
          <span>Giro: {fmtBRL(isCurrentPeriod ? atual.giro : 0)}</span>
          <span>{isCurrentPeriod ? atual.qtd : 0} lançamentos</span>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#8C8C8C', marginBottom: 8, letterSpacing: '0.05em' }}>HISTÓRICO</div>
        {groups.length === 0 && <EmptyHint text="Assim que você marcar uma freebet como extraída ou concluir uma missão de cashback, ela aparece fechada aqui." />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {groups.map(g => (
            <div key={g.key} className="card" style={{ padding: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize' }}>{g.label}</div>
                <div style={{ fontSize: 11, color: '#6E6E6E' }}>{g.qtd} lançamentos · giro {fmtBRL(g.giro)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: GREEN }}>{fmtBRL(g.lucro)}</div>
                {g.roi !== null && <div style={{ fontSize: 11, color: '#8C8C8C' }}>ROI {g.roi.toFixed(0)}%</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="icon-badge" style={{ background: 'rgba(91,147,245,0.12)' }}><ArrowUpRight size={16} color={BLUE} /></div>
          <div>
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>Giro histórico total</div>
            <div style={{ fontSize: 10.5, color: '#5F5F5F', marginTop: 1 }}>investido + valor de freebets e cashbacks</div>
          </div>
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: BLUE }}>{fmtBRL(stats.movimentadoTotal)}</div>
      </div>
    </div>
  );
}

// ---------- MISSÕES ----------
const missaoVazia = () => ({
  casa: '', escopo: 'individual', contaId: '', nContas: 2,
  titulo: '', descricao: '', tipoAposta: 'multipla',
  requisitos: { selecoesMin: 2, oddMinSelecao: '', oddTotalMin: '', stakeMin: '' },
  tipoRecompensa: 'freebet', valorFreebetPorConta: '', percentualCashback: '', tetoCashback: '',
  prazo: '', status: 'pendente', print: null,
  calculadora: { selecoes: [], stakeOverrides: {}, extras: [], investimentoTotal: 0 },
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Falha ao ler arquivo'));
    r.readAsDataURL(file);
  });
}

// Chama a function serverless própria (api/analyze-print), que guarda a chave da Anthropic
// no servidor e nunca a expõe no navegador.
async function analisarPrintComIA(dataUrl) {
  const response = await fetch('/api/analyze-print', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: dataUrl }),
  });
  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.error || `Erro ${response.status}`);
  }
  return response.json();
}

function MissoesTab({ state, addMissao, updateMissao, deleteMissao, addCasa, concluirMissao }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(missaoVazia());
  const [novaCasa, setNovaCasa] = useState('');
  const [filter, setFilter] = useState('pendente');
  const [expandido, setExpandido] = useState(null);
  const [analisando, setAnalisando] = useState(false);
  const [erroIA, setErroIA] = useState('');
  const fileInputRef = useRef(null);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErroIA('');
    try {
      const dataUrl = await fileToBase64(file);
      setForm(f => ({ ...f, print: dataUrl }));
    } catch (err) {
      setErroIA('Não consegui carregar essa imagem. Tenta outra ou preenche manual.');
    }
  };

  const analisar = async () => {
    if (!form.print) return;
    setAnalisando(true); setErroIA('');
    try {
      const dados = await analisarPrintComIA(form.print);
      setForm(f => ({
        ...f,
        casa: dados.casa || f.casa,
        titulo: dados.titulo || f.titulo,
        descricao: dados.descricao || f.descricao,
        tipoAposta: dados.tipoAposta || f.tipoAposta,
        tipoRecompensa: dados.tipoRecompensa || f.tipoRecompensa,
        valorFreebetPorConta: dados.valorFreebetPorConta ?? f.valorFreebetPorConta,
        percentualCashback: dados.percentualCashback ?? f.percentualCashback,
        tetoCashback: dados.tetoCashback ?? f.tetoCashback,
        prazo: dados.prazo || f.prazo,
        requisitos: {
          selecoesMin: dados.selecoesMin ?? f.requisitos.selecoesMin,
          oddMinSelecao: dados.oddMinSelecao ?? f.requisitos.oddMinSelecao,
          oddTotalMin: dados.oddTotalMin ?? f.requisitos.oddTotalMin,
          stakeMin: dados.stakeMin ?? f.requisitos.stakeMin,
        },
      }));
    } catch (e) {
      setErroIA('Não consegui ler o print automaticamente (' + e.message + '). Preenche manual mesmo, sem problema.');
    } finally {
      setAnalisando(false);
    }
  };

  const submit = () => {
    if (!form.casa || !form.titulo) return;
    addMissao(form);
    setForm(missaoVazia());
    setShowForm(false);
  };

  const list = state.missoes.filter(m => filter === 'todas' || m.status === filter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <button className="btn-primary" onClick={() => setShowForm(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Plus size={16} /> {showForm ? 'Fechar' : 'Nova Missão'}
      </button>

      {showForm && (
        <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: GOLD }}>Anexar print da promoção (opcional)</div>
          <input
            ref={fileInputRef} type="file" accept="image/*" capture="environment"
            onChange={onFile}
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
          />
          <button
            type="button" className="btn-ghost"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
          >
            <Camera size={14} /> {form.print ? 'Trocar imagem' : 'Escolher imagem'}
          </button>
          {form.print && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <img src={form.print} alt="print" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8, border: '1px solid #2A2A2A' }} />
              <button className="btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px' }} onClick={analisar} disabled={analisando}>
                {analisando ? <Loader2 size={14} className="spin" /> : <Camera size={14} />} {analisando ? 'Lendo print...' : 'Analisar com IA'}
              </button>
            </div>
          )}
          {erroIA && <div style={{ fontSize: 11.5, color: ORANGE }}>{erroIA}</div>}

          <div style={{ height: 1, background: '#1A1A1A', margin: '4px 0' }} />

          <select className="field" value={form.casa} onChange={e => setForm({ ...form, casa: e.target.value })}>
            <option value="">Casa...</option>
            {state.casas.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="field" placeholder="Nova casa..." value={novaCasa} onChange={e => setNovaCasa(e.target.value)} />
            <button className="btn-ghost" onClick={() => { addCasa(novaCasa.trim()); if (novaCasa.trim()) setForm(f => ({ ...f, casa: novaCasa.trim() })); setNovaCasa(''); }}>Add</button>
          </div>

          <input className="field" placeholder="Título da promoção" value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} />
          <textarea className="field" placeholder="Descrição da regra (ex: aposte 100 em múltipla de 2+ seleções, odd mínima 1.5 cada, odd total 3+, ganhe 50 em freebet)" value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} />

          <div style={{ display: 'flex', gap: 6 }}>
            {[['individual', 'Individual'], ['global', 'Global (cruzada)']].map(([v, l]) => (
              <button key={v} onClick={() => setForm({ ...form, escopo: v })} className="btn-ghost" style={{ flex: 1, borderColor: form.escopo === v ? GOLD : '#2A2A2A', color: form.escopo === v ? GOLD : '#8C8C8C' }}>{l}</button>
            ))}
          </div>
          {form.escopo === 'individual' ? (
            <select className="field" value={form.contaId} onChange={e => setForm({ ...form, contaId: e.target.value })}>
              <option value="">Conta...</option>
              {state.contas.filter(c => c.casa === form.casa).map(c => <option key={c.id} value={c.id}>{c.titular}</option>)}
            </select>
          ) : (
            <input className="field" type="number" placeholder="Nº de contas cruzadas" value={form.nContas} onChange={e => setForm({ ...form, nContas: e.target.value })} />
          )}

          <select className="field" value={form.tipoAposta} onChange={e => setForm({ ...form, tipoAposta: e.target.value })}>
            {TIPOS_APOSTA.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>

          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#8C8C8C', marginTop: 2 }}>REQUISITOS</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="field" type="number" placeholder="Nº seleções mín." value={form.requisitos.selecoesMin} onChange={e => setForm({ ...form, requisitos: { ...form.requisitos, selecoesMin: e.target.value } })} />
            <input className="field" type="number" step="0.01" placeholder="Odd mín/seleção" value={form.requisitos.oddMinSelecao} onChange={e => setForm({ ...form, requisitos: { ...form.requisitos, oddMinSelecao: e.target.value } })} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="field" type="number" step="0.01" placeholder="Odd total mín." value={form.requisitos.oddTotalMin} onChange={e => setForm({ ...form, requisitos: { ...form.requisitos, oddTotalMin: e.target.value } })} />
            <input className="field" type="number" placeholder="Stake exigido (R$)" value={form.requisitos.stakeMin} onChange={e => setForm({ ...form, requisitos: { ...form.requisitos, stakeMin: e.target.value } })} />
          </div>

          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#8C8C8C', marginTop: 2 }}>RECOMPENSA</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['freebet', 'Freebet'], ['cashback', 'Cashback']].map(([v, l]) => (
              <button key={v} onClick={() => setForm({ ...form, tipoRecompensa: v })} className="btn-ghost" style={{ flex: 1, borderColor: form.tipoRecompensa === v ? GOLD : '#2A2A2A', color: form.tipoRecompensa === v ? GOLD : '#8C8C8C' }}>{l}</button>
            ))}
          </div>
          {form.tipoRecompensa === 'freebet' ? (
            <input className="field" type="number" placeholder={form.escopo === 'global' ? 'Valor da freebet por conta' : 'Valor da freebet'} value={form.valorFreebetPorConta} onChange={e => setForm({ ...form, valorFreebetPorConta: e.target.value })} />
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="field" type="number" placeholder="% de cashback" value={form.percentualCashback} onChange={e => setForm({ ...form, percentualCashback: e.target.value })} />
              <input className="field" type="number" placeholder="Teto (R$, opcional)" value={form.tetoCashback} onChange={e => setForm({ ...form, tetoCashback: e.target.value })} />
            </div>
          )}

          <input className="field" type="date" value={form.prazo} onChange={e => setForm({ ...form, prazo: e.target.value })} title="Prazo pra cumprir a missão" />

          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#8C8C8C', marginTop: 2 }}>CALCULADORA DE COBERTURA</div>
          <CalculadoraCombinatoria calc={form.calculadora} onChange={c => setForm({ ...form, calculadora: c })} />

          <button className="btn-primary" onClick={submit} style={{ marginTop: 4 }}>Salvar missão</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
        {['pendente', 'cumprida', 'perdida', 'todas'].map(s => (
          <button key={s} onClick={() => setFilter(s)} className="btn-ghost" style={{ borderColor: filter === s ? GOLD : '#2A2A2A', color: filter === s ? GOLD : '#8C8C8C' }}>{s}</button>
        ))}
      </div>

      {list.length === 0 && <EmptyHint text="Nenhuma missão nesse filtro." />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map(m => {
          const color = STATUS_DOT[m.status];
          const d = daysUntil(m.prazo);
          return (
            <div key={m.id} className="card" style={{ padding: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span className="dot glow-dot" style={{ background: color, color }} />
                  {m.titulo}
                </div>
                <button onClick={() => deleteMissao(m.id)} style={{ background: 'none', border: 'none', color: '#6E6E6E' }}><Trash2 size={15} /></button>
              </div>
              <div style={{ fontSize: 12, color: '#8C8C8C' }}>
                {m.casa} · {m.escopo === 'global' ? `cruzada (${m.nContas} contas)` : 'individual'} · {TIPOS_APOSTA.find(t => t.v === m.tipoAposta)?.l}
              </div>
              {m.descricao && <div style={{ fontSize: 12.5, color: '#C9C9C9' }}>{m.descricao}</div>}
              <div style={{ display: 'flex', gap: 14, fontSize: 11.5, flexWrap: 'wrap', color: '#8C8C8C' }}>
                {m.requisitos.selecoesMin && <span>{m.requisitos.selecoesMin}+ seleções</span>}
                {m.requisitos.oddMinSelecao && <span>odd mín {m.requisitos.oddMinSelecao}</span>}
                {m.requisitos.oddTotalMin && <span>total mín {m.requisitos.oddTotalMin}</span>}
                {m.requisitos.stakeMin && <span>stake {fmtBRL(m.requisitos.stakeMin)}</span>}
              </div>
              <div style={{ fontSize: 12.5, color: GOLD, fontWeight: 600 }}>
                {m.tipoRecompensa === 'freebet' ? `Recompensa: ${fmtBRL(m.valorFreebetPorConta)}${m.escopo === 'global' ? ' / conta' : ''}` : `Cashback: ${m.percentualCashback}%${m.tetoCashback ? ` (teto ${fmtBRL(m.tetoCashback)})` : ''}`}
              </div>
              {m.prazo && d !== null && <div style={{ fontSize: 11.5, color: d <= 1 ? RED : '#6E6E6E' }}>Prazo: {m.prazo} ({d}d)</div>}

              <div style={{ display: 'flex', gap: 6 }}>
                <select className="field" style={{ fontSize: 12.5 }} value={m.status} onChange={e => concluirMissao(m, e.target.value)}>
                  {STATUS_MISSAO.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button className="btn-ghost" onClick={() => setExpandido(expandido === m.id ? null : m.id)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Calculator size={13} /> {expandido === m.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
              </div>
              {m.status === 'cumprida' && m.freebetGeradaId && (
                <div style={{ fontSize: 11.5, color: GREEN }}>✓ {m.tipoRecompensa === 'freebet' ? 'Freebet gerada em Freebets' : 'Cashback lançado em Resumo'}</div>
              )}

              {expandido === m.id && (
                <div style={{ marginTop: 4 }}>
                  <CalculadoraCombinatoria calc={m.calculadora} onChange={c => updateMissao(m.id, { calculadora: c })} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- CALCULADORA COMBINATÓRIA (componente reusado no form e no card expandido) ----------
function CalculadoraCombinatoria({ calc, onChange }) {
  const selecoes = calc.selecoes || [];
  const extras = calc.extras || [];
  const overrides = calc.stakeOverrides || {};
  const [stakeTotal, setStakeTotal] = useState(calc.stakeTotalCobertura || 100);

  const addSelecao = () => onChange({ ...calc, selecoes: [...selecoes, { id: uid(), nome: `Seleção ${selecoes.length + 1}`, fixo: false, outcomes: [{ id: uid(), label: '', odd: '' }, { id: uid(), label: '', odd: '' }] }] });
  const updateSelecao = (id, patch) => onChange({ ...calc, selecoes: selecoes.map(s => s.id === id ? { ...s, ...patch } : s) });
  const removeSelecao = (id) => onChange({ ...calc, selecoes: selecoes.filter(s => s.id !== id) });
  const updateOutcome = (selId, outId, patch) => onChange({
    ...calc,
    selecoes: selecoes.map(s => s.id === selId ? { ...s, outcomes: s.outcomes.map(o => o.id === outId ? { ...o, ...patch } : o) } : s),
  });
  const addOutcome = (selId) => onChange({ ...calc, selecoes: selecoes.map(s => s.id === selId ? { ...s, outcomes: [...s.outcomes, { id: uid(), label: '', odd: '' }] } : s) });
  const removeOutcome = (selId, outId) => onChange({ ...calc, selecoes: selecoes.map(s => s.id === selId ? { ...s, outcomes: s.outcomes.filter(o => o.id !== outId) } : s) });
  const toggleFixo = (selId) => onChange({ ...calc, selecoes: selecoes.map(s => s.id === selId ? { ...s, fixo: !s.fixo, outcomes: s.outcomes.slice(0, s.fixo ? 2 : 1).length ? s.outcomes.slice(0, !s.fixo ? 1 : 2) : s.outcomes } : s) });

  const combosBrutos = useMemo(() => gerarCombos(selecoes), [selecoes]);
  const combos = useMemo(() => calcularStakesDutching(combosBrutos, Number(stakeTotal) || 0, overrides), [combosBrutos, stakeTotal, overrides]);

  const addExtra = () => onChange({ ...calc, extras: [...extras, { id: uid(), label: `Cobertura extra ${extras.length + 1}`, odd: '', stake: '' }] });
  const updateExtra = (id, patch) => onChange({ ...calc, extras: extras.map(e => e.id === id ? { ...e, ...patch } : e) });
  const removeExtra = (id) => onChange({ ...calc, extras: extras.filter(e => e.id !== id) });

  const investimentoCombos = combos.reduce((a, c) => a + c.stake, 0);
  const investimentoExtras = extras.reduce((a, e) => a + (Number(e.stake) || 0), 0);
  const investimentoTotal = investimentoCombos + investimentoExtras;
  const payoutMedio = combos.length ? combos.reduce((a, c) => a + c.stake * c.odd, 0) / combos.length : 0;
  const perdaEstimada = Math.max(investimentoTotal - payoutMedio, 0);

  useEffect(() => {
    onChange({ ...calc, stakeTotalCobertura: Number(stakeTotal) || 0, investimentoTotal, perdaEstimada });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investimentoTotal, perdaEstimada, stakeTotal]);

  return (
    <div className="card" style={{ padding: 12, background: '#080808', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 11, color: '#6E6E6E' }}>
        Cada seleção pode ser "cobrir todos os lados" (gera combinações) ou "fixa" (1 lado só, sem cobertura — some no cálculo geral e você adiciona uma cobertura extra manual pra ela).
      </div>

      {selecoes.map(sel => (
        <div key={sel.id} style={{ border: '1px solid #1E1E1E', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input className="field" style={{ fontSize: 12.5, flex: 1 }} value={sel.nome} onChange={e => updateSelecao(sel.id, { nome: e.target.value })} />
            <button className="btn-ghost" style={{ fontSize: 11, borderColor: sel.fixo ? ORANGE : '#2A2A2A', color: sel.fixo ? ORANGE : '#8C8C8C' }} onClick={() => toggleFixo(sel.id)}>{sel.fixo ? 'Fixa' : 'Cobrir'}</button>
            <button onClick={() => removeSelecao(sel.id)} style={{ background: 'none', border: 'none', color: '#6E6E6E' }}><Trash2 size={14} /></button>
          </div>
          {sel.outcomes.map(o => (
            <div key={o.id} style={{ display: 'flex', gap: 6 }}>
              <input className="field" style={{ fontSize: 12 }} placeholder="Lado (ex: Over 2.5)" value={o.label} onChange={e => updateOutcome(sel.id, o.id, { label: e.target.value })} />
              <input className="field" style={{ fontSize: 12, width: 80 }} type="number" step="0.01" placeholder="Odd" value={o.odd} onChange={e => updateOutcome(sel.id, o.id, { odd: e.target.value })} />
              {!sel.fixo && sel.outcomes.length > 2 && <button onClick={() => removeOutcome(sel.id, o.id)} style={{ background: 'none', border: 'none', color: '#6E6E6E' }}><Trash2 size={13} /></button>}
            </div>
          ))}
          {!sel.fixo && sel.outcomes.length < 3 && (
            <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => addOutcome(sel.id)}>+ lado (ex: empate)</button>
          )}
        </div>
      ))}
      <button className="btn-ghost" onClick={addSelecao}>+ Adicionar seleção</button>

      {combos.length > 0 && (
        <>
          <div style={{ height: 1, background: '#1A1A1A' }} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11.5, color: '#8C8C8C', flexShrink: 0 }}>Stake total de cobertura</span>
            <input className="field" style={{ fontSize: 12.5 }} type="number" value={stakeTotal} onChange={e => setStakeTotal(e.target.value)} />
          </div>
          <div style={{ fontSize: 11, color: '#6E6E6E' }}>{combos.length} combinações geradas — stake sugerida distribuída pra igualar o retorno. Edite manualmente pra travar uma linha.</div>
          {combos.map(c => (
            <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '6px 8px', background: '#0E0E0E', borderRadius: 8 }}>
              <div style={{ flex: 1, color: '#C9C9C9' }}>{c.label} <span style={{ color: '#5F5F5F' }}>· odd {c.odd.toFixed(2)}</span></div>
              <input
                className="field" style={{ fontSize: 12, width: 90 }} type="number"
                value={c.stake.toFixed(2)}
                onChange={e => onChange({ ...calc, stakeOverrides: { ...overrides, [c.key]: Number(e.target.value) || 0 } })}
              />
            </div>
          ))}
        </>
      )}

      <div style={{ height: 1, background: '#1A1A1A' }} />
      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#8C8C8C' }}>COBERTURA EXTRA (seleções fixas)</div>
      {extras.map(e => (
        <div key={e.id} style={{ display: 'flex', gap: 6 }}>
          <input className="field" style={{ fontSize: 12 }} placeholder="Descrição" value={e.label} onChange={ev => updateExtra(e.id, { label: ev.target.value })} />
          <input className="field" style={{ fontSize: 12, width: 70 }} type="number" step="0.01" placeholder="Odd" value={e.odd} onChange={ev => updateExtra(e.id, { odd: ev.target.value })} />
          <input className="field" style={{ fontSize: 12, width: 80 }} type="number" placeholder="Stake" value={e.stake} onChange={ev => updateExtra(e.id, { stake: ev.target.value })} />
          <button onClick={() => removeExtra(e.id)} style={{ background: 'none', border: 'none', color: '#6E6E6E' }}><Trash2 size={14} /></button>
        </div>
      ))}
      <button className="btn-ghost" onClick={addExtra}>+ Cobertura extra</button>

      <div style={{ height: 1, background: '#1A1A1A' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span style={{ color: '#8C8C8C' }}>Investimento total estimado</span>
        <b style={{ color: GOLD }}>{fmtBRL(investimentoTotal)}</b>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ color: '#8C8C8C' }}>Perda estimada no pior cenário coberto</span>
        <b style={{ color: perdaEstimada > 0 ? RED : GREEN }}>{fmtBRL(perdaEstimada)}</b>
      </div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState(emptyState);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('dashboard');
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get(STORAGE_KEY);
        if (res && res.value) setState({ ...emptyState, ...JSON.parse(res.value) });
      } catch (e) { /* sem dados salvos ainda */ }
      finally { setLoaded(true); }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        const res = await storage.set(STORAGE_KEY, JSON.stringify(state));
        setSaveError(!res);
      } catch (e) { setSaveError(true); }
    })();
  }, [state, loaded]);

  const exportarJSON = () => {
    try {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `freebets-backup-${todayISO()}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) { /* navegador pode bloquear download em alguns contextos */ }
  };

  const addCasa = (nome) => { if (!nome || state.casas.includes(nome)) return; setState(s => ({ ...s, casas: [...s.casas, nome] })); };
  const addConta = (conta) => setState(s => ({ ...s, contas: [...s.contas, { id: uid(), ...conta }] }));
  const updateConta = (id, patch) => setState(s => ({ ...s, contas: s.contas.map(c => c.id === id ? { ...c, ...patch } : c) }));
  const deleteConta = (id) => setState(s => ({ ...s, contas: s.contas.filter(c => c.id !== id), freebets: s.freebets.filter(f => f.contaId !== id) }));
  const addFreebet = (fb) => setState(s => ({ ...s, freebets: [...s.freebets, { id: uid(), ...fb }] }));
  const updateFreebet = (id, patch) => setState(s => ({ ...s, freebets: s.freebets.map(f => f.id === id ? { ...f, ...patch } : f) }));
  const deleteFreebet = (id) => setState(s => ({ ...s, freebets: s.freebets.filter(f => f.id !== id) }));

  const addMissao = (m) => setState(s => ({ ...s, missoes: [...s.missoes, { id: uid(), ...m }] }));
  const updateMissao = (id, patch) => setState(s => ({ ...s, missoes: s.missoes.map(m => m.id === id ? { ...m, ...patch } : m) }));
  const deleteMissao = (id) => setState(s => ({ ...s, missoes: s.missoes.filter(m => m.id !== id) }));
  const addCashback = (c) => setState(s => ({ ...s, cashbacks: [...s.cashbacks, { id: uid(), ...c }] }));

  // ao concluir uma missão, gera automaticamente a freebet ou o cashback correspondente
  const concluirMissao = (missao, statusFinal) => {
    updateMissao(missao.id, { status: statusFinal });
    if (statusFinal !== 'cumprida' || missao.freebetGeradaId) return;
    const investimentoTotal = missao.calculadora?.investimentoTotal || 0;
    if (missao.tipoRecompensa === 'freebet') {
      const nContas = missao.escopo === 'global' ? (Number(missao.nContas) || 1) : 1;
      const valorTotal = (Number(missao.valorFreebetPorConta) || 0) * nContas;
      const novaFbId = uid();
      setState(s => ({
        ...s,
        missoes: s.missoes.map(m => m.id === missao.id ? { ...m, status: statusFinal, freebetGeradaId: novaFbId } : m),
        freebets: [...s.freebets, {
          id: novaFbId, missaoId: missao.id, contaId: missao.escopo === 'individual' ? missao.contaId : null,
          casa: missao.casa, valor: valorTotal, investimento: investimentoTotal, prazo: '', status: 'pendente',
          dataExtracao: '', valorExtraido: 0, lucro: 0,
          obs: missao.escopo === 'global' ? `Missão cruzada (${nContas} contas)` : '',
        }],
      }));
    } else if (missao.tipoRecompensa === 'cashback') {
      const perdaCoberta = investimentoTotal;
      const pct = Number(missao.percentualCashback) || 0;
      let valorCashback = perdaCoberta * (pct / 100);
      if (missao.tetoCashback) valorCashback = Math.min(valorCashback, Number(missao.tetoCashback));
      setState(s => ({
        ...s,
        missoes: s.missoes.map(m => m.id === missao.id ? { ...m, status: statusFinal, freebetGeradaId: 'cashback' } : m),
        cashbacks: [...s.cashbacks, {
          id: uid(), missaoId: missao.id, casa: missao.casa,
          contaId: missao.escopo === 'individual' ? missao.contaId : null,
          valor: valorCashback, investimento: perdaCoberta, data: todayISO(),
        }],
      }));
    }
  };

  const stats = useMemo(() => {
    const pendentes = state.freebets.filter(f => f.status === 'pendente');
    const extraidas = state.freebets.filter(f => f.status === 'extraida');
    const expiradas = state.freebets.filter(f => f.status === 'expirada');
    const valorPendente = pendentes.reduce((a, f) => a + (Number(f.valor) || 0), 0);
    const lucroFreebets = extraidas.reduce((a, f) => a + (Number(f.lucro) || 0), 0);
    const lucroCashback = state.cashbacks.reduce((a, c) => a + (Number(c.valor) || 0), 0);
    const lucroExtraido = lucroFreebets + lucroCashback;
    const investimentoTotal = state.freebets.reduce((a, f) => a + (Number(f.investimento) || 0), 0) + state.cashbacks.reduce((a, c) => a + (Number(c.investimento) || 0), 0);
    const movimentadoTotal = state.freebets.reduce((a, f) => a + (Number(f.valor) || 0) + (Number(f.investimento) || 0), 0) + state.cashbacks.reduce((a, c) => a + (Number(c.investimento) || 0) + (Number(c.valor) || 0), 0);
    const venceLogo = pendentes.filter(f => { const d = daysUntil(f.prazo); return d !== null && d <= 3; });
    const contasAtivas = state.contas.filter(c => c.status === 'ativa').length;
    const saldoTotal = state.contas.reduce((a, c) => a + (Number(c.saldo) || 0), 0);
    const roiGeral = investimentoTotal > 0 ? (lucroExtraido / investimentoTotal) * 100 : null;
    const missoesPendentes = state.missoes.filter(m => m.status === 'pendente');
    const comLiberacao = extraidas.filter(f => f.investimento > 0);
    const roiLiberacaoMedio = comLiberacao.length ? comLiberacao.reduce((a, f) => a + (f.valor / f.investimento) * 100, 0) / comLiberacao.length : null;
    const comRetorno = extraidas.filter(f => f.valor > 0);
    const roiRetornoMedio = comRetorno.length ? comRetorno.reduce((a, f) => a + (f.lucro / f.valor) * 100, 0) / comRetorno.length : null;
    return { pendentes, extraidas, expiradas, valorPendente, lucroExtraido, investimentoTotal, movimentadoTotal, venceLogo, contasAtivas, saldoTotal, roiGeral, missoesPendentes, roiLiberacaoMedio, roiRetornoMedio };
  }, [state]);

  return (
    <div style={{
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      background: 'radial-gradient(circle at 50% 0%, #1a1508 0%, #000000 55%)',
      color: '#F5F5F5', minHeight: '100vh',
      maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column',
    }}>
      <style>{`
        * { box-sizing: border-box; }
        input, select, textarea { font-family: inherit; }
        input::placeholder, textarea::placeholder { color: #6E6E6E; }
        button { font-family: inherit; cursor: pointer; transition: transform .12s ease, box-shadow .12s ease; }
        button:active { transform: scale(0.97); }
        .card {
          background: linear-gradient(160deg, #111111 0%, #0A0A0A 100%);
          border: 1px solid rgba(230,184,77,0.12);
          border-radius: 16px;
          box-shadow: 0 6px 22px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.03);
        }
        .field {
          width: 100%; background: #0B0B0B; border: 1px solid #2A2A2A; border-radius: 999px;
          color: #F5F5F5; padding: 11px 15px; font-size: 14px;
        }
        .field:focus { outline: none; border-color: ${GOLD}; box-shadow: 0 0 0 3px rgba(230,184,77,0.15); }
        select.field, textarea.field { border-radius: 12px; }
        textarea.field { resize: vertical; min-height: 54px; }
        .btn-primary {
          background: linear-gradient(135deg, #F3CC6E 0%, ${GOLD} 45%, #B9862A 100%);
          color: #1A1200; border: none; border-radius: 999px; padding: 12px 18px; font-weight: 800; font-size: 14px;
          box-shadow: 0 6px 18px rgba(230,184,77,0.35), inset 0 1px 0 rgba(255,255,255,0.4);
        }
        .btn-ghost {
          background: rgba(255,255,255,0.02); border: 1px solid #2A2A2A; color: #C9C9C9;
          border-radius: 999px; padding: 8px 13px; font-size: 12.5px; white-space: nowrap;
        }
        .dot { width: 8px; height: 8px; border-radius: 5px; display: inline-block; }
        .glow-dot { box-shadow: 0 0 8px currentColor; }
        .icon-badge { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        ::-webkit-scrollbar { display: none; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <header style={{ padding: '20px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{
            width: 46, height: 46, borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 30%, #2a2005, #000)',
            border: `2px solid ${GOLD}`, boxShadow: `0 0 16px rgba(230,184,77,0.45), inset 0 0 8px rgba(230,184,77,0.15)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 16, color: GOLD, flexShrink: 0,
          }}>FB</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em',
              background: 'linear-gradient(90deg, #FFFFFF, #E6B84D)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>FREEBETS TRACKER</div>
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>Controle. Sem sofrência.</div>
          </div>
          <button onClick={exportarJSON} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <Download size={13} /> Backup
          </button>
        </div>
        {saveError && <div style={{ marginTop: 8, fontSize: 12, color: RED }}>Não consegui salvar agora — os dados podem se perder ao fechar.</div>}
        <div style={{ display: 'flex', gap: 18, marginTop: 18, overflowX: 'auto', borderBottom: '1px solid #1A1A1A', paddingBottom: 1 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: 'none', border: 'none', padding: '0 0 11px', flexShrink: 0,
              color: tab === t.id ? '#FFFFFF' : '#71717A', fontWeight: tab === t.id ? 700 : 500, fontSize: 13.5,
              borderBottom: tab === t.id ? `2px solid ${GOLD}` : '2px solid transparent',
              textShadow: tab === t.id ? '0 0 12px rgba(230,184,77,0.5)' : 'none',
            }}>{t.label}</button>
          ))}
        </div>
      </header>

      <main style={{ flex: 1, padding: '16px 16px 40px', overflowY: 'auto' }}>
        {tab === 'dashboard' && <Dashboard stats={stats} state={state} />}
        {tab === 'contas' && <ContasTab state={state} addConta={addConta} updateConta={updateConta} deleteConta={deleteConta} addCasa={addCasa} />}
        {tab === 'freebets' && <FreebetsTab state={state} stats={stats} addFreebet={addFreebet} updateFreebet={updateFreebet} deleteFreebet={deleteFreebet} />}
        {tab === 'fechamentos' && <FechamentosTab state={state} stats={stats} />}
        {tab === 'missoes' && <MissoesTab state={state} addMissao={addMissao} updateMissao={updateMissao} deleteMissao={deleteMissao} addCasa={addCasa} concluirMissao={concluirMissao} />}
      </main>
    </div>
  );
  }
