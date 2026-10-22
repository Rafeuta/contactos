const express = require('express');
const multer = require('multer');
const path = require('path');
const { processImage } = require('./ocr');
const { initDB, addContact, getContacts, searchContacts, updateContact, deleteContact } = require('./db');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.static('public'));

// Receber imagem, executar OCR
app.post('/api/ocr', upload.single('image'), async (req, res) => {
  try {
    const result = await processImage(req.file.path);
    res.json(result); // { name, company, phone, email, rawText }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CRUD de contactos
app.post('/api/contacts', (req, res) => {
  const contact = addContact(req.body);
  res.json(contact);
});

app.get('/api/contacts', (req, res) => {
  const { q } = req.query;
  res.json(q ? searchContacts(q) : getContacts());
});

app.put('/api/contacts/:id', (req, res) => {
  res.json(updateContact(req.params.id, req.body));
});

app.delete('/api/contacts/:id', (req, res) => {
  deleteContact(req.params.id);
  res.json({ ok: true });
});

initDB().then(() => {
  app.listen(3000, () => console.log('Servidor em http://localhost:3000'));
});
