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

const formType = document.getElementById('contactType');
const formName = document.getElementById('contactName');
const formCompany = document.getElementById('contactCompany');
const formPhone = document.getElementById('contactPhone');
const formEmail = document.getElementById('contactEmail');

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
    video.classList.add('active');
    startBtn.style.display = 'none';
    captureBtn.style.display = 'inline-block';
    stopBtn.style.display = 'inline-block';
    ocrStatus.textContent = '';
    preview.classList.remove('active');
    rawTextContainer.style.display = 'none';
  } catch (err) {
    alert('Não foi possível ativar a câmara: ' + err.message);
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

// ============================================================
// PROCESSAMENTO DA IMAGEM E OCR
// ============================================================
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

  ocrStatus.textContent = '⏳ A preparar imagem...';

  try {
    const img = new Image();
    img.src = dataUrl;
    await new Promise((resolve) => { img.onload = resolve; });

    const tempCanvas = document.createElement('canvas');
    
    // 1. CORTAR A IMAGEM AO CENTRO (Ignorar dedos e fundos)
    const cropX = img.width * 0.1; // Corta 10% de cada lado
    const cropY = img.height * 0.15; // Corta 15% de cima e baixo
    const newWidth = img.width - (cropX * 2);
    const newHeight = img.height - (cropY * 2);
    
    tempCanvas.width = newWidth;
    tempCanvas.height = newHeight;
    
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(img, cropX, cropY, newWidth, newHeight, 0, 0, newWidth, newHeight);

    // 2. FILTRO PRETO E BRANCO RIGOROSO
    const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Cálculo de luminosidade
      const brightness = (r + g + b) / 3;
      
      // O limite 150 garante que apenas o texto muito escuro fica preto
      const color = brightness < 150 ? 0 : 255;
      
      data[i] = color;     
      data[i + 1] = color; 
      data[i + 2] = color; 
    }
    ctx.putImageData(imageData, 0, 0);

    const processedDataUrl = tempCanvas.toDataURL('image/jpeg', 0.95);

    ocrStatus.textContent = '⏳ A ler o cartão...';

    // 3. TESSERACT
    const worker = await Tesseract.createWorker('por+eng');
    await worker.setParameters({ 
      // PSM 6 foca num bloco único de texto
      tessedit_pageseg_mode: '6', 
      // Limita os caracteres lidos (impede lixo e símbolos estranhos)
      tessedit_char_whitelist: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@.:+- ' 
    });

    const { data: { text } } = await worker.recognize(processedDataUrl);
    await worker.terminate();

    rawTextOutput.value = text;
    rawTextContainer.style.display = 'block';

    // 4. EXTRAÇÃO DOS DADOS
    const cleanText = text.replace(/\n/g, ' ').replace(/\s+/g, ' ');

    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
    let foundEmail = cleanText.match(emailRegex)?.[0] || '';
    
    const phoneRegex = /(\+?\d{1,3}[\s-]?)?\d{3}[\s-]?\d{3}[\s-]?\d{3,4}/g;
    let foundPhone = cleanText.match(phoneRegex)?.[0] || '';

    let foundName = '';
    let foundCompany = '';

    const nameMatch = cleanText.match(/(?:name|nome)["'\s:]+([A-Z][a-zA-Z\s]+)/i);
    if (nameMatch && nameMatch[1]) foundName = nameMatch[1].trim();

    const companyMatch = cleanText.match(/(?:company|empresa|title|ceo)["'\s:]+([A-Z][a-zA-Z\s]+)/i);
    if (companyMatch && companyMatch[1]) foundCompany = companyMatch[1].trim();

    if (foundName) formName.value = foundName;
    if (foundCompany) formCompany.value = foundCompany;
    if (foundPhone) formPhone.value = foundPhone.trim();
    if (foundEmail) formEmail.value = foundEmail.trim();

    if (foundEmail || foundPhone || foundName) {
      ocrStatus.textContent = '✅ Dados encontrados! Confirma e corrige se necessário.';
    } else {
      ocrStatus.textContent = '⚠️ Leu o texto, mas não encontrou os padrões. Copia da caixa acima.';
    }

  } catch (err) {
    console.error(err);
    ocrStatus.textContent = '⚠️ Ocorreu um erro no reconhecimento.';
  }
}

captureBtn.addEventListener('click', () => {
  if (!video.videoWidth) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
  processImage(dataUrl);
});

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
// CRUD CONTACTOS
// ============================================================
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const contact = {
    type: formType.value || 'Potencial Cliente',
    name: formName.value.trim(),
    company: formCompany.value.trim(),
    phone: formPhone.value.trim(),
    email: formEmail.value.trim()
  };
  const id = document.querySelector('input[name="id"]').value;

  try {
    if (id) {
      const { error } = await supabaseClient.from('contacts').update(contact).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.from('contacts').insert([contact]);
      if (error) throw error;
    }
    form.reset();
    document.querySelector('input[name="id"]').value = '';
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
  document.querySelector('input[name="id"]').value = '';
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
        <button class="btn secondary" data-action="edit" data-id="${c.id}" aria-label="Editar contacto ${escapeHtml(c.name)}">✏️ Editar</button>
        <button class="btn danger" data-action="delete" data-id="${c.id}" aria-label="Eliminar contacto ${escapeHtml(c.name)}">🗑 Eliminar</button>
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
  
  document.querySelector('input[name="id"]').value = c.id;
  formType.value = c.type || 'Potencial Cliente'; 
  formName.value = c.name || '';
  formCompany.value = c.company || '';
  formPhone.value = c.phone || '';
  formEmail.value = c.email || '';
  
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
