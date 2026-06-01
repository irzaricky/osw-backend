import jwt from 'jsonwebtoken';
import axios from 'axios';

const token = jwt.sign(
  { id: 1, email: 'test@test.com', role: 'Supervisor Sales', role_id: 2 },
  'jwt_secret_cihuy',
  { expiresIn: '1h' }
);

async function runVerification() {
  console.log('--- STARTING EMPIRICAL VERIFICATION FOR SPR ANALYTICS ENDPOINT ---');
  const client = axios.create({
    baseURL: 'http://localhost:3000',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  try {
    console.log('Testing GET /sales/analytics/spr...');
    const sprRes = await client.get('/sales/analytics/spr');
    console.log('SPR Status:', sprRes.status);
    console.log('SPR Data structure check:', sprRes.data.status ? 'PASS' : 'FAIL');
    if (!sprRes.data.status) {
      throw new Error('SPR API returned failure: ' + JSON.stringify(sprRes.data));
    }
    console.log('SPR KPI Data:', JSON.stringify(sprRes.data.data.kpis, null, 2));
    console.log('Status Breakdown:', JSON.stringify(sprRes.data.data.status_breakdown, null, 2));
    console.log('Pipeline Funnel:', JSON.stringify(sprRes.data.data.pipeline_funnel, null, 2));

    console.log('\n--- VERIFICATION COMPLETED SUCCESSFULLY: 100% PASS ---');
    process.exit(0);
  } catch (error) {
    console.error('Verification failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

runVerification();
