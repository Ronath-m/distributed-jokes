// Populate types on load and when clicking Get a joke (do NOT refresh on dropdown focus/click or selection resets)
const typeSelect = document.getElementById('type');
const getJokeBtn = document.getElementById('getJoke');
const setupEl = document.getElementById('setup');
const punchlineEl = document.getElementById('punchline');

function getBase() {
  return window.location.origin;
}

async function loadTypes() {
  try {
    const res = await fetch(getBase() + '/types');
    if (!res.ok) throw new Error(res.status);
    const types = await res.json();
    const currentVal = typeSelect.value;
    typeSelect.innerHTML = '<option value="any">Any</option>' +
      (Array.isArray(types) ? types : []).map(t => `<option value="${t}">${t}</option>`).join('');
    if (currentVal && [].slice.call(typeSelect.options).some(function(o) { return o.value === currentVal; })) {
      typeSelect.value = currentVal;
    }
  } catch (e) {
    typeSelect.innerHTML = '<option value="any">Any</option>';
  }
}

getJokeBtn.addEventListener('click', async () => {
  await loadTypes();
  const type = typeSelect.value || 'any';
  punchlineEl.textContent = '';
  punchlineEl.classList.remove('reveal');
  setupEl.textContent = 'Loading…';
  try {
    const url = getBase() + '/joke/' + encodeURIComponent(type);
    const res = await fetch(url);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = res.status === 429 ? 'Rate limit (5/min). Wait a moment.' :
        (body.message || body.error || 'Request failed: ' + res.status);
      throw new Error(msg);
    }
    const data = Array.isArray(body) ? body : (body.setup ? [body] : []);
    const joke = data[0];
    if (!joke || !joke.setup) {
      setupEl.textContent = "No jokes of this type. Try 'Any' or click Get a joke again to refresh types.";
      return;
    }
    setupEl.textContent = joke.setup;
    punchlineEl.textContent = joke.punchline;
    setTimeout(() => punchlineEl.classList.add('reveal'), 3000);
  } catch (e) {
    setupEl.textContent = e.message || 'Error loading joke.';
  }
});

// Initial load of types
loadTypes();
