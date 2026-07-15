export function loginTemplate() {
  return `
    <section class="auth-shell">
      <div class="auth-panel">
        <div class="auth-card">
          <div class="brand">
            <img src="/sponsorgo.png" alt="SponsorGo" class="brand-logo-img" />
          </div>
          <span class="eyebrow">Central de operações</span>
          <h1>Bem-vindo de volta</h1>
          <p>Acesse sua frota, conteúdos e resultados em um só lugar.</p>
          <form id="login-form">
            <div class="form-group" style="margin-bottom: 16px;">
              <label>E-mail</label>
              <input class="input" name="email" type="email" placeholder="admin@empresa.com" required />
            </div>
            <div class="form-group" style="margin-bottom: 20px;">
              <label>Senha</label>
              <input class="input" name="password" type="password" placeholder="••••••••" required />
            </div>
            <button class="button primary auth-submit" type="submit">Entrar na central <span>→</span></button>
            <div id="login-notice" class="notice error" style="display:none;margin-top:16px;"></div>
          </form>
        </div>
      </div>
      <div class="auth-hero">
        <div class="auth-hero-content">
          <span class="hero-kicker">Mídia em movimento</span>
          <h2>Sua operação visível.<br/>Seu conteúdo no controle.</h2>
          <p>Conecte tablets, publique campanhas e acompanhe a execução com clareza.</p>
          <div class="hero-proof">
            <div><strong>Tempo real</strong><span>Saúde da frota</span></div>
            <div><strong>Offline first</strong><span>Exibição resiliente</span></div>
            <div><strong>Mensurável</strong><span>Provas por campanha</span></div>
          </div>
        </div>
      </div>
    </section>
  `;
}

export function appTemplate() {
  return `
    <div class="app-shell">
      <aside class="app-sidebar">
        <div class="app-brand">
          <img src="/sponsorgo.png" alt="SponsorGo" class="app-brand-logo" />
          <div class="app-brand-text">
            <strong>Central</strong>
            <span>Operação SponsorGo</span>
          </div>
        </div>
        <nav id="nav" class="app-nav" aria-label="Navegação principal"></nav>
        <div class="app-sidebar-footer">
          <span class="system-dot"></span>
          <div>
            <strong>Sistema online</strong>
            <span>Monitoramento ativo</span>
          </div>
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
    <div class="topbar page-hero">
      <div class="topbar-info">
        <span class="eyebrow">SponsorGo Central</span>
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

