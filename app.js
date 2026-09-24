const $ = (s,el=document)=>el.querySelector(s);
const $$ = (s,el=document)=>[...el.querySelectorAll(s)];
const money = n => (Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const pct = n => `${(Number(n)||0).toFixed(2).replace('.',',')}%`;

const state = {
  user: null, operations: [], promos: [], freebets: [],
  bank: {active:1000,reserve:0,pocket:0,tax:0},
  goals: [{name:"Meta da banca",target:5000,current:1000}],
  movements: [], bookmakers: [], settings:{distribution_json:'{\"bank\":60,\"reserve\":15,\"pocket\":15,\"tax\":10}'}, academy:[], subscription:{plan:'FREE',status:'Ativo'}, page:'dashboard'
};

const save = async()=>{}; // Persistência é feita pelo backend PostgreSQL.

async function loadAccount(){
  try{
    const x=await API.bootstrap();
    state.user=x.user;
    state.operations=(x.operations||[]).map(o=>({
      ...o,
      result:+o.result||0,
      volume:+o.volume||0,
      meta:(()=>{try{return JSON.parse(o.meta_json||'{}')}catch{return {}}})()
    }));
    state.promos=(x.promos||[]).map(p=>({
      ...p,
      name:p.title,
      value:+p.benefit||0,
      date:p.deadline||'',
      req:(()=>{try{return JSON.parse(p.requirements_json||'[]')}catch{return []}})()
    }));
    state.freebets=(x.freebets||[]).map(f=>({...f,value:+f.value||0,meta:(()=>{try{return JSON.parse(f.meta_json||'{}')}catch{return {}}})()}));
    state.bank=x.bank||state.bank; state.goals=x.goals||state.goals; state.movements=x.movements||[]; state.bookmakers=(x.bookmakers||[]).map(b=>({...b,balance:+b.balance||0})); state.settings=x.settings||state.settings; state.academy=x.academy||[]; state.subscription=x.subscription||state.subscription; state.entitlements=x.entitlements||[]; state.notifications=x.notifications||[]; state.referral_code=x.referral_code||null; state.acquisition=x.acquisition||null;
    return true;
  }catch{ return false; }
}

function landing(mode='login'){
  const isRegister=mode==='register', isForgot=mode==='forgot';
  const resetToken=new URLSearchParams(location.search).get('reset');
  if(resetToken) return resetPasswordScreen(resetToken);
  $('#app').innerHTML=`<main class="landing"><div class="landing-wrap">
    <section class="card login-card">
      <img class="brand-img" src="logo.png" alt="EQP Centro" />
      <h1 style="text-align:center">${isRegister?'Crie sua conta':isForgot?'Recuperar senha':'Sua operação.<br><span class="accent">Sob controle.</span>'}</h1>
      <p class="sub">${isForgot?'Informe o e-mail da sua conta.':'Surebets • Freebets • Promoções • Banca<br>Gestão • Dados • Resultados'}</p>
      <form id="authForm">
        ${isRegister?'<div class="field"><label>Nome completo</label><input class="input" id="name" autocomplete="name" placeholder="Nome e sobrenome" required></div>':''}
        <div class="field"><label>E-mail</label><input class="input" type="email" id="email" autocomplete="email" required></div>
        ${!isForgot?`<div class="field"><label>Senha</label><input class="input" type="password" id="pass" minlength="8" autocomplete="${isRegister?'new-password':'current-password'}" required></div>`:''}
        ${isRegister?'<div class="field"><label>Confirmar senha</label><input class="input" type="password" id="pass2" minlength="8" autocomplete="new-password" required></div><label class="check-row"><input type="checkbox" id="terms" required><span>Li e aceito os Termos de Uso e a Política de Privacidade.</span></label><label class="check-row"><input type="checkbox" id="age" required><span>Confirmo que tenho 18 anos ou mais.</span></label>':''}
        <div id="authError" class="bad" style="min-height:22px;font-size:13px"></div>
        <button class="btn primary full">${isRegister?'Criar conta':isForgot?'Enviar instruções':'Entrar'}</button>
      </form>
      ${!isRegister&&!isForgot?'<button class="text-btn" id="forgotPass">Esqueci minha senha</button>':''}
      ${isForgot?'<button class="btn ghost full" id="backLogin">Voltar para entrar</button>':`<p class="muted" style="text-align:center;margin-top:22px">${isRegister?'Já tem uma conta?':'Ainda não tem uma conta?'}</p><button class="btn ghost full" id="switchAuth">${isRegister?'Entrar':'Criar conta'}</button>`}
    </section>
    <section class="hero"><div class="eyebrow">DADOS TRANSFORMAM RESULTADOS</div><h2>Mais que registros.<br><span class="accent">É controle.</span></h2><p>A EQP Centro centraliza cálculos, operações, banca, metas, promoções e relatórios em um único web app responsivo.</p><div class="mock-grid"><div class="card mock"><h3>🔥 Surebet</h3><p class="muted">Calcule e acompanhe suas próprias operações.</p><div class="kpi">2,18%</div><span class="good">margem de exemplo</span></div><div class="card mock"><h3>💰 Banca</h3><p class="muted">Banca, reserva, bolso e fiscal separados.</p><div class="kpi">R$ 5.420</div><span class="good">controle centralizado</span></div><div class="card mock"><h3>🎁 Promos</h3><p class="muted">Cadastre e acompanhe promoções e freebets.</p><div class="kpi">5</div><span class="muted">em andamento</span></div></div></section>
  </div></main>`;
  if($('#switchAuth')) $('#switchAuth').onclick=()=>landing(isRegister?'login':'register');
  if($('#forgotPass')) $('#forgotPass').onclick=()=>landing('forgot');
  if($('#backLogin')) $('#backLogin').onclick=()=>landing('login');
  $('#authForm').onsubmit=async e=>{
    e.preventDefault(); const err=$('#authError'); err.textContent='';
    try{
      if(isForgot){ await API.forgotPassword($('#email').value); err.className='good'; err.textContent='Se o e-mail estiver cadastrado, enviaremos um link de recuperação.'; return; }
      if(isRegister && $('#pass').value!==$('#pass2').value) throw new Error('As senhas não coincidem.');
      state.user=isRegister ? await API.register($('#name').value,$('#email').value,$('#pass').value,$('#terms').checked,$('#age').checked) : await API.login($('#email').value,$('#pass').value);
      await loadAccount(); renderApp();
    }catch(ex){ err.className='bad'; err.textContent=ex.message; }
  };
}

function resetPasswordScreen(token){
  $('#app').innerHTML=`<main class="landing"><div class="landing-wrap"><section class="card login-card"><img class="brand-img" src="logo.png" alt="EQP Centro"><h1 style="text-align:center">Criar nova senha</h1><p class="sub">Escolha uma nova senha para sua conta.</p><form id="resetForm"><div class="field"><label>Nova senha</label><input class="input" id="newPass" type="password" minlength="8" required></div><div class="field"><label>Confirmar nova senha</label><input class="input" id="newPass2" type="password" minlength="8" required></div><div id="resetMsg" style="min-height:22px"></div><button class="btn primary full">Salvar nova senha</button></form></section></div></main>`;
  $('#resetForm').onsubmit=async e=>{e.preventDefault();const m=$('#resetMsg');try{if($('#newPass').value!==$('#newPass2').value)throw new Error('As senhas não coincidem.');await API.resetPassword(token,$('#newPass').value);history.replaceState({},'',location.pathname);m.className='good';m.textContent='Senha alterada. Você já pode entrar.';setTimeout(()=>landing('login'),1200);}catch(ex){m.className='bad';m.textContent=ex.message;}};
}

function hasAccess(code){return (state.entitlements||[]).some(e=>e.code===code&&e.status==='active');}
function fmtDate(ts){return ts?new Date(ts*1000).toLocaleString('pt-BR'):'—';}

const icons={dashboard:'⌂',surebet:'ϟ',promos:'✦',operations:'▤',bank:'▣',houses:'◫',fiscal:'⌁',ai:'✧',academy:'◉',settings:'☰'};
const navGroups=[
  ['INÍCIO',[['dashboard','Visão geral']]],
  ['OPERAÇÃO',[['surebet','Surebet'],['promos','Promoções / Freebets'],['operations','Operações']]],
  ['DINHEIRO',[['bank','Banca'],['houses','Saldo por casa'],['fiscal','Impostos (IR)']]],
  ['FERRAMENTAS',[['ai','EQP IA (Promoções)']]],
  ['CONTEÚDO',[['academy','Academy']]],
  ['CONTA',[['settings','Configurações']]]
];

function shell(content,title){
  const unread=(state.notifications||[]).filter(n=>!n.read_at).length;
  $('#app').innerHTML=`<div class="app-shell"><aside class="sidebar"><div class="side-brand"><span>EQP</span> CENTRO</div><nav class="nav">${navGroups.map(([g,items])=>`<div class="nav-group"><small>${g}</small>${items.map(([p,l])=>`<button data-page="${p}" class="${state.page===p?'active':''}"><span>${icons[p]}</span>${l}</button>`).join('')}</div>`).join('')}</nav></aside><main class="content"><header class="topbar"><div><h1>${title}</h1><div class="muted">EQP Centro • Web App</div></div><div class="top-actions"><span class="chip hide-sm">👁 Ocultar valores</span><button class="chip chip-btn" id="notificationsBtn">🔔${unread?` <b>${unread}</b>`:''}</button><button class="chip chip-btn avatar-chip" id="profileBtn">${(state.user?.name||'U').trim()[0]||'U'}</button></div></header>${content}</main></div>
  <nav class="bottom-nav"><button data-page="dashboard" class="${state.page==='dashboard'?'active':''}">⌂<span>Início</span></button><button data-page="surebet" class="${state.page==='surebet'?'active':''}">ϟ<span>Surebet</span></button><button class="plus" id="quickPlus">+</button><button data-page="bank" class="${state.page==='bank'?'active':''}">▣<span>Banca</span></button><button data-page="settings" class="${state.page==='settings'?'active':''}">☰<span>Menu</span></button></nav><div id="modalRoot"></div>`;
  $$('[data-page]').forEach(b=>b.onclick=()=>{state.page=b.dataset.page;renderPage();});
  const q=$('#quickPlus'); if(q) q.onclick=()=>{state.page='surebet';renderPage();};
  $('#notificationsBtn').onclick=openNotifications;
  $('#profileBtn').onclick=openProfile;
}

function closeModal(){const r=$('#modalRoot');if(r)r.innerHTML='';}
function openProfile(){
  const accesses=(state.entitlements||[]).map(e=>e.code.replace('EQP_BASIC','EQP Basic').replace('EQP_PRO','EQP Pro').replace('TIME_VIP','Time do Centro VIP')).join(' • ')||'EQP Basic';
  $('#modalRoot').innerHTML=`<div class="modal-backdrop" id="modalBackdrop"><div class="modal-card"><div class="row between"><h3>👤 Perfil</h3><button class="modal-x" id="modalClose">×</button></div><div class="profile-head"><div class="profile-avatar">${(state.user?.name||'U')[0]}</div><div><b>${state.user?.name||'Usuário'}</b><div class="muted">${state.user?.email||''}</div></div></div><div class="list-item"><span>Acessos</span><b>${accesses}</b></div><div class="list-item"><span>Código de indicação</span><b>${state.referral_code||'—'}</b></div><button class="btn primary full" id="profileSettings" style="margin-top:14px">Abrir configurações da conta</button></div></div>`;
  $('#modalClose').onclick=closeModal;$('#modalBackdrop').onclick=e=>{if(e.target.id==='modalBackdrop')closeModal();};$('#profileSettings').onclick=()=>{closeModal();state.page='settings';renderPage();};
}
async function openNotifications(){
  const notes=state.notifications||[];
  $('#modalRoot').innerHTML=`<div class="modal-backdrop" id="modalBackdrop"><div class="modal-card"><div class="row between"><h3>🔔 Notificações</h3><button class="modal-x" id="modalClose">×</button></div>${notes.length?notes.map(n=>`<button class="notification-row ${n.read_at?'':'unread'}" data-note="${n.id}"><div><b>${n.title}</b><p>${n.body||''}</p><small>${fmtDate(n.created_at)}</small></div></button>`).join(''):'<p class="muted">Nenhuma notificação.</p>'}${notes.some(n=>!n.read_at)?'<button class="btn full" id="readAll">Marcar todas como lidas</button>':''}</div></div>`;
  $('#modalClose').onclick=closeModal;$('#modalBackdrop').onclick=e=>{if(e.target.id==='modalBackdrop')closeModal();};$$('[data-note]').forEach(b=>b.onclick=async()=>{await API.readNotification(+b.dataset.note);await loadAccount();openNotifications();});if($('#readAll'))$('#readAll').onclick=async()=>{await API.readAllNotifications();await loadAccount();openNotifications();};
}

function totals(){
  const completed=state.operations.filter(o=>o.status==='Concluída');
  const volume=completed.reduce((a,o)=>a+(+o.volume||0),0);
  const result=completed.reduce((a,o)=>a+(+o.result||0),0);
  const roi=volume?result/volume*100:0;
  return {volume,result,roi,count:completed.length};
}
function dashboard(){
  const done=state.operations.filter(o=>o.status==='Concluída');
  const vol=done.reduce((a,o)=>a+(+o.volume||0),0), profit=done.reduce((a,o)=>a+(+o.result||0),0), roi=vol?profit/vol*100:0;
  const houseTotal=state.bookmakers.reduce((a,b)=>a+(+b.balance||0),0);
  const houses=state.bookmakers.slice(0,8).map(b=>`<div class="house-card"><div class="house-icon">${(b.name||'?')[0].toUpperCase()}</div><div class="house-meta"><b>${b.name}</b><strong>${money(b.balance)}</strong></div><button class="mini-btn" data-edit-house="${b.id}">Gerenciar</button></div>`).join('');
  const recent=state.operations.slice(-5).reverse().map(o=>`<tr><td>${o.type}</td><td>${o.name||'Operação'}</td><td><span class="pill ${(+o.result||0)>=0?'green':'red'}">${o.status}</span></td><td class="${(+o.result||0)>=0?'good':'bad'}"><b>${money(o.result)}</b></td></tr>`).join('');
  shell(`<section class="stats dashboard-stats"><div class="card stat"><small>Lucro acumulado</small><strong class="good">${money(profit)}</strong><span class="good">Resultado concluído</span></div><div class="card stat"><small>ROI</small><strong>${pct(roi)}</strong><span class="muted">Sobre volume concluído</span></div><div class="card stat"><small>Volume operado</small><strong>${money(vol)}</strong><span class="muted">${done.length} operações</span></div><div class="card stat"><small>Saldo total nas casas</small><strong>${money(houseTotal)}</strong><span class="muted">${state.bookmakers.length} casas cadastradas</span></div></section>
  <section class="section-title"><div><h2>Saldo por casa</h2><p>Veja onde sua banca está distribuída.</p></div><button class="btn" id="dashAddHouse">+ Adicionar casa</button></section>
  <section class="houses-grid">${houses||`<button class="house-card house-add" id="emptyAddHouse"><b>＋</b><span>Adicionar primeira casa</span></button>`}</section>
  <div class="dashboard-grid"><section class="card section"><div class="row between"><h3>Últimas operações</h3><button class="text-btn" data-go="operations">Ver todas →</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Tipo</th><th>Detalhes</th><th>Status</th><th>Resultado</th></tr></thead><tbody>${recent||'<tr><td colspan="4" class="muted">Nenhuma operação registrada.</td></tr>'}</tbody></table></div></section>
  <section class="card section"><h3>Distribuição da banca</h3><div class="bank-total"><small>Saldo nas casas</small><strong>${money(houseTotal)}</strong></div>${state.bookmakers.slice(0,6).map(b=>{const pc=houseTotal?b.balance/houseTotal*100:0;return `<div class="dist-row"><span>${b.name}</span><b>${pc.toFixed(1).replace('.',',')}%</b></div><div class="bar"><span style="width:${pc}%"></span></div>`}).join('')||'<div class="muted">Cadastre casas para visualizar a distribuição.</div>'}</section></div>
  <section class="section-title compact"><div><h2>Acesso rápido</h2></div></section><section class="quick quick-v17"><button class="btn" data-go="operations">＋ Nova operação</button><button class="btn" data-go="surebet">▦ Calcular surebet</button><button class="btn" data-go="ai">✦ Analisar promoção (IA)</button><button class="btn" data-go="houses">▣ Adicionar saldo</button></section>`, 'Visão geral');
  $$('[data-go]').forEach(b=>b.onclick=()=>{state.page=b.dataset.go;renderPage();});
  const add=()=>{state.page='houses';renderPage();setTimeout(()=>$('#newHouse')?.click(),0)};
  if($('#dashAddHouse')) $('#dashAddHouse').onclick=add;if($('#emptyAddHouse')) $('#emptyAddHouse').onclick=add;
  $$('[data-edit-house]').forEach(b=>b.onclick=()=>{state.page='houses';renderPage();setTimeout(()=>document.querySelector(`[data-house-id="${b.dataset.editHouse}"]`)?.click(),0)});
}

function surebet(){
  const sureOps=state.operations.filter(o=>o.type==='Surebet').slice().reverse();
  shell(`<div class="tabs" id="sureTabs"><button class="active" data-tab="calc">Calculadora</button><button data-tab="hist">Histórico</button><button data-tab="stats">Estatísticas</button></div>
  <section id="sureCalc"><div class="grid2"><section class="card section"><div class="row between"><h3>🔥 Calculadora de Surebet</h3><span class="pill green">2 ou 3 resultados</span></div>
    <div class="form-grid"><div class="field"><label>Modo</label><select class="input" id="sureMode"><option value="total">Definir capital total</option><option value="fixed">Fixar uma aposta</option></select></div><div class="field"><label>Número de resultados</label><select class="input" id="outcomes"><option value="2">2 resultados</option><option value="3">3 resultados</option></select></div></div>
    <div class="form-grid"><div class="field"><label>Evento / nome</label><input class="input" id="eventName" placeholder="Ex.: Time A x Time B"></div><div class="field"><label>Mercado</label><input class="input" id="market" placeholder="Ex.: Resultado final"></div></div>
    <div id="oddsFields"></div>
    <div class="form-grid"><div class="field" id="capitalField"><label>Capital total (R$)</label><input class="input" id="capital" type="number" step="0.01" value="1000"></div><div class="field hidden" id="fixedField"><label>Valor fixo da aposta 1 (R$)</label><input class="input" id="fixedStake" type="number" step="0.01" value="500"></div><div class="field"><label>Custo adicional (%)</label><input class="input" id="fee" type="number" step="0.01" value="0"></div></div>
    <button class="btn primary full" id="calcSure">Calcular Surebet</button><div id="sureResult" style="margin-top:14px"></div>
  </section><section class="card section"><h3>Últimas surebets</h3><div id="sureHistory">${sureOps.slice(0,7).map(op=>sureCard(op)).join('')||'<span class="muted">Nenhuma registrada.</span>'}</div></section></div></section>
  <section id="sureHist" class="hidden"><section class="card section"><div class="row between"><h3>📒 Histórico de Surebets</h3><span class="muted">${sureOps.length} registro(s)</span></div>${sureOps.map(op=>sureCard(op,true)).join('')||'<span class="muted">Nenhuma surebet registrada.</span>'}</section></section>
  <section id="sureStats" class="hidden">${sureStatsHtml(sureOps)}</section>`, 'Surebet');

  function sureCard(op,details=false){
    const m=op.meta||{}, st=op.status||'Em andamento';
    return `<div class="list-item op-row" data-op="${op.id}"><div><b>${op.name||'Surebet'}</b><div class="muted">${m.market||'Mercado não informado'} • ${st}</div>${details?`<div class="muted">Odds: ${(m.odds||[]).map(x=>Number(x).toFixed(2)).join(' / ')||'—'} • Volume ${money(op.volume)}</div>`:''}</div><div style="text-align:right"><span class="pill ${st==='Concluída'?'green':'amber'}">${st}</span><div class="${(+op.result||0)>=0?'good':'bad'}" style="margin-top:6px;font-weight:800">${money(op.result)}</div></div></div>`;
  }
  function sureStatsHtml(ops){
    const done=ops.filter(o=>o.status==='Concluída'), vol=done.reduce((a,o)=>a+(+o.volume||0),0), res=done.reduce((a,o)=>a+(+o.result||0),0), roi=vol?res/vol*100:0;
    return `<section class="stats"><div class="card stat"><small>Surebets concluídas</small><strong>${done.length}</strong></div><div class="card stat"><small>Volume</small><strong>${money(vol)}</strong></div><div class="card stat"><small>Resultado real</small><strong class="${res>=0?'good':'bad'}">${money(res)}</strong></div><div class="card stat"><small>ROI</small><strong>${pct(roi)}</strong></div></section><section class="card section" style="margin-top:16px"><h3>📊 Leitura rápida</h3><div class="notice">As estatísticas usam apenas operações marcadas como <b>Concluída</b> e o resultado real registrado pelo usuário.</div></section>`;
  }
  function renderOdds(){
    const n=+$('#outcomes').value;
    $('#oddsFields').innerHTML=Array.from({length:n},(_,i)=>`<div class="form-grid"><div class="field"><label>Operador ${i+1}</label><input class="input operator" data-i="${i}" placeholder="Ex.: Operador ${i+1}"></div><div class="field"><label>Odd ${i+1}</label><input class="input odd" data-i="${i}" type="number" step="0.01" value="${i===0?'2.15':i===1?'2.05':'3.20'}"></div></div>`).join('');
  }
  renderOdds();
  $('#outcomes').onchange=renderOdds;
  $('#sureMode').onchange=()=>{const fixed=$('#sureMode').value==='fixed';$('#capitalField').classList.toggle('hidden',fixed);$('#fixedField').classList.toggle('hidden',!fixed);};
  $$('#sureTabs button').forEach(b=>b.onclick=()=>{$$('#sureTabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#sureCalc').classList.toggle('hidden',b.dataset.tab!=='calc');$('#sureHist').classList.toggle('hidden',b.dataset.tab!=='hist');$('#sureStats').classList.toggle('hidden',b.dataset.tab!=='stats');});

  $('#calcSure').onclick=()=>{
    const odds=$$('.odd').map(i=>+i.value), operators=$$('.operator').map(i=>i.value.trim()||`Operador ${+i.dataset.i+1}`), fee=(+$('#fee').value||0)/100;
    if(odds.some(o=>o<=1)) return $('#sureResult').innerHTML='<div class="notice bad">Preencha odds válidas, maiores que 1,00.</div>';
    const inv=odds.reduce((a,o)=>a+1/o,0), arb=inv<1;
    let cap, stakes;
    if($('#sureMode').value==='fixed'){
      const fixed=+$('#fixedStake').value;
      if(fixed<=0) return $('#sureResult').innerHTML='<div class="notice bad">Informe uma stake fixa válida.</div>';
      const gross=fixed*odds[0]; stakes=[fixed,...odds.slice(1).map(o=>gross/o)]; cap=stakes.reduce((a,b)=>a+b,0);
    } else {
      cap=+$('#capital').value;
      if(cap<=0) return $('#sureResult').innerHTML='<div class="notice bad">Informe um capital total válido.</div>';
      stakes=odds.map(o=>cap*(1/o)/inv);
    }
    const returns=stakes.map((s,i)=>s*odds[i]), gross=Math.min(...returns), net=gross-cap-(cap*fee), margin=net/cap*100;
    const rows=stakes.map((s,i)=>`<div class="list-item"><div><b>${operators[i]}</b><div class="muted">Odd ${odds[i].toFixed(2)}</div></div><div style="text-align:right"><b>${money(s)}</b><div class="muted">retorno ${money(returns[i])}</div></div></div>`).join('');
    $('#sureResult').innerHTML=`<div class="result-box"><div class="row between"><h3 style="margin:0" class="${arb?'good':'bad'}">${arb?'Existe arbitragem matemática':'Não há arbitragem com essas odds'}</h3><span class="pill ${arb?'green':'red'}">Σ 1/odd = ${inv.toFixed(4)}</span></div>${rows}<div class="grid3" style="margin-top:14px"><div><span class="muted">Capital</span><div class="kpi">${money(cap)}</div></div><div><span class="muted">Resultado estimado</span><div class="kpi ${net>=0?'good':'bad'}">${money(net)}</div></div><div><span class="muted">Margem</span><div class="kpi">${pct(margin)}</div></div></div><div class="row" style="margin-top:14px;flex-wrap:wrap"><button class="btn primary" id="saveSureOpen">Registrar em andamento</button><button class="btn" id="saveSureDone">Registrar como concluída</button></div></div>`;
    const payload=status=>({type:'Surebet',name:$('#eventName').value.trim()||'Surebet',volume:cap,result:status==='Concluída'?net:0,status,meta:{odds,stakes,operators,returns,gross_return:gross,estimated_result:net,margin,fee_percent:fee*100,arbitrage:arb,market:$('#market').value.trim(),mode:$('#sureMode').value}});
    $('#saveSureOpen').onclick=async()=>{try{await API.createOperation(payload('Em andamento'));await loadAccount();surebet();}catch(ex){alert(ex.message)}};
    $('#saveSureDone').onclick=async()=>{try{await API.createOperation(payload('Concluída'));await loadAccount();surebet();}catch(ex){alert(ex.message)}};
  };

  $$('.op-row').forEach(el=>el.onclick=()=>openSureOperation(+el.dataset.op));
}

async function openSureOperation(id){
  const op=state.operations.find(o=>o.id===id); if(!op) return;
  const m=op.meta||{};
  const real=prompt(`Resultado real da operação "${op.name}".\n\nStatus atual: ${op.status}\nResultado atual: ${money(op.result)}\n\nDigite o resultado líquido real (use negativo se necessário):`, String(op.result||m.estimated_result||0));
  if(real===null) return;
  const value=Number(String(real).replace(',','.')); if(Number.isNaN(value)) return alert('Valor inválido.');
  const finish=confirm('Marcar esta operação como CONCLUÍDA?\n\nOK = Concluída\nCancelar = manter Em andamento');
  try{await API.updateOperation({id:op.id,result:value,status:finish?'Concluída':'Em andamento',meta:{...m,real_result:value}});await loadAccount();surebet();}catch(ex){alert(ex.message)}
}

function promos(){
  const pro=hasAccess('EQP_PRO');
  const active=state.promos.filter(p=>p.status!=='Concluída');
  const available=state.freebets.filter(f=>f.status==='Disponível');
  const freeValue=available.reduce((a,f)=>a+(+f.value||0),0);
  shell(`<section class="stats"><div class="card stat"><small>Promoções ativas</small><strong>${active.length}</strong></div><div class="card stat"><small>Freebets disponíveis</small><strong>${money(freeValue)}</strong></div><div class="card stat"><small>Em acompanhamento</small><strong>${state.promos.filter(p=>p.status==='Em andamento').length}</strong></div><div class="card stat"><small>Concluídas</small><strong>${state.promos.filter(p=>p.status==='Concluída').length}</strong></div></section>
  <div class="tabs" id="promoTabs"><button class="active" data-ptab="list">Visão geral</button><button data-ptab="new">Nova promoção</button><button data-ptab="free">Freebets</button></div>
  <section id="promoList"><div class="grid2"><section class="card section"><div class="row between"><h3>🎁 Minhas promoções</h3><button class="btn primary" id="newPromoBtn">+ Nova</button></div>${state.promos.slice().reverse().map(p=>promoCard(p)).join('')||'<div class="muted">Nenhuma promoção cadastrada.</div>'}</section>
  <section class="card section"><h3>⏳ Próximos passos</h3>${active.slice(0,6).map(p=>{const r=promoReq(p),done=(r.steps||[]).filter(x=>x.done).length,total=(r.steps||[]).length;return `<div class="list-item"><div><b>${p.name}</b><div class="muted">${total?`${done}/${total} requisitos`: 'Sem checklist'} • ${p.date||'sem prazo'}</div></div><span class="pill amber">${p.status}</span></div>`}).join('')||'<span class="muted">Sem pendências.</span>'}</section></div></section>
  <section id="promoNew" class="hidden"><div class="grid2"><section class="card section"><h3>📸 Cadastrar por print</h3>${pro?`<div class="notice"><b>Recurso EQP Pro.</b><br><span class="muted">Envie o print para o fluxo inteligente. A leitura automática será ativada quando a integração da IA estiver conectada.</span></div><div class="field" style="margin-top:14px"><label>Print da promoção</label><input class="input" type="file" accept="image/*" id="promoImg"></div><div id="promoPreview"></div>`:`<div class="pro-lock"><div class="lock-icon">💎</div><h3>Leitura de print é Pro</h3><p class="muted">No Basic você pode cadastrar a promoção manualmente ao lado. Upload e análise de print ficam disponíveis no EQP Centro Pro.</p><button class="btn primary full" id="promoGoPro">Conhecer EQP Pro</button></div>`}</section>
  <section class="card section"><h3>✍️ Dados da promoção</h3><div class="form-grid"><div class="field"><label>Operador</label><input class="input" id="pOp" placeholder="Ex.: Operador A"></div><div class="field"><label>Tipo</label><select class="input" id="pType"><option>Freebet</option><option>Aposte e Ganhe</option><option>Missão</option><option>Cashback</option><option>Bônus</option><option>Outro</option></select></div></div><div class="field"><label>Nome</label><input class="input" id="pName" placeholder="Ex.: Faça 3 apostas e ganhe freebet"></div><div class="form-grid"><div class="field"><label>Benefício (R$)</label><input class="input" id="pValue" type="number" step="0.01"></div><div class="field"><label>Validade</label><input class="input" id="pDate" type="date"></div></div><div class="form-grid"><div class="field"><label>Qtd. de requisitos/apostas</label><input class="input" id="pCount" type="number" min="0" value="3"></div><div class="field"><label>Valor mínimo por etapa (R$)</label><input class="input" id="pMin" type="number" step="0.01"></div></div><div class="field"><label>Odd mínima</label><input class="input" id="pOdd" type="number" step="0.01"></div><div class="field"><label>Outras regras / restrições</label><textarea class="input" id="pNotes" rows="4"></textarea></div><button class="btn primary full" id="savePromo">Revisar e salvar promoção</button></section></div></section>
  <section id="promoFree" class="hidden"><div class="grid2"><section class="card section"><h3>🎟️ Minhas Freebets</h3>${state.freebets.slice().reverse().map(f=>freebetCard(f)).join('')||'<span class="muted">Nenhuma freebet cadastrada.</span>'}</section><section class="card section"><h3>🧮 Calculadora de Freebet</h3><div class="field"><label>Valor da freebet (R$)</label><input class="input" id="fbValue" type="number" step="0.01" value="100"></div><div class="form-grid"><div class="field"><label>Odd da freebet</label><input class="input" id="fbOdd" type="number" step="0.01" value="5"></div><div class="field"><label>Odd da proteção</label><input class="input" id="fbHedge" type="number" step="0.01" value="1.25"></div></div><div class="field"><label>Modelo</label><select class="input" id="fbModel"><option value="snr">Stake não devolvida (SNR)</option><option value="sr">Stake devolvida</option></select></div><button class="btn primary full" id="calcFb">Calcular</button><div id="fbResult" style="margin-top:14px"></div></section></div></section>`, 'Promoções / Freebets');

  function promoReq(p){ const x=p.req; if(Array.isArray(x)) return {notes:x.join('\n'),steps:[]}; return x||{steps:[]}; }
  function promoCard(p){const r=promoReq(p),steps=r.steps||[],done=steps.filter(x=>x.done).length,progress=steps.length?done/steps.length*100:0;return `<div class="op-row promo-row" data-promo="${p.id}"><div class="row between"><div><b>${p.name}</b><div class="muted">${p.operator||'Operador'} • ${r.type||'Promoção'} • ${p.date||'sem prazo'}</div></div><span class="pill ${p.status==='Concluída'?'green':'amber'}">${p.status}</span></div><div class="row between" style="margin-top:10px"><span class="muted">Benefício ${money(p.value)}</span><b>${steps.length?`${done}/${steps.length}`:'Abrir'}</b></div>${steps.length?`<div class="bar" style="margin-top:8px"><span style="width:${progress}%"></span></div>`:''}</div>`}
  function freebetCard(f){return `<div class="op-row fb-row" data-fb="${f.id}"><div class="row between"><div><b>${money(f.value)} • ${f.operator||'Freebet'}</b><div class="muted">${f.deadline||'sem prazo'} • ${f.status}</div></div><button class="btn">Calcular</button></div></div>`}

  function showTab(tab){['list','new','free'].forEach(x=>$('#promo'+(x==='list'?'List':x==='new'?'New':'Free')).classList.toggle('hidden',x!==tab));$$('[data-ptab]').forEach(b=>b.classList.toggle('active',b.dataset.ptab===tab));}
  $$('[data-ptab]').forEach(b=>b.onclick=()=>showTab(b.dataset.ptab)); $('#newPromoBtn').onclick=()=>showTab('new');
  const img=$('#promoImg'); if($('#promoGoPro')) $('#promoGoPro').onclick=()=>{state.page='settings';renderPage();}; if(img) img.onchange=()=>{const f=img.files?.[0]; if(!f)return; const url=URL.createObjectURL(f); $('#promoPreview').innerHTML=`<img src="${url}" alt="Print da promoção" style="width:100%;max-height:360px;object-fit:contain;border-radius:14px;margin-top:14px;border:1px solid var(--line)"><p class="muted">Print carregado. Confira e preencha/revise os dados ao lado.</p>`;};
  const aiDraft=sessionStorage.getItem('eqp_ai_promo'); if(aiDraft){try{const a=JSON.parse(aiDraft); if($('#pName')) $('#pName').value=a.title||''; if($('#pOp')) $('#pOp').value=a.operator||''; if($('#pType')&&a.type) $('#pType').value=a.type; if($('#pValue')) $('#pValue').value=a.benefit??''; if($('#pCount')) $('#pCount').value=a.count??''; if($('#pMin')) $('#pMin').value=a.min_value??''; if($('#pOdd')) $('#pOdd').value=a.min_odd??''; if($('#pDate')) $('#pDate').value=(a.deadline||'').slice(0,10); if($('#pNotes')) $('#pNotes').value=[a.notes,...(a.warnings||[])].filter(Boolean).join(' | '); sessionStorage.removeItem('eqp_ai_promo');}catch(e){}}
  $('#savePromo').onclick=async()=>{const count=Math.max(0,+$('#pCount').value||0),min=+$('#pMin').value||0,steps=Array.from({length:count},(_,i)=>({label:`Etapa ${i+1}${min?` • mínimo ${money(min)}`:''}`,done:false}));const req={type:$('#pType').value,min_value:min,min_odd:+$('#pOdd').value||0,notes:$('#pNotes').value.trim(),steps};const payload={operator:$('#pOp').value||'Operador',title:$('#pName').value||'Promoção',benefit:+$('#pValue').value||0,deadline:$('#pDate').value||null,requirements:req,status:'Em andamento'};if(!confirm(`Salvar esta promoção?\n\n${payload.title}\n${payload.operator}\nBenefício: ${money(payload.benefit)}\nRequisitos: ${count}`))return;try{await API.createPromo(payload);await loadAccount();promos();}catch(ex){alert(ex.message)}};
  $$('.promo-row').forEach(el=>el.onclick=async()=>{const p=state.promos.find(x=>x.id===+el.dataset.promo);if(!p)return;const r=promoReq(p),steps=r.steps||[];let text=`${p.name}\n${p.operator||''}\nBenefício: ${money(p.value)}\nPrazo: ${p.date||'sem prazo'}\n\n`;if(steps.length)text+=steps.map((x,i)=>`${x.done?'✅':'⬜'} ${i+1}. ${x.label}`).join('\n');text+='\n\nDigite o número da etapa para marcar/desmarcar, C para concluir a promoção ou F para gerar a freebet:';const ans=prompt(text);if(!ans)return;try{if(ans.toUpperCase()==='C'){await API.updatePromo({id:p.id,status:'Concluída'});}else if(ans.toUpperCase()==='F'){await API.createFreebet({promo_id:p.id,operator:p.operator,value:p.value,deadline:p.date,status:'Disponível',meta:{source_promo:p.name}});}else{const n=+ans;if(n>=1&&n<=steps.length){steps[n-1].done=!steps[n-1].done;await API.updatePromo({id:p.id,requirements:{...r,steps}});}}await loadAccount();promos();}catch(ex){alert(ex.message)}});
  $$('.fb-row').forEach(el=>el.onclick=()=>{const f=state.freebets.find(x=>x.id===+el.dataset.fb);showTab('free');$('#fbValue').value=f.value;});
  $('#calcFb').onclick=()=>{const v=+$('#fbValue').value||0,o=+$('#fbOdd').value||0,h=+$('#fbHedge').value||0,model=$('#fbModel').value;if(v<=0||o<=1||h<=1)return $('#fbResult').innerHTML='<div class="notice bad">Use valores e odds válidos.</div>';const gross=model==='snr'?v*(o-1):v*o;const hedge=gross/h;const ifFb=gross-hedge;const ifHedge=hedge*(h-1);const conv=v?Math.min(ifFb,ifHedge)/v*100:0;$('#fbResult').innerHTML=`<div class="result-box"><div class="row between"><span>Proteção estimada</span><b>${money(hedge)}</b></div><div class="row between"><span>Cenário freebet</span><b>${money(ifFb)}</b></div><div class="row between"><span>Cenário proteção</span><b>${money(ifHedge)}</b></div><div class="row between"><span>Conversão conservadora</span><b class="good">${pct(conv)}</b></div><p class="muted">Cálculo matemático simplificado; confirme regras, comissão e liquidação do operador.</p></div>`;};
}
function operations(){
  const completed=state.operations.filter(o=>o.status==='Concluída');
  const gross=completed.reduce((a,o)=>a+(+(o.meta?.gross_result ?? o.result)||0),0);
  const costs=completed.reduce((a,o)=>a+(+o.meta?.costs||0),0);
  const net=completed.reduce((a,o)=>a+(+o.result||0),0);
  const volume=completed.reduce((a,o)=>a+(+o.volume||0),0);
  const roi=volume?net/volume*100:0;
  const open=state.operations.filter(o=>o.status!=='Concluída'&&o.status!=='Cancelada').length;
  const rows=state.operations.slice().reverse().map(o=>{const m=o.meta||{};return `<div class="op-row operation-row" data-op="${o.id}"><div class="row between"><div><b>${o.type} • ${o.name||'Operação'}</b><div class="muted">${o.status} • Volume ${money(o.volume)}${m.operator?` • ${m.operator}`:''}</div></div><div style="text-align:right"><b class="${(+o.result||0)>=0?'good':'bad'}">${money(o.result)}</b><div class="muted">${o.status==='Concluída'?'líquido':'estimado/registrado'}</div></div></div></div>`}).join('');
  shell(`<section class="stats"><div class="card stat"><small>Volume bruto</small><strong>${money(volume)}</strong></div><div class="card stat"><small>Resultado bruto</small><strong>${money(gross)}</strong></div><div class="card stat"><small>Custos</small><strong>${money(costs)}</strong></div><div class="card stat"><small>Resultado líquido</small><strong class="${net>=0?'good':'bad'}">${money(net)}</strong></div></section>
  <section class="stats" style="margin-top:12px"><div class="card stat"><small>ROI líquido</small><strong>${pct(roi)}</strong></div><div class="card stat"><small>Concluídas</small><strong>${completed.length}</strong></div><div class="card stat"><small>Em aberto</small><strong>${open}</strong></div><div class="card stat"><small>Total de registros</small><strong>${state.operations.length}</strong></div></section>
  <div class="grid2" style="margin-top:16px"><section class="card section"><h3>➕ Registrar operação</h3><div class="field"><label>Tipo</label><select class="input" id="oType"><option>Surebet</option><option>Freebet</option><option>Promoção</option><option>Manual</option></select></div><div class="field"><label>Nome / identificação</label><input class="input" id="oName" placeholder="Ex.: Promo semanal / Jogo X"></div><div class="form-grid"><div class="field"><label>Volume movimentado (R$)</label><input class="input" id="oVol" type="number" min="0" step="0.01"></div><div class="field"><label>Resultado bruto (R$)</label><input class="input" id="oGross" type="number" step="0.01"></div><div class="field"><label>Custos (R$)</label><input class="input" id="oCosts" type="number" min="0" step="0.01" value="0"></div><div class="field"><label>Status</label><select class="input" id="oStatus"><option>Concluída</option><option>Em andamento</option><option>Aguardando resultado</option><option>Cancelada</option></select></div></div><div class="field"><label>Operador / referência (opcional)</label><input class="input" id="oOperator"></div><div class="notice">Resultado líquido = resultado bruto − custos. Promoções com etapas devem ser registradas como uma operação principal para evitar dupla contagem.</div><button class="btn primary full" id="saveOp" style="margin-top:12px">Registrar</button></section>
  <section class="card section"><div class="row between"><h3>📒 Histórico</h3><select class="input" id="opFilter" style="max-width:160px"><option value="all">Todos</option><option>Surebet</option><option>Freebet</option><option>Promoção</option><option>Manual</option></select></div><div id="opRows">${rows||'<span class="muted">Sem registros.</span>'}</div></section></div>`, 'Operações');
  $('#saveOp').onclick=async()=>{const gross=+$('#oGross').value||0,costs=Math.max(0,+$('#oCosts').value||0),net=gross-costs;const payload={type:$('#oType').value,name:$('#oName').value||'Operação',volume:Math.max(0,+$('#oVol').value||0),result:net,status:$('#oStatus').value,meta:{source:'manual',gross_result:gross,costs,operator:$('#oOperator').value.trim()}};if(!confirm(`Registrar operação?\n\nResultado bruto: ${money(gross)}\nCustos: ${money(costs)}\nResultado líquido: ${money(net)}`))return;try{await API.createOperation(payload);await loadAccount();operations();}catch(ex){alert(ex.message)}};
  $('#opFilter').onchange=e=>{const v=e.target.value; $$('.operation-row').forEach(r=>{const o=state.operations.find(x=>x.id===+r.dataset.op);r.style.display=(v==='all'||o?.type===v)?'block':'none';});};
  $$('.operation-row').forEach(el=>el.onclick=async()=>{const o=state.operations.find(x=>x.id===+el.dataset.op);if(!o)return;const m=o.meta||{};const ans=prompt(`${o.type} • ${o.name}\nStatus: ${o.status}\nVolume: ${money(o.volume)}\nBruto: ${money(m.gross_result??o.result)}\nCustos: ${money(m.costs||0)}\nLíquido: ${money(o.result)}\n\nDigite:\nF = finalizar/editar resultado\nC = cancelar\nE = excluir`);if(!ans)return;try{if(ans.toUpperCase()==='E'){if(confirm('Excluir definitivamente esta operação?'))await API.deleteOperation(o.id);}else if(ans.toUpperCase()==='C'){await API.updateOperation({id:o.id,status:'Cancelada'});}else if(ans.toUpperCase()==='F'){const g=prompt('Resultado bruto realizado (R$):',String(m.gross_result??o.result));if(g===null)return;const c=prompt('Custos realizados (R$):',String(m.costs||0));if(c===null)return;const gv=+g||0,cv=Math.max(0,+c||0);await API.updateOperation({id:o.id,result:gv-cv,status:'Concluída',meta:{...m,gross_result:gv,costs:cv}});}await loadAccount();operations();}catch(ex){alert(ex.message)}});
}
function houses(){
  const total=state.bookmakers.reduce((a,b)=>a+(+b.balance||0),0);
  const cards=state.bookmakers.map(b=>`<div class="house-card manage"><div class="house-icon">${b.name[0].toUpperCase()}</div><div class="house-meta"><b>${b.name}</b><strong>${money(b.balance)}</strong></div><button class="mini-btn" data-house-id="${b.id}">Gerenciar</button></div>`).join('');
  shell(`<section class="stats"><div class="card stat"><small>Saldo total nas casas</small><strong>${money(total)}</strong></div><div class="card stat"><small>Casas cadastradas</small><strong>${state.bookmakers.length}</strong></div><div class="card stat"><small>Maior saldo</small><strong>${money(Math.max(0,...state.bookmakers.map(b=>b.balance)))}</strong></div><div class="card stat"><small>Banca ativa</small><strong>${money(state.bank.active)}</strong></div></section><section class="section-title"><div><h2>Saldo por casa</h2><p>Controle o saldo disponível em cada operadora.</p></div><button class="btn primary" id="newHouse">+ Adicionar casa</button></section><section class="houses-grid">${cards||'<div class="card section muted">Nenhuma casa cadastrada ainda.</div>'}</section>`, 'Saldo por casa');
  const openForm=(b=null)=>{ $('#modalRoot').innerHTML=`<div class="modal-backdrop"><div class="modal-card"><div class="row between"><h3>${b?'Gerenciar':'Adicionar'} casa</h3><button class="modal-x" id="modalClose">×</button></div><div class="field" style="margin-top:18px"><label>Nome da casa</label><input class="input" id="houseName" value="${b?.name||''}" placeholder="Ex.: Betano"></div><div class="field"><label>Saldo atual (R$)</label><input class="input" id="houseBalance" type="number" step="0.01" value="${b?.balance??0}"></div><button class="btn primary full" id="saveHouse">Salvar</button>${b?'<button class="btn danger full" id="deleteHouse" style="margin-top:10px">Remover casa</button>':''}</div></div>`; $('#modalClose').onclick=closeModal; $('#saveHouse').onclick=async()=>{try{const payload={name:$('#houseName').value,balance:+$('#houseBalance').value||0};b?await API.updateBookmaker({...payload,id:b.id}):await API.createBookmaker(payload);await loadAccount();closeModal();houses();}catch(e){alert(e.message)}}; if(b) $('#deleteHouse').onclick=async()=>{if(confirm('Remover esta casa do controle?')){await API.deleteBookmaker(b.id);await loadAccount();closeModal();houses();}}; };
  $('#newHouse').onclick=()=>openForm(); $$('[data-house-id]').forEach(x=>x.onclick=()=>openForm(state.bookmakers.find(b=>String(b.id)===x.dataset.houseId)));
}

function bank(){
  const patr=Object.values(state.bank).reduce((a,b)=>a+(+b||0),0);
  let dist={bank:60,reserve:15,pocket:15,tax:10}; try{dist=JSON.parse(state.settings?.distribution_json||'{}')}catch{}
  const goals=state.goals||[];
  const goalHtml=goals.map(g=>{const pr=g.target>0?Math.min(100,(+g.current||0)/(+g.target)*100):0;return `<div class="goal-row" data-goal="${g.id}" style="margin:16px 0"><div class="row between"><b>${g.name}</b><span>${money(g.current)} / ${money(g.target)}</span></div><div class="bar"><span style="width:${pr}%"></span></div><small class="muted">${pct(pr)} concluído • toque para editar</small></div>`}).join('')||'<span class="muted">Nenhuma meta cadastrada.</span>';
  const movements=(state.movements||[]).slice(0,8).map(m=>`<div class="list-item"><div><b>${m.kind}</b><div class="muted">${m.note||'Sem observação'}</div></div><b class="${m.amount>=0?'good':'bad'}">${money(m.amount)}</b></div>`).join('')||'<span class="muted">Nenhuma movimentação registrada.</span>';
  shell(`<section class="stats"><div class="card stat"><small>Patrimônio</small><strong>${money(patr)}</strong></div><div class="card stat"><small>Banca ativa</small><strong>${money(state.bank.active)}</strong></div><div class="card stat"><small>Reserva</small><strong>${money(state.bank.reserve)}</strong></div><div class="card stat"><small>Bolso</small><strong>${money(state.bank.pocket)}</strong></div></section>
  <div class="grid2"><section class="card section"><h3>💰 Saldos e caixinhas</h3>${[['active','Banca ativa'],['reserve','Reserva'],['pocket','Bolso'],['tax','Reserva fiscal']].map(([k,n])=>`<div class="field"><label>${n}</label><input class="input bankInput" data-k="${k}" type="number" step="0.01" value="${state.bank[k]}"></div>`).join('')}<button class="btn primary full" id="saveBank">Salvar saldos</button><div class="notice" style="margin-top:12px">Os saldos são registros de organização. A EQP não movimenta dinheiro real.</div></section>
  <section class="card section"><h3>🔄 Distribuição dos resultados</h3><p class="muted">Defina como deseja organizar resultados positivos.</p>${[['bank','Crescimento da banca'],['reserve','Reserva'],['pocket','Bolso'],['tax','Reserva fiscal']].map(([k,n])=>`<div class="field"><label>${n} (%)</label><input class="input distInput" data-k="${k}" type="number" min="0" max="100" step="1" value="${dist[k]??0}"></div>`).join('')}<button class="btn" id="saveDist">Salvar regra</button><div class="field" style="margin-top:18px"><label>Simular/distribuir resultado positivo</label><input class="input" id="distAmount" type="number" min="0" step="0.01" placeholder="Ex.: 300"></div><button class="btn primary full" id="applyDist">Aplicar distribuição</button></section></div>
  <div class="grid2"><section class="card section"><div class="row between"><h3>🎯 Metas</h3><button class="btn" id="newGoal">+ Nova meta</button></div>${goalHtml}</section><section class="card section"><h3>↕ Movimentações</h3><div class="form-grid"><div class="field"><label>Tipo</label><select class="input" id="movKind"><option>Aporte</option><option>Retirada</option><option>Transferência</option><option>Ajuste</option></select></div><div class="field"><label>Valor</label><input class="input" id="movAmount" type="number" step="0.01"></div></div><div class="field"><label>Observação</label><input class="input" id="movNote" placeholder="Opcional"></div><button class="btn" id="saveMov">Registrar movimentação</button><div style="margin-top:18px">${movements}</div></section></div>`, 'Gestão de Banca');
  $('#saveBank').onclick=async()=>{const next={...state.bank};$$('.bankInput').forEach(i=>next[i.dataset.k]=+i.value||0);try{await API.updateBank(next);await loadAccount();bank();}catch(ex){alert(ex.message)}};
  $('#saveDist').onclick=async()=>{const d={};$$('.distInput').forEach(i=>d[i.dataset.k]=+i.value||0);try{await API.updateSettings(d);await loadAccount();bank();}catch(ex){alert(ex.message)}};
  $('#applyDist').onclick=async()=>{const a=+$('#distAmount').value||0;if(!confirm(`Distribuir ${money(a)} conforme sua regra?`))return;try{await API.distribute(a);await loadAccount();bank();}catch(ex){alert(ex.message)}};
  $('#newGoal').onclick=async()=>{const name=prompt('Nome da meta:','Meta de reserva');if(!name)return;const target=+(prompt('Valor objetivo (R$):','2000')||0);const current=+(prompt('Valor atual (R$):','0')||0);try{await API.createGoal({name,target,current});await loadAccount();bank();}catch(ex){alert(ex.message)}};
  $$('.goal-row').forEach(el=>el.onclick=async()=>{const g=state.goals.find(x=>x.id===+el.dataset.goal);if(!g)return;const current=prompt(`Atualize o valor atual de “${g.name}” ou digite EXCLUIR para remover:`,String(g.current));if(current===null)return;try{if(current.toUpperCase?.()==='EXCLUIR'){if(confirm('Excluir esta meta?'))await API.deleteGoal(g.id);}else await API.updateGoal({id:g.id,current:+current||0});await loadAccount();bank();}catch(ex){alert(ex.message)}});
  $('#saveMov').onclick=async()=>{let a=+$('#movAmount').value||0;const kind=$('#movKind').value;if(kind==='Retirada'&&a>0)a=-a;try{await API.bankMovement({kind,amount:a,note:$('#movNote').value});await loadAccount();bank();}catch(ex){alert(ex.message)}};
}
function fiscal(){
  const years=[...new Set(state.operations.map(o=>new Date((+o.created_at||0)*1000).getFullYear()))].filter(Boolean).sort((a,b)=>b-a);
  const nowYear=new Date().getFullYear(); if(!years.includes(nowYear))years.unshift(nowYear);
  const year=+(sessionStorage.getItem('eqp_fiscal_year')||years[0]||nowYear);
  const completed=state.operations.filter(o=>o.status==='Concluída'&&new Date((+o.created_at||0)*1000).getFullYear()===year);
  const volume=completed.reduce((a,o)=>a+(+o.volume||0),0);
  const net=completed.reduce((a,o)=>a+(+o.result||0),0);
  const costs=completed.reduce((a,o)=>a+(+o.meta?.costs||0),0);
  const gross=completed.reduce((a,o)=>a+(+(o.meta?.gross_result??o.result)||0),0);
  const roi=volume?net/volume*100:0;
  const official2025=28467.20;
  const stored=localStorage.getItem(`eqp_tax_threshold_${year}`);
  const threshold=stored!==null?+stored:(year===2025?official2025:0);
  const taxable=Math.max(0,Math.max(0,net)-Math.max(0,threshold));
  const tax=taxable*0.15;
  const conservative=Math.max(0,net)*0.15;
  const months=Array.from({length:12},(_,i)=>{
    const ops=completed.filter(o=>new Date((+o.created_at||0)*1000).getMonth()===i);
    const v=ops.reduce((a,o)=>a+(+o.volume||0),0), r=ops.reduce((a,o)=>a+(+o.result||0),0), c=ops.reduce((a,o)=>a+(+o.meta?.costs||0),0);
    return {i,v,r,c,n:ops.length};
  });
  const monthNames=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  shell(`<section class="row between" style="margin-bottom:16px"><div><div class="eyebrow">FECHAMENTO E PLANEJAMENTO</div><h2 style="margin:4px 0">Ano-calendário ${year}</h2></div><select class="input" id="fiscalYear" style="max-width:140px">${years.map(y=>`<option ${y===year?'selected':''}>${y}</option>`).join('')}</select></section>
  <section class="stats"><div class="card stat"><small>Volume bruto</small><strong>${money(volume)}</strong></div><div class="card stat"><small>Resultado bruto</small><strong>${money(gross)}</strong></div><div class="card stat"><small>Custos</small><strong>${money(costs)}</strong></div><div class="card stat"><small>Resultado líquido</small><strong class="${net>=0?'good':'bad'}">${money(net)}</strong></div></section>
  <section class="stats" style="margin-top:12px"><div class="card stat"><small>ROI líquido</small><strong>${pct(roi)}</strong></div><div class="card stat"><small>Operações concluídas</small><strong>${completed.length}</strong></div><div class="card stat"><small>Reserva fiscal atual</small><strong>${money(state.bank.tax)}</strong></div><div class="card stat"><small>Reserva conservadora (15%)</small><strong>${money(conservative)}</strong></div></section>
  <div class="grid2" style="margin-top:16px"><section class="card section"><h3>🧾 Estimativa fiscal</h3><div class="notice"><b>Brasil • apostas de quota fixa:</b> a regra oficial vigente prevê apuração anual do prêmio líquido e alíquota de 15% apenas sobre a parcela que exceder o limite anual de isenção. A EQP mantém este cálculo separado da reserva financeira.</div>
  <div class="field"><label>Limite anual de isenção usado no cálculo</label><input class="input" id="taxThreshold" type="number" step="0.01" value="${threshold||''}" placeholder="Informe o limite oficial do ano"></div>
  <div class="list-item"><span>Prêmio líquido positivo registrado</span><b>${money(Math.max(0,net))}</b></div><div class="list-item"><span>(–) Limite informado</span><b>${money(threshold)}</b></div><div class="list-item"><span>Base estimada</span><b>${money(taxable)}</b></div><div class="list-item"><span>Alíquota de referência</span><b>15%</b></div><div class="list-item"><span>IR estimado</span><b>${money(tax)}</b></div>
  <button class="btn" id="saveThreshold">Salvar limite deste ano</button><p class="muted">Para 2025, a referência oficial publicada foi R$ 28.467,20. Para outros anos, a EQP não inventa o limite: use o valor oficial aplicável ao ano.</p></section>
  <section class="card section"><h3>📊 Fechamento mensal</h3>${months.map((m,i)=>`<div class="list-item"><span>${monthNames[i]} <small class="muted">• ${m.n} ops</small></span><span><b>${money(m.r)}</b><small class="muted" style="display:block;text-align:right">vol. ${money(m.v)}</small></span></div>`).join('')}</section></div>
  <div class="grid2"><section class="card section"><h3>📄 Memória de cálculo</h3><div class="list-item"><span>Volume</span><b>${money(volume)}</b></div><div class="list-item"><span>Resultado bruto</span><b>${money(gross)}</b></div><div class="list-item"><span>Custos registrados</span><b>− ${money(costs)}</b></div><div class="list-item"><span>Resultado líquido</span><b>${money(net)}</b></div><div class="list-item"><span>ROI líquido / volume</span><b>${pct(roi)}</b></div><div class="list-item"><span>Reserva fiscal separada</span><b>${money(state.bank.tax)}</b></div></section>
  <section class="card section"><h3>⬇ Relatórios</h3><p class="muted">Exporte as operações concluídas do ano para conferência em planilha. O relatório é organizacional e não substitui ComprovaBet nem o cálculo oficial da Receita.</p><button class="btn primary full" id="exportFiscalCsv">Exportar CSV de ${year}</button><button class="btn full" id="printFiscal" style="margin-top:10px">Imprimir / salvar relatório em PDF</button></section></div>`, 'Fiscal');
  $('#fiscalYear').onchange=e=>{sessionStorage.setItem('eqp_fiscal_year',e.target.value);fiscal();};
  $('#saveThreshold').onclick=()=>{const v=Math.max(0,+$('#taxThreshold').value||0);localStorage.setItem(`eqp_tax_threshold_${year}`,String(v));fiscal();};
  $('#exportFiscalCsv').onclick=()=>{const esc=x=>`"${String(x??'').replaceAll('"','""')}"`;const rows=[['Data','Tipo','Operação','Volume','Resultado bruto','Custos','Resultado líquido','Status','Operador']];completed.forEach(o=>rows.push([new Date(o.created_at*1000).toLocaleDateString('pt-BR'),o.type,o.name,o.volume,o.meta?.gross_result??o.result,o.meta?.costs||0,o.result,o.status,o.meta?.operator||'']));const csv='\ufeff'+rows.map(r=>r.map(esc).join(';')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=`eqp-centro-fiscal-${year}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
  $('#printFiscal').onclick=()=>window.print();
}
function ai(){
  const pro=hasAccess('EQP_PRO');
  shell(`<div class="grid2"><section class="card section"><div class="row between"><h3>🤖 EQP IA</h3><span class="pill ${pro?'green':'amber'}">${pro?'PRO ATIVO':'PRO'}</span></div><p class="muted">Assistente conectado aos registros da sua conta. Consultas financeiras são calculadas pelo backend da EQP.</p><div class="quick"><button class="btn" id="aiMonth">Resumir meus números</button><button class="btn" id="aiPending">Minhas pendências</button><button class="btn" id="aiGoals">Como estão minhas metas?</button></div><div id="aiAnswer" class="result-box" style="margin-top:16px"><span class="muted">Escolha uma consulta acima.</span></div></section>
<section class="card section"><div class="row between"><h3>📸 Analisar promoção</h3><span class="pill ${pro?'green':'amber'}">${pro?'Liberado':'EQP PRO'}</span></div>${pro?'<p class="muted">Envie um print ou cole os termos. A IA extrai os campos e você revisa antes de cadastrar.</p><div class="field"><label>Print</label><input class="input" id="aiPromoImg" type="file" accept="image/*"></div><div class="field"><label>Termos / texto (opcional)</label><textarea class="input" id="aiPromoTerms" rows="5" placeholder="Cole o regulamento aqui..."></textarea></div><button class="btn primary full" id="aiAnalyze">Analisar</button><div id="aiPromoResult" style="margin-top:14px"></div>':'<div class="pro-lock"><div class="lock-icon">💎</div><h3>Análise inteligente é Pro</h3><p class="muted">Leitura de print, interpretação dos requisitos e preenchimento assistido ficam disponíveis com EQP Centro Pro.</p><button class="btn primary full" id="goPro">Conhecer EQP Pro</button></div>'}</section></div>`, 'EQP IA');
  let summary=null; async function getSummary(){if(!summary)summary=(await API.aiSummary()).summary;return summary;}
  $('#aiMonth').onclick=async()=>{try{const x=await getSummary();$('#aiAnswer').innerHTML=`<h3>Resumo registrado</h3><div class="list-item"><span>Operações concluídas</span><b>${x.completed}</b></div><div class="list-item"><span>Volume bruto</span><b>${money(x.volume)}</b></div><div class="list-item"><span>Resultado líquido</span><b class="${x.net_result>=0?'good':'bad'}">${money(x.net_result)}</b></div><div class="list-item"><span>ROI</span><b>${pct(x.roi)}</b></div>`;}catch(e){alert(e.message)}};
  $('#aiPending').onclick=async()=>{try{const x=await getSummary();$('#aiAnswer').innerHTML=`<h3>Pendências</h3><div class="list-item"><span>Promoções ativas</span><b>${x.promos_active}</b></div><div class="list-item"><span>Freebets disponíveis</span><b>${x.freebets_available}</b></div><div class="list-item"><span>Operações não concluídas</span><b>${Math.max(0,x.operations-x.completed)}</b></div>`;}catch(e){alert(e.message)}};
  $('#aiGoals').onclick=async()=>{try{const x=await getSummary();$('#aiAnswer').innerHTML='<h3>Metas</h3>'+((x.goals||[]).map(g=>{const pc=g.target?Math.min(100,g.current/g.target*100):0;return `<div style="margin:12px 0"><div class="row between"><span>${g.name}</span><b>${pct(pc)}</b></div><div class="bar"><span style="width:${pc}%"></span></div><small class="muted">${money(g.current)} / ${money(g.target)}</small></div>`}).join('')||'<span class="muted">Nenhuma meta cadastrada.</span>');}catch(e){alert(e.message)}};
  if($('#goPro')) $('#goPro').onclick=()=>{state.page='settings';renderPage();};
  if($('#aiAnalyze')) $('#aiAnalyze').onclick=async()=>{const box=$('#aiPromoResult'),file=$('#aiPromoImg').files[0],terms=$('#aiPromoTerms').value.trim();if(!file&&!terms)return box.innerHTML='<div class="notice bad">Envie um print ou cole os termos.</div>';box.innerHTML='<div class="notice">Analisando…</div>';let image_data=null;if(file){image_data=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)});}try{const r=await API.analyzePromoAI({image_data,terms});const a=r.analysis||{};box.innerHTML=`<div class="result-box"><h3>Revisar análise</h3><div class="list-item"><span>Título</span><b>${a.title||'—'}</b></div><div class="list-item"><span>Operador</span><b>${a.operator||'—'}</b></div><div class="list-item"><span>Tipo</span><b>${a.type||'—'}</b></div><div class="list-item"><span>Benefício</span><b>${a.benefit!=null?money(a.benefit):'—'}</b></div><div class="list-item"><span>Qtd. requisitos</span><b>${a.count??'—'}</b></div><div class="list-item"><span>Valor mínimo</span><b>${a.min_value!=null?money(a.min_value):'—'}</b></div><div class="list-item"><span>Odd mínima</span><b>${a.min_odd??'—'}</b></div><div class="list-item"><span>Prazo</span><b>${a.deadline||'—'}</b></div><p class="muted">${a.notes||''}</p>${(a.warnings||[]).map(w=>`<div class="notice">⚠ ${w}</div>`).join('')}<button class="btn primary full" id="aiUsePromo">Revisar e cadastrar em Promos</button></div>`;$('#aiUsePromo').onclick=()=>{sessionStorage.setItem('eqp_ai_promo',JSON.stringify(a));state.page='promos';renderPage();};}catch(e){box.innerHTML=`<div class="notice bad">${e.message}</div>`;}};
}

const academyLessons=[
  ['fundamentos','Fundamentos','Odds, stake, retorno, risco e organização básica.'],
  ['surebet','Surebets','Como usar a calculadora e registrar operações corretamente.'],
  ['promos','Promoções & Freebets','Cadastro, checklist, benefícios e conversão de freebets.'],
  ['banca','Gestão de Banca','Banca ativa, reserva, bolso, distribuição e movimentações.'],
  ['metricas','ROI & Métricas','Volume bruto, custos, resultado líquido e leitura do ROI.'],
  ['fiscal','Organização Fiscal','Reserva fiscal, memória de cálculo e relatórios.'],
  ['eqpia','EQP IA','Como usar o assistente e revisar análises antes de salvar.']
];
function academy(){
  const done=new Set((state.academy||[]).filter(x=>x.completed).map(x=>x.lesson_id));
  const pc=academyLessons.length?done.size/academyLessons.length*100:0;
  shell(`<section class="card section"><div class="row between"><div><h3>🎓 EQP Academy</h3><p class="muted">Aprenda a usar a plataforma e interpretar seus próprios registros.</p></div><span class="pill blue">${done.size}/${academyLessons.length} concluídas</span></div><div class="bar"><span style="width:${pc}%"></span></div><p class="muted">Progresso geral: ${pct(pc)}</p></section><div class="grid2" style="margin-top:16px">${academyLessons.map(([id,n,d],i)=>`<section class="card section"><div class="row between"><span class="pill ${done.has(id)?'green':'blue'}">${done.has(id)?'✓ Concluída':`Aula ${i+1}`}</span><span class="muted">${done.has(id)?'100%':'Pendente'}</span></div><h3>${n}</h3><p class="muted">${d}</p><button class="btn ${done.has(id)?'':'primary'} academy-toggle" data-lesson="${id}" data-done="${done.has(id)?1:0}">${done.has(id)?'Marcar como pendente':'Marcar como concluída'}</button></section>`).join('')}</div>`, 'Academy');
  $$('.academy-toggle').forEach(b=>b.onclick=async()=>{try{await API.academyProgress(b.dataset.lesson,b.dataset.done!=='1');await loadAccount();academy();}catch(e){alert(e.message)}});
}
function settings(){
  const pro=hasAccess('EQP_PRO'), vip=hasAccess('TIME_VIP');
  shell(`<div class="grid2"><section class="card section"><h3>👤 Minha conta</h3><div class="field"><label>Nome completo</label><input class="input" id="profileName" value="${state.user?.name||''}"></div><div class="field"><label>E-mail</label><input class="input" value="${state.user?.email||''}" disabled></div><button class="btn primary" id="saveProfile">Salvar perfil</button><h3 style="margin-top:26px">🔐 Alterar senha</h3><div class="field"><label>Senha atual</label><input class="input" id="currentPass" type="password"></div><div class="field"><label>Nova senha</label><input class="input" id="newPassword" type="password" minlength="8"></div><div class="field"><label>Confirmar nova senha</label><input class="input" id="newPassword2" type="password" minlength="8"></div><button class="btn" id="changePassword">Alterar senha</button><div id="passStatus" style="margin-top:10px"></div><h3 style="margin-top:26px">🔐 Privacidade</h3><label class="list-item"><span>Iniciar com valores ocultos</span><input id="hideValuesSetting" type="checkbox" ${state.settings?.hide_values?'checked':''}></label><div class="field"><label>Moeda</label><select class="input" id="currencySetting"><option value="BRL" ${state.settings?.currency==='BRL'?'selected':''}>BRL — Real</option><option value="USD" ${state.settings?.currency==='USD'?'selected':''}>USD — Dólar</option></select></div><button class="btn" id="savePrefs">Salvar preferências</button></section>
  <section class="card section"><div class="row between"><h3>💎 Acessos</h3><span class="pill ${pro?'green':'blue'}">${pro?'PRO':'BASIC'}</span></div><div class="list-item"><div><b>EQP Centro Basic</b><div class="muted">Acesso base da plataforma.</div></div><span class="pill green">Ativo</span></div><div class="list-item"><div><b>EQP Centro Pro</b><div class="muted">IA de promoções e recursos avançados.</div></div><span class="pill ${pro?'green':'amber'}">${pro?'Ativo':'Não ativo'}</span></div><div class="list-item"><div><b>Time do Centro VIP</b><div class="muted">Produto separado do software.</div></div><span class="pill ${vip?'green':'blue'}">${vip?'Ativo':'Não ativo'}</span></div><button class="btn primary full" id="proInfo" style="margin-top:14px">${pro?'Gerenciar acesso Pro':'Assinar EQP Pro'}</button><div class="notice" style="margin-top:12px">O gateway de pagamento será conectado no próximo bloco. O acesso Pro só é liberado após pagamento confirmado.</div><h3 style="margin-top:26px">📦 Dados e segurança</h3><p class="muted">Seus registros ficam separados por conta no PostgreSQL. Nunca cadastre senhas de casas de aposta dentro da plataforma.</p><div class="list-item"><span>Código de indicação</span><b>${state.referral_code||'—'}</b></div><h3 style="margin-top:26px">ℹ️ Sobre</h3><div class="list-item"><span>Produto</span><b>EQP Centro</b></div><div class="list-item"><span>Build interno</span><b>15</b></div><div class="list-item"><span>Status</span><b class="good">Fundação de produção</b></div><button class="btn danger full" id="logout" style="margin-top:18px">Sair da conta</button></section></div>`, 'Configurações');
  $('#saveProfile').onclick=async()=>{try{await API.updateProfile($('#profileName').value);await loadAccount();settings();}catch(e){alert(e.message)}};
  $('#savePrefs').onclick=async()=>{try{await API.updatePreferences({currency:$('#currencySetting').value,hide_values:$('#hideValuesSetting').checked});await loadAccount();settings();}catch(e){alert(e.message)}};
  $('#changePassword').onclick=async()=>{const st=$('#passStatus');st.className='';st.textContent='';try{if($('#newPassword').value!==$('#newPassword2').value)throw new Error('As novas senhas não coincidem.');await API.changePassword($('#currentPass').value,$('#newPassword').value);st.className='good';st.textContent='Senha alterada com sucesso.';$('#currentPass').value='';$('#newPassword').value='';$('#newPassword2').value='';}catch(e){st.className='bad';st.textContent=e.message}};
  $('#proInfo').onclick=()=>alert('O checkout do EQP Pro será conectado no próximo bloco.');
  $('#logout').onclick=async()=>{await API.logout();state.user=null;landing();};
}

function renderPage(){({dashboard,surebet,promos,operations,bank,houses,fiscal,ai,academy,settings}[state.page]||dashboard)();}
function renderApp(){state.page='dashboard';renderPage();}
(async()=>{ $('#app').innerHTML='<main class="splash"><img src="logo.png" alt="EQP Centro"><div class="loader"></div><p>Carregando sua conta…</p></main>'; if(API.token && await loadAccount()) renderApp(); else { if(API.token){API.token='';localStorage.removeItem('eqp_token');} landing(); } })();
