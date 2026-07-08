/* ── Heartability shared nav: gear menu, login popup, music player ──
   Renders only the gear icon + dropdown (left side of the nav bar) into
   config.mount, plus a login/signup popup (dynamic mode) appended to
   document.body. Never creates a Supabase client and never subscribes to
   auth changes itself — the host page keeps its own session-check /
   onAuthStateChange logic and calls HeartabilityNav.setAuthState(...) from
   inside it. Load assets/css/nav.css alongside this file. */

window.HeartabilityNav = (function () {
  let cfg = null;
  let musicPlaying = false;

  function $(id) { return document.getElementById(id); }

  function gearItemsHtml() {
    const label = cfg.profileLabel || 'account settings';
    if (cfg.authMode === 'dynamic') {
      return `
        <button class="gear-item" id="hn-gear-auth" onclick="HeartabilityNav._loginClick()">login</button>
        <button class="gear-item" id="hn-gear-profile" style="display:none" onclick="HeartabilityNav._profileClick()">${label}</button>
        <button class="gear-item" id="hn-gear-logout" style="display:none" onclick="HeartabilityNav._logoutClick()">sign out</button>`;
    }
    return `
      <button class="gear-item" id="hn-gear-profile" onclick="HeartabilityNav._profileClick()">${label}</button>
      <button class="gear-item" id="hn-gear-logout" onclick="HeartabilityNav._logoutClick()">sign out</button>`;
  }

  function musicHtml() {
    if (!cfg.music || !cfg.music.src) return '';
    return `
      <div class="gear-music">
        <button class="music-btn" onclick="HeartabilityNav._seekBack()" title="back 10s"><img src="${cfg.assetsBase}/elements/go back.png" alt="back"></button>
        <button class="music-btn" onclick="HeartabilityNav._toggleMusic()"><img src="${cfg.assetsBase}/elements/play.png" id="hn-pp-icon" alt="play"></button>
        <button class="music-btn" onclick="HeartabilityNav._seekFwd()" title="forward 10s"><img src="${cfg.assetsBase}/elements/go forward.png" alt="forward"></button>
      </div>
      <audio id="hn-bg-music" loop><source src="${cfg.music.src}" type="audio/mpeg"></audio>`;
  }

  function loginPopupHtml() {
    return `
      <div class="login-overlay" id="hn-login-overlay">
        <div class="login-popup">
          <div class="login-popup-titlebar">
            <span id="hn-login-popup-title">welcome</span>
            <span class="popup-close" onclick="HeartabilityNav._closeLoginPopup()">&#x2715;</span>
          </div>
          <div class="login-popup-tabs">
            <button class="popup-tab active" onclick="HeartabilityNav._switchTab('login', this)">log in</button>
            <button class="popup-tab" onclick="HeartabilityNav._switchTab('signup', this)">sign up</button>
          </div>
          <div class="login-popup-body">
            <form class="popup-form active" id="hn-form-login">
              <div class="popup-field">
                <div class="popup-label">email</div>
                <input class="popup-input" type="email" id="hn-login-email" placeholder="your@email.com" required autocomplete="email">
              </div>
              <div class="popup-field">
                <div class="popup-label">password</div>
                <input class="popup-input" type="password" id="hn-login-password" placeholder="••••••••" required>
              </div>
              <div class="popup-msg" id="hn-login-msg"></div>
              <button type="submit" class="popup-btn" id="hn-login-btn">enter</button>
            </form>
            <form class="popup-form" id="hn-form-signup">
              <div class="popup-field">
                <div class="popup-label">username</div>
                <input class="popup-input" type="text" id="hn-signup-username" placeholder="choose a name" required maxlength="40" autocomplete="off">
              </div>
              <div class="popup-field">
                <div class="popup-label">email</div>
                <input class="popup-input" type="email" id="hn-signup-email" placeholder="your@email.com" required autocomplete="email">
              </div>
              <div class="popup-field">
                <div class="popup-label">password</div>
                <input class="popup-input" type="password" id="hn-signup-password" placeholder="at least 6 characters" required minlength="6">
              </div>
              <div class="popup-msg" id="hn-signup-msg"></div>
              <button type="submit" class="popup-btn" id="hn-signup-btn">create account</button>
            </form>
          </div>
        </div>
      </div>`;
  }

  function outsideClick(e) {
    const wrap = $('hn-gear-wrap');
    const dd = $('hn-gear-dropdown');
    if (wrap && dd && !wrap.contains(e.target)) dd.classList.remove('open');
  }

  function render() {
    const mount = document.querySelector(cfg.mount);
    mount.innerHTML = `
      <div class="gear-wrap" id="hn-gear-wrap">
        <div class="gear-btn" id="hn-gear-btn" onclick="HeartabilityNav._toggleGear()">
          <img src="${cfg.assetsBase}/elements/gear icon.png" alt="menu">
        </div>
        <div class="gear-dropdown" id="hn-gear-dropdown">
          ${gearItemsHtml()}
          ${musicHtml()}
        </div>
      </div>`;
    document.addEventListener('click', outsideClick);

    if (cfg.authMode === 'dynamic') {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = loginPopupHtml();
      document.body.appendChild(wrapper.firstElementChild);
      $('hn-login-overlay').addEventListener('click', e => {
        if (e.target === $('hn-login-overlay')) closeLoginPopup();
      });
      $('hn-form-login').addEventListener('submit', handleLogin);
      $('hn-form-signup').addEventListener('submit', handleSignup);
    }
  }

  function toggleGear() { $('hn-gear-dropdown').classList.toggle('open'); }

  function openLoginPopup() {
    $('hn-gear-dropdown').classList.remove('open');
    $('hn-login-popup-title').textContent = 'welcome';
    $('hn-login-overlay').classList.add('open');
  }
  function closeLoginPopup() {
    $('hn-login-overlay').classList.remove('open');
    clearMsgs();
  }
  function switchTab(tab, btn) {
    document.querySelectorAll('#hn-login-overlay .popup-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#hn-login-overlay .popup-form').forEach(f => f.classList.remove('active'));
    btn.classList.add('active');
    $('hn-form-' + tab).classList.add('active');
    clearMsgs();
  }
  function clearMsgs() {
    document.querySelectorAll('#hn-login-overlay .popup-msg').forEach(m => { m.className = 'popup-msg'; m.textContent = ''; });
  }
  function showMsg(id, text, type) {
    const el = $(id); el.textContent = text; el.className = 'popup-msg ' + type;
  }

  async function resolveUsername(user) {
    try {
      const { data: profile } = await cfg.sb.from('user-profiles').select('username').eq('id', user.id).single();
      return profile?.username || user.email.split('@')[0];
    } catch (e) { return user.email.split('@')[0]; }
  }

  async function handleLogin(e) {
    e.preventDefault();
    const btn = $('hn-login-btn');
    btn.disabled = true; btn.textContent = 'entering...';
    const { data, error } = await cfg.sb.auth.signInWithPassword({
      email: $('hn-login-email').value.trim(),
      password: $('hn-login-password').value,
    });
    if (error) {
      showMsg('hn-login-msg', error.message, 'error');
      btn.disabled = false; btn.textContent = 'enter';
      return;
    }
    const username = await resolveUsername(data.user);
    showMsg('hn-login-msg', `welcome back, ${username}`, 'success');
    setTimeout(closeLoginPopup, 900);
    btn.disabled = false; btn.textContent = 'enter';
  }

  async function handleSignup(e) {
    e.preventDefault();
    const btn = $('hn-signup-btn');
    btn.disabled = true; btn.textContent = 'creating...';
    const username = $('hn-signup-username').value.trim();
    const email = $('hn-signup-email').value.trim();
    const password = $('hn-signup-password').value;
    const { data, error } = await cfg.sb.auth.signUp({ email, password });
    if (error) {
      showMsg('hn-signup-msg', error.message, 'error');
      btn.disabled = false; btn.textContent = 'create account';
      return;
    }
    if (data.user) {
      await cfg.sb.from('user-profiles').insert({ id: data.user.id, username });
      showMsg('hn-signup-msg', `welcome, ${username}`, 'success');
      setTimeout(closeLoginPopup, 900);
    }
    btn.disabled = false; btn.textContent = 'create account';
  }

  function profileClick() {
    $('hn-gear-dropdown').classList.remove('open');
    window.location.href = cfg.profileHref;
  }

  function logoutClick() {
    $('hn-gear-dropdown').classList.remove('open');
    cfg.sb.auth.signOut().then(() => {
      setAuthState({ loggedIn: false });
      if (cfg.onSignOut) cfg.onSignOut();
    });
  }

  function toggleMusic() {
    const audio = $('hn-bg-music');
    const icon = $('hn-pp-icon');
    if (musicPlaying) { audio.pause(); icon.src = cfg.assetsBase + '/elements/play.png'; }
    else { audio.play().catch(() => {}); icon.src = cfg.assetsBase + '/elements/pause.png'; }
    musicPlaying = !musicPlaying;
  }
  function seekBack() { const a = $('hn-bg-music'); a.currentTime = Math.max(0, a.currentTime - 10); }
  function seekFwd()  { const a = $('hn-bg-music'); a.currentTime = Math.min(a.duration || 0, a.currentTime + 10); }

  function setAuthState(state) {
    if (!cfg || cfg.authMode !== 'dynamic') return; // protected mode always shows account-settings+sign-out
    const auth = $('hn-gear-auth');
    const prof = $('hn-gear-profile');
    const out  = $('hn-gear-logout');
    if (!auth || !prof || !out) return;
    if (state && state.loggedIn) {
      auth.style.display = 'none';
      prof.style.display = '';
      out.style.display  = '';
    } else {
      auth.style.display = '';
      prof.style.display = 'none';
      out.style.display  = 'none';
    }
  }

  function init(config) {
    cfg = Object.assign({ assetsBase: '../assets', authMode: 'dynamic' }, config);
    render();
  }

  // Lets a host page swap the Supabase client instance nav.js's login popup
  // submits against, if the page rebuilds/reassigns its own `sb` after init().
  function setClient(newSb) {
    if (cfg) cfg.sb = newSb;
  }

  return {
    init,
    setAuthState,
    setClient,
    _toggleGear: toggleGear,
    _loginClick: openLoginPopup,
    _closeLoginPopup: closeLoginPopup,
    _switchTab: switchTab,
    _profileClick: profileClick,
    _logoutClick: logoutClick,
    _toggleMusic: toggleMusic,
    _seekBack: seekBack,
    _seekFwd: seekFwd,
  };
})();
