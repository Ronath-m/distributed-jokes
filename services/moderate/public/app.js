(function () {
  const POLL_MS = 1000;
  const noJokeEl = document.getElementById('noJoke');
  const formEl = document.getElementById('form');
  const setupEl = document.getElementById('setup');
  const punchlineEl = document.getElementById('punchline');
  const typeSelect = document.getElementById('typeSelect');
  const typeNew = document.getElementById('typeNew');
  const submitBtn = document.getElementById('submitBtn');
  const nextBtn = document.getElementById('nextBtn');
  const messageEl = document.getElementById('message');

  function apiBase() {
    return window.location.origin;
  }

  function showMessage(msg, isError) {
    messageEl.textContent = msg || '';
    messageEl.classList.toggle('error', !!isError);
  }

  async function loadTypes() {
    try {
      const res = await fetch(apiBase() + '/moderate/types');
      if (!res.ok) return;
      const types = await res.json();
      const opts = (Array.isArray(types) ? types : []).map(function (t) {
        return '<option value="' + t + '">' + t + '</option>';
      }).join('');
      typeSelect.innerHTML = opts;
    } catch (e) {
      typeSelect.innerHTML = '';
    }
  }

  function getType() {
    const v = (typeNew.value || '').trim();
    if (v) return v;
    return typeSelect.value || '';
  }

  async function fetchNext() {
    try {
      const res = await fetch(apiBase() + '/moderate');
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
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
    const setup = (setupEl.value || '').trim();
    const punchline = (punchlineEl.value || '').trim();
    const type = getType();
    if (!setup || !punchline || !type) {
      showMessage('Fill setup, punchline and type.', true);
      return;
    }
    showMessage('');
    try {
      const res = await fetch(apiBase() + '/moderated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setup, punchline, type })
      });
      if (!res.ok) throw new Error((await res.json().catch(function () { return {}; })).error || res.status);
      showMessage('Submitted. Loading next…');
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

  loadTypes();
  fetchNext().then(function () { startPolling(); });
})();
