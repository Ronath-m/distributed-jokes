(function () {
  var POLL_MS = 1000;
  var noJokeEl = document.getElementById('noJoke');
  var formEl = document.getElementById('form');
  var setupEl = document.getElementById('setup');
  var punchlineEl = document.getElementById('punchline');
  var typeSelect = document.getElementById('typeSelect');
  var typeNew = document.getElementById('typeNew');
  var submitBtn = document.getElementById('submitBtn');
  var nextBtn = document.getElementById('nextBtn');
  var messageEl = document.getElementById('message');

  function apiBase() {
    return window.location.origin;
  }

  function loginPath() {
    var p = (document.location.pathname || '/').replace(/\/$/, '') || '/';
    return p === '/' ? '/login' : p + '/login';
  }

  function ensureAuth(res) {
    if (res.status === 401) {
      var returnTo = document.location.pathname || '/';
      window.location.assign(apiBase() + loginPath() + '?returnTo=' + encodeURIComponent(returnTo));
      return false;
    }
    return true;
  }

  function showMessage(msg, isError) {
    messageEl.textContent = msg || '';
    messageEl.classList.toggle('error', !!isError);
  }

  async function loadTypes() {
    try {
      var res = await fetch(apiBase() + '/moderate/types');
      if (!ensureAuth(res) || !res.ok) return;
      var types = await res.json();
      var opts = (Array.isArray(types) ? types : []).map(function (t) {
        return '<option value="' + t + '">' + t + '</option>';
      }).join('');
      typeSelect.innerHTML = opts;
    } catch (e) {
      typeSelect.innerHTML = '';
    }
  }

  function getType() {
    var v = (typeNew.value || '').trim();
    if (v) return v;
    return typeSelect.value || '';
  }

  async function fetchNext() {
    try {
      var res = await fetch(apiBase() + '/moderate');
      if (!ensureAuth(res)) return null;
      if (!res.ok) throw new Error(res.status);
      var data = await res.json();
      if (data.noJoke) {
        noJokeEl.classList.remove('hidden');
        formEl.classList.add('hidden');
        return null;
      }
      noJokeEl.classList.add('hidden');
      formEl.classList.remove('hidden');
      setupEl.value = data.setup || '';
      punchlineEl.value = data.punchline || '';
      await loadTypes();
      typeSelect.value = data.type || '';
      typeNew.value = '';
      return data;
    } catch (e) {
      showMessage('Error loading: ' + (e.message || 'unknown'), true);
      return null;
    }
  }

  function startPolling() {
    setInterval(function () {
      if (!formEl.classList.contains('hidden')) return;
      fetchNext();
    }, POLL_MS);
  }

  submitBtn.addEventListener('click', async function () {
    var setup = (setupEl.value || '').trim();
    var punchline = (punchlineEl.value || '').trim();
    var type = getType();
    if (!setup || !punchline || !type) {
      showMessage('Fill setup, punchline and category.', true);
      return;
    }
    showMessage('');
    try {
      var res = await fetch(apiBase() + '/moderated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setup: setup, punchline: punchline, type: type })
      });
      if (!ensureAuth(res)) return;
      if (!res.ok) throw new Error((await res.json().catch(function () { return {}; })).error || res.status);
      showMessage('Published. Loading next…');
      formEl.classList.add('hidden');
      noJokeEl.classList.remove('hidden');
      setTimeout(fetchNext, 300);
    } catch (e) {
      showMessage(e.message || 'Submit failed', true);
    }
  });

  nextBtn.addEventListener('click', async function () {
    showMessage('Loading next…');
    formEl.classList.add('hidden');
    noJokeEl.classList.remove('hidden');
    await fetchNext();
  });

  var logoutEl = document.getElementById('logoutLink');
  if (logoutEl) {
    fetch(apiBase() + '/moderate/auth/status', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (d) {
        if (d && d.oidc) {
          var p = (document.location.pathname || '/').replace(/\/$/, '') || '/';
          logoutEl.href = apiBase() + (p === '/' ? '/logout' : p + '/logout');
          logoutEl.classList.remove('hidden');
        }
      });
  }

  loadTypes();
  fetchNext().then(function () { startPolling(); });
})();
