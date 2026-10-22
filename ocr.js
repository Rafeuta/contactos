const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function processImage(imagePath) {
  const form = new FormData();
  form.append('document', fs.createReadStream(imagePath));

  const response = await axios.post(
    'https://api.mindee.net/v1/products/mindee/business_card/v1/predict',
    form,
    { headers: { ...form.getHeaders(), Authorization: 'Token A_TUA_CHAVE_MINDEE' } }
  );

  const pred = response.data.document.inference.prediction;
  return {
    name: pred.first_name?.value + ' ' + (pred.last_name?.value || ''),
    company: pred.company_name?.value || '',
    phone: pred.phone_number?.value || '',
    email: pred.email?.value || '',
    rawText: null
  };
}