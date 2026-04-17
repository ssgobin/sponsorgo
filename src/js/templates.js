export function loginTemplate() {
  return `
    <section class="auth-shell">
      <div class="auth-panel">
        <div class="auth-card">
          <div class="brand">
            <img src="/src/assets/img/sponsorgo.png" alt="SponsorGo" class="brand-logo-img" />
          </div>
          <h1>Entrar</h1>
          <p>Faça login com sua conta administrativa.</p>
          <form id="login-form">
            <div class="form-group" style="margin-bottom: 16px;">
              <label>E-mail</label>
              <input class="input" name="email" type="email" placeholder="admin@empresa.com" required />
            </div>
            <div class="form-group" style="margin-bottom: 20px;">
              <label>Senha</label>
              <input class="input" name="password" type="password" placeholder="••••••••" required />
            </div>
            <button class="button primary" type="submit" style="width: 100%;">Entrar</button>
          </form>
        </div>
      </div>
      <div class="auth-hero">
        <div class="auth-hero-content">
          <h2>Central de Controle</h2>
          <p>Gerencie tablets, vídeos, playlists e monitore suas campanhas em tempo real.</p>
          <div class="features">
            <span>Firebase</span>
            <span>Firestore</span>
            <span>Appwrite</span>
          </div>
        </div>
      </div>
    </section>
  `;
}

export function appTemplate() {
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <img src="/src/assets/img/sponsorgo.png" alt="SponsorGo" class="brand-logo-sidebar" />
        </div>
        <nav id="nav" class="nav"></nav>
        <div class="sidebar-footer">
          <p>Ambiente</p>
          <strong>SponsorGo Central</strong>
        </div>
        <div class="sidebar-brand">
          <span class="brand-label">Desenvolvido por</span>
          <img src="/src/assets/img/logo_st.png" alt="SponsorTech" class="brand-logo" />
        </div>
      </aside>
      <main class="main">
        <div id="view"></div>
      </main>
    </div>
  `;
}

export function layoutView(title, subtitle, content, extraActions = '') {
  return `
    <div class="topbar">
      <div class="topbar-info">
        <h2>${title}</h2>
        <p>${subtitle}</p>
      </div>
      <div class="actions">
        ${extraActions}
      </div>
    </div>
    ${content}
  `;
}