// ============================================================
// CONFIGURAÇÃO — SUBSTITUIR PELOS TEUS VALORES DO SUPABASE
// ============================================================
const SUPABASE_URL = 'sb_publishable_i0k_wtjMBVp6vFDRVtzAbw_kIbiKO-x';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqeHZiaHZjY216YWRjbWJ6cGZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NDU5ODksImV4cCI6MjEwODIyMTk4OX0.EHWtN8P46fAJEhjz7oBkulPHErtjA3hgSTYARbZzhZY';
const OCR_FUNCTION_NAME = 'ocr-proxy';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// ELEMENTOS DOM
// ============================================================
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const preview = document.getElementById('preview');
const startBtn = document.getElementById('startCamera');
const captureBtn = document.getElementById('captureBtn');
const stopBtn = document.getElementById('stopCamera');
const ocrStatus = document.getElementById('ocrStatus');
const form = document.getElementById('contactForm');
const clearFormBtn = document.getElementById('clearForm');
const searchInput = document.getElementById('searchInput');
const contactList = document.getElementById('contactList');

let stream = null;

// ============================================================
// CÂMARA
// ============================================================
startBtn.addEventListener('click', async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 } },
      audio: false
    });
    video.srcObject = stream;
    video.style.display = 'block';
    startBtn.style.display = 'none';
    captureBtn.style.display = 'inline-block';
    stopBtn.style.display = 'inline-block';
    ocrStatus.textContent = '';
  } catch (err) {
    alert('Não foi possível ativar a câmara: ' + err.message + '\n\nCertifica-te que estás em HTTPS.');
  }
});

stopBtn.addEventListener('click', () => {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  video.style.display = 'none';
  startBtn.style.display = 'inline-block';
  captureBtn.style.display = 'none';
  stopBtn.style.display = 'none';
});

captureBtn.addEventListener('click', async () => {
  if (!video.videoWidth) {
    alert('A câmara ainda não está pronta.');
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  preview.src = URL.createObjectURL(blob);
  preview.style.display = 'block';

  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  video.style.display = 'none';
  startBtn.style.display = 'inline-block';
  startBtn.textContent = '📷 Reativar Câmara';
  captureBtn.style.display = 'none';
  stopBtn.style.display = 'none';

  ocrStatus.textContent = '⏳ A reconhecer texto do cartão...';
  try {
    const formData = new FormData();
    formData.append('image', blob, 'card.jpg');

    const { data, error } = await supabaseClient.functions.invoke(OCR_FUNCTION_NAME, {
      body: formData
    });

    if (error) throw new Error(error.message || 'Erro na função OCR');

    const result = data || {};
    form.name.value = result.name || '';
    form.company.value = result.company || '';
    form.phone.value = result.phone || '';
    form.email.value = result.email || '';

    ocrStatus.textContent = '✅ Reconhecimento concluído. Confirma e corrige os dados antes de guardar.';
  } catch (err) {
    console.error(err);
    ocrStatus.textContent = '⚠️ Não foi possível reconhecer automaticamente. Preenche manualmente.';
  }
});

// ============================================================
// CRUD CONTACTOS (Supabase)
// ============================================================
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const contact = {
    name: (fd.get('name') || '').trim(),
    company: (fd.get('company') || '').trim(),
    phone: (fd.get('phone') || '').trim(),
    email: (fd.get('email') || '').trim()
  };
  const id = fd.get('id');

  try {
    if (id) {
      const { error } = await supabaseClient.from('contacts').update(contact).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.from('contacts').insert([contact]);
      if (error) throw error;
    }
    form.reset();
    form.id.value = '';
    preview.src = '';
    preview.style.display = 'none';
    ocrStatus.textContent = '';
    await loadContacts();
  } catch (err) {
    alert('Erro ao guardar: ' + err.message);
  }
});

clearFormBtn.addEventListener('click', () => {
  form.reset();
  form.id.value = '';
  preview.src = '';
  preview.style.display = 'none';
  ocrStatus.textContent = '';
});

async function loadContacts(query = '') {
  let req = supabaseClient.from('contacts').select('*').order('created_at', { ascending: false });

  if (query.trim()) {
    const q = query.trim();
    req = req.or(`name.ilike.%${q}%,company.ilike.%${q}%`);
  }

  const { data, error } = await req;
  if (error) {
    console.error(error);
    contactList.innerHTML = '<li class="empty">Erro ao carregar contactos.</li>';
    return;
  }
  renderList(data || []);
}

function renderList(contacts) {
  if (!contacts.length) {
    contactList.innerHTML = '<li class="empty">Nenhum contacto encontrado.</li>';
    return;
  }

  contactList.innerHTML = contacts.map(c => `
    <li>
      <div class="name">${escapeHtml(c.name || '(sem nome)')}</div>
      <div class="meta">${c.company ? '🏢 ' + escapeHtml(c.company) : ''}</div>
      <div class="meta">
        ${c.phone ? '📞 ' + escapeHtml(c.phone) : ''}
        ${c.email ? ' • ✉️ ' + escapeHtml(c.email) : ''}
      </div>
      <div class="actions">
        <button class="btn secondary" data-action="edit" data-id="${c.id}">✏️ Editar</button>
        <button class="btn danger" data-action="delete" data-id="${c.id}">🗑 Eliminar</button>
      </div>
    </li>
  `).join('');

  contactList.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (btn.dataset.action === 'edit') editContact(id, contacts);
      if (btn.dataset.action === 'delete') deleteContact(id);
    });
  });
}

function editContact(id, contacts) {
  const c = contacts.find(x => String(x.id) === String(id));
  if (!c) return;
  form.id.value = c.id;
  form.name.value = c.name || '';
  form.company.value = c.company || '';
  form.phone.value = c.phone || '';
  form.email.value = c.email || '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteContact(id) {
  if (!confirm('Eliminar este contacto?')) return;
  const { error } = await supabaseClient.from('contacts').delete().eq('id', id);
  if (error) {
    alert('Erro ao eliminar: ' + error.message);
    return;
  }
  await loadContacts(searchInput.value);
}

let searchTimer = null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadContacts(searchInput.value), 250);
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

loadContacts();