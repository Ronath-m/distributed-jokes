const form = document.getElementById('form');
const setupEl = document.getElementById('setup');
const punchlineEl = document.getElementById('punchline');
const typeSelect = document.getElementById('typeSelect');
const typeNew = document.getElementById('typeNew');
const messageEl = document.getElementById('message');

function getBase() { return window.location.origin; }

async function loadTypes() {
  try {
    const res = await fetch(getBase() + '/submit/types');
    if (!res.ok) return;
    const types = await res.json();
    const options = Array.isArray(types) && types.length
      ? types.map(t => `<option value="${t}">${t}</option>`).join('')
      : '<option value="">— Add new type below —</option>';
    typeSelect.innerHTML = options;
  } catch (e) {
    typeSelect.innerHTML = '<option value="">— Add new type below —</option>';
  }
}

typeSelect.addEventListener('focus', loadTypes);
loadTypes();

function getType() {
  const newVal = typeNew.value.trim();
  if (newVal) return newVal;
  return typeSelect.value || '';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  messageEl.textContent = '';
  messageEl.classList.remove('error');
  const setup = setupEl.value.trim();
  const punchline = punchlineEl.value.trim();
  const type = getType();
  if (!setup || !punchline || !type) {
    messageEl.textContent = 'Please fill setup, punchline, and type (choose from dropdown or type in "Or enter new type").';
    messageEl.classList.add('error');
    return;
  }
  try {
    const res = await fetch(getBase() + '/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setup, punchline, type })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || res.statusText);
    }
    messageEl.textContent = 'Joke submitted.';
    form.reset();
    loadTypes();
  } catch (err) {
    messageEl.textContent = err.message || 'Submit failed.';
    messageEl.classList.add('error');
  }
});
