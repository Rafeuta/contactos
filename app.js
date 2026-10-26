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
const uploadInput = document.getElementById('uploadInput');
const ocrStatus = document.getElementById('ocrStatus');
const form = document.getElementById('contactForm');
const clearFormBtn = document.getElementById('clearForm');
const searchInput = document.getElementById('searchInput');
const filterInput = document.getElementById('filterInput');
const contactList = document.getElementById('contactList');
const rawTextContainer = document.getElementById('rawTextContainer');
const rawTextOutput = document.getElementById('rawTextOutput');

let stream = null;

// ============================================================
// CÂMARA E OCR
// ============================================================
startBtn.addEventListener('click', async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 } },
      audio: false
    });
    video.srcObject = stream;
    video.classList.add('active');
    startBtn.style.display = 'none';
    captureBtn.style.display = 'inline-block';
    stopBtn.style.display = 'inline-block';
    ocrStatus.textContent = '';
    preview.classList.remove('active');
    rawTextContainer.style.display = 'none';
  } catch (err) {
    alert('Não foi possível ativar a câmara: ' + err.message + '\n\nCertifica-te que estás em HTTPS.');
  }
});

stopBtn.addEventListener('click', () => {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  video.classList.remove('active');
  startBtn.style.display = 'inline-block';
  captureBtn.style.display = 'none';
  stopBtn.style.display = 'none';
});

async function processImage(dataUrl) {
  preview.src = dataUrl;
  preview.classList.add('active');
  video.classList.remove('active');
  
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  startBtn.style.display = 'inline-block';
  startBtn.textContent = '📷 Reativar Câmara';
  captureBtn.style.display = 'none';
  stopBtn.style.display = 'none';

  ocrStatus.textContent = '⏳ A processar imagem e a reconhecer texto...';

  try {
    // 1. PRÉ-PROCESSAMENTO DA IMAGEM (Filtro Preto e Branco para remover sombras)
    const img = new Image();
    img.src = dataUrl;
    await new Promise((resolve) => { img.onload = resolve; });

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = img.width;
    tempCanvas.height = img.height;
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;

    // Passar por cada píxel e transformar em preto ou branco puro
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Calcula a luminosidade (média das cores)
      const brightness = (r + g + b) / 3;
      
      // Se for escuro, fica preto (0). Se for claro, fica branco (255).
      // O valor 140 pode ser ajustado (maior = mais letras pretas)
      const color = brightness < 140 ? 0 : 255;
      
      data[i] = color;     // Red
      data[i + 1] = color; // Green
      data[i + 2] = color; // Blue
    }
    ctx.putImageData(imageData, 0, 0);

    const processedDataUrl = tempCanvas.toDataURL('image/jpeg', 0.95);

    // 2. TESSERACT
    const worker = await Tesseract.createWorker('por+eng');
    
    // PSM 4: Assume uma coluna de texto de tamanho variável
    await worker.setParameters({ tessedit_pageseg_mode: '4' });

    const { data: { text } } = await worker.recognize(processedDataUrl);
    await worker.terminate();

    rawTextOutput.value = text;
    rawTextContainer.style.display = 'block';

    // 3. EXTRAÇÃO
    const cleanText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ');

    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
    let foundEmail = cleanText.match(emailRegex)?.[0] || '';
    
    const phoneRegex = /(\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{3,4}/g;
    let foundPhone = cleanText.match(phoneRegex)?.[0] || '';

    let foundName = '';
    let foundCompany = '';

    const nameMatch = cleanText.match(/(?:name|nome)["'\s:]+([A-Z][a-zA-Z\s]+)/i);
    if (nameMatch && nameMatch[1]) foundName = nameMatch[1].trim();

    const companyMatch = cleanText.match(/(?:company|empresa|title|ceo)["'\s:]+([A-Z][a-zA-Z\s]+)/i);
    if (companyMatch && companyMatch[1]) foundCompany = companyMatch[1].trim();

    if (foundName) form.name.value = foundName;
    if (foundCompany) form.company.value = foundCompany;
    if (foundPhone) form.phone.value = foundPhone.trim();
    if (foundEmail) form.email.value = foundEmail.trim();

    if (foundEmail || foundPhone || foundName) {
      ocrStatus.textContent = '✅ Dados encontrados! Confirma e corrige se necessário.';
    } else {
      ocrStatus.textContent = '⚠️ Leu o texto, mas não encontrou os padrões. Copia da caixa acima.';
    }

  } catch (err) {
    console.error(err);
    ocrStatus.textContent = '⚠️ Ocorreu um erro no reconhecimento. Preenche manualmente.';
  }
}

// Evento: Tirar foto com a câmara
captureBtn.addEventListener('click', () => {
  if (!video.videoWidth) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
  processImage(dataUrl);
});

// Evento: Carregar imagem da galeria
uploadInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    processImage(event.target.result);
  };
  reader.readAsDataURL(file);
  uploadInput.value = ''; 
});

// ============================================================
// CRUD CONTACTOS (Supabase)
// ============================================================
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  
  const contact = {
    type: fd.get('type') || 'Potencial Cliente',
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
    preview.classList.remove('active');
    ocrStatus.textContent = '';
    rawTextContainer.style.display = 'none';
    await loadContacts();
  } catch (err) {
    alert('Erro ao guardar: ' + err.message);
  }
});

clearFormBtn.addEventListener('click', () => {
  form.reset();
  form.id.value = '';
  preview.classList.remove('active');
  ocrStatus.textContent = '';
  rawTextContainer.style.display = 'none';
});

async function loadContacts(query = '', typeFilter = '') {
  let req = supabaseClient.from('contacts').select('*').order('created_at', { ascending: false });

  if (query.trim()) {
    const q = query.trim();
    req = req.or(`name.ilike.%${q}%,company.ilike.%${q}%`);
  }

  if (typeFilter) {
    req = req.eq('type', typeFilter);
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

  contactList.innerHTML = contacts.map(c => {
    let badgeClass = 'potencial';
    if (c.type === 'Cliente') badgeClass = 'cliente';
    if (c.type === 'Fornecedor') badgeClass = 'fornecedor';

    return `
    <li>
      <span class="badge ${badgeClass}">${escapeHtml(c.type || 'Potencial Cliente')}</span>
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
  `}).join('');

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
  form.type.value = c.type || 'Potencial Cliente'; 
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
  await loadContacts(searchInput.value, filterInput.value);
}

let searchTimer = null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadContacts(searchInput.value, filterInput.value), 250);
});

filterInput.addEventListener('change', () => {
  loadContacts(searchInput.value, filterInput.value);
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

loadContacts();
