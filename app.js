// ============================================================
// CONFIGURAÇÃO DO SUPABASE (Coloca os teus dados aqui!)
// ============================================================
const SUPABASE_URL = 'https://eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqeHZiaHZjY216YWRjbWJ6cGZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NDU5ODksImV4cCI6MjEwODIyMTk4OX0.EHWtN8P46fAJEhjz7oBkulPHErtjA3hgSTYARbZzhZY.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_i0k_wtjMBVp6vFDRVtzAbw_kIbiKO-x'; 

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

// ============================================================
// TIRAR FOTOGRAFIA E USAR TESSERACT.JS (OCR LOCAL)
// ============================================================
captureBtn.addEventListener('click', async () => {
  if (!video.videoWidth) {
    alert('A câmara ainda não está pronta.');
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  
  // Desenha a imagem normal
  ctx.drawImage(video, 0, 0);

  // --- TRUQUE: CORTAR A IMAGEM PARA O TESSERACT SE FOCAR ---
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = canvas.width * 0.8; 
  cropCanvas.height = canvas.height * 0.8; 
  const cropCtx = cropCanvas.getContext('2d');
  
  cropCtx.drawImage(
    canvas, 
    canvas.width * 0.1, canvas.height * 0.1, 
    cropCanvas.width, cropCanvas.height,      
    0, 0,                                     
    cropCanvas.width, cropCanvas.height       
  );

  const dataUrl = cropCanvas.toDataURL('image/jpeg', 0.95); 
  preview.src = dataUrl;
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

  ocrStatus.textContent = '⏳ A reconhecer texto no dispositivo...';

  try {
    const worker = await Tesseract.createWorker('eng'); 
    
    await worker.setParameters({
      tessedit_pageseg_mode: '6', // Bloco uniforme de texto
    });

    const { data: { text } } = await worker.recognize(dataUrl);
    await worker.terminate();

    // Limpar o texto lido
    const cleanText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').toLowerCase();

    // 1. REGEX DO EMAIL (Exige o @ e proíbe o www.)
    // Procura uma palavra, seguida de @, seguida de palavra e ponto
    const emailRegex = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
    
    // 2. REGEX DO TELEFONE (Procura o +351 seguido de 9 números)
    const phoneRegex = /(\+?\d{1,3}[\s-]?)?\d{3}[\s-]?\d{3}[\s-]?\d{3,4}/g;
    
    let foundEmail = cleanText.match(emailRegex)?.[0] || '';
    let foundPhone = cleanText.match(phoneRegex)?.[0] || '';

    // Se ele apanhou o www por engano, limpamos
    if (foundEmail.includes('www')) {
      foundEmail = foundEmail.replace(/www\S*/g, '');
    }

    // Preenche o formulário
    form.phone.value = foundPhone.trim();
    form.email.value = foundEmail.trim();

    // Tenta adivinhar o nome e a empresa do texto lido
    // Se encontrar "name": "Michael Teixeira", ele tenta apanhar o Michael Teixeira
    const nameMatch = cleanText.match(/name[":\s]+([a-z\s]+)/i);
    if (nameMatch && nameMatch[1]) {
      form.name.value = nameMatch[1].trim().replace(/\b\w/g, l => l.toUpperCase());
    }

    const companyMatch = cleanText.match(/(company|empresa|title)[":\s]+([a-z\s]+)/i);
    if (companyMatch && companyMatch[2]) {
      form.company.value = companyMatch[2].trim().replace(/\b\w/g, l => l.toUpperCase());
    }

    if (foundEmail || foundPhone) {
      ocrStatus.textContent = '✅ Contactos encontrados! Confirma os dados.';
    } else {
      ocrStatus.textContent = '⚠️ Leu o texto, mas não encontrou email/telefone. Preenche manualmente.';
    }

  } catch (err) {
    console.error(err);
    ocrStatus.textContent = '⚠️ Ocorreu um erro no reconhecimento. Preenche manualmente.';
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
    contactList.innerHTML = '<li class="empty">Erro ao carregar contactos. Verifica a ligação ao Supabase.</li>';
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
