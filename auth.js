// Acquisition attribution: preserve first-touch campaign data until registration.
(function captureAttribution(){
  try {
    const params = new URLSearchParams(location.search);
    const existing = JSON.parse(localStorage.getItem('eqp_attribution') || 'null');
    if (!existing) {
      const a = {
        utm_source: params.get('utm_source') || '',
        utm_medium: params.get('utm_medium') || '',
        utm_campaign: params.get('utm_campaign') || '',
        utm_content: params.get('utm_content') || '',
        utm_term: params.get('utm_term') || '',
        ref: params.get('ref') || '',
        source: params.get('source') || '',
        landing_page: location.pathname + location.search,
        referrer: document.referrer || ''
      };
      localStorage.setItem('eqp_attribution', JSON.stringify(a));
    }
  } catch {}
})();

const API = {
  token: localStorage.getItem('eqp_token') || '',
  headers(extra={}) { return { 'Content-Type':'application/json', ...(this.token?{'Authorization':`Bearer ${this.token}`} : {}), ...extra }; },
  async request(path, options={}) {
    const r = await fetch(path,{...options,headers:this.headers(options.headers||{})});
    const body = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(body.error || 'Erro na requisição');
    return body;
  },
  async login(email,password){ const x=await this.request('/api/login',{method:'POST',body:JSON.stringify({email,password})}); this.token=x.token; localStorage.setItem('eqp_token',x.token); return x.user; },
  async register(name,email,password,terms_accepted,age_confirmed){ let attribution={}; try{ attribution=JSON.parse(localStorage.getItem('eqp_attribution')||'{}')||{} }catch{} const x=await this.request('/api/register',{method:'POST',body:JSON.stringify({name,email,password,terms_accepted,age_confirmed,attribution})}); this.token=x.token; localStorage.setItem('eqp_token',x.token); return x.user; },
  async logout(){ try{await this.request('/api/logout',{method:'POST',body:'{}'})}catch{} this.token=''; localStorage.removeItem('eqp_token'); },
  async bootstrap(){ return this.request('/api/bootstrap'); },

  async forgotPassword(email){ return this.request('/api/password/forgot',{method:'POST',body:JSON.stringify({email})}); },
  async resetPassword(token,password){ return this.request('/api/password/reset',{method:'POST',body:JSON.stringify({token,password})}); },
  async changePassword(current_password,new_password){ return this.request('/api/password/change',{method:'POST',body:JSON.stringify({current_password,new_password})}); },
  async readNotification(id){ return this.request('/api/notifications/read',{method:'POST',body:JSON.stringify({id})}); },
  async readAllNotifications(){ return this.request('/api/notifications/read-all',{method:'POST',body:'{}'}); },
  async createOperation(payload){ return this.request('/api/operations',{method:'POST',body:JSON.stringify(payload)}); },
  async updateOperation(payload){ return this.request('/api/operations/update',{method:'POST',body:JSON.stringify(payload)}); },
  async deleteOperation(id){ return this.request('/api/operations/delete',{method:'POST',body:JSON.stringify({id})}); },
  async createPromo(payload){ return this.request('/api/promos',{method:'POST',body:JSON.stringify(payload)}); },
  async updatePromo(payload){ return this.request('/api/promos/update',{method:'POST',body:JSON.stringify(payload)}); },
  async createFreebet(payload){ return this.request('/api/freebets',{method:'POST',body:JSON.stringify(payload)}); },
  async updateFreebet(payload){ return this.request('/api/freebets/update',{method:'POST',body:JSON.stringify(payload)}); },
  async createBookmaker(payload){ return this.request('/api/bookmakers',{method:'POST',body:JSON.stringify(payload)}); },
  async updateBookmaker(payload){ return this.request('/api/bookmakers/update',{method:'POST',body:JSON.stringify(payload)}); },
  async deleteBookmaker(id){ return this.request('/api/bookmakers/delete',{method:'POST',body:JSON.stringify({id})}); },
  async updateBank(payload){ return this.request('/api/bank',{method:'POST',body:JSON.stringify(payload)}); },
  async createGoal(payload){ return this.request('/api/goals',{method:'POST',body:JSON.stringify(payload)}); },
  async updateGoal(payload){ return this.request('/api/goals/update',{method:'POST',body:JSON.stringify(payload)}); },
  async deleteGoal(id){ return this.request('/api/goals/delete',{method:'POST',body:JSON.stringify({id})}); },
  async updateSettings(distribution){ return this.request('/api/settings',{method:'POST',body:JSON.stringify({distribution})}); },
  async bankMovement(payload){ return this.request('/api/bank/movement',{method:'POST',body:JSON.stringify(payload)}); },
  async distribute(amount){ return this.request('/api/bank/distribute',{method:'POST',body:JSON.stringify({amount})}); },
  async aiSummary(){ return this.request('/api/ai/summary',{method:'POST',body:'{}'}); },
  async analyzePromoAI(payload){ return this.request('/api/ai/promo-analyze',{method:'POST',body:JSON.stringify(payload)}); },
  async academyProgress(lesson_id,completed){ return this.request('/api/academy/progress',{method:'POST',body:JSON.stringify({lesson_id,completed})}); },
  async updateProfile(name){ return this.request('/api/profile',{method:'POST',body:JSON.stringify({name})}); },
  async updatePreferences(payload){ return this.request('/api/preferences',{method:'POST',body:JSON.stringify(payload)}); },
  async updateSubscription(plan){ return this.request('/api/subscription',{method:'POST',body:JSON.stringify({plan})}); }
};
