import jwt from 'jsonwebtoken';
import axios from 'axios';

const token = jwt.sign(
  { id: 1, email: 'test@test.com', role: 'Supervisor Sales', role_id: 2 },
  'jwt_secret_cihuy',
  { expiresIn: '1h' }
);

async function runVerification() {
  console.log('--- STARTING EMPIRICAL VERIFICATION FOR SDO ANALYTICS ENDPOINT ---');
  const client = axios.create({
    baseURL: 'http://localhost:3000',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  try {
    console.log('Testing GET /sales/analytics/sdo...');
    const sdoRes = await client.get('/sales/analytics/sdo');
    console.log('SDO Status:', sdoRes.status);
    console.log('SDO Data structure check:', sdoRes.data.status ? 'PASS' : 'FAIL');
    if (!sdoRes.data.status) {
      throw new Error('SDO API returned failure: ' + JSON.stringify(sdoRes.data));
    }
    console.log('SDO KPI Data:', JSON.stringify(sdoRes.data.data.kpis, null, 2));
    console.log('SDO Status Counts:', JSON.stringify(sdoRes.data.data.sdo_status_counts, null, 2));
    console.log('Forecast vs SPO Correlation:', JSON.stringify(sdoRes.data.data.forecast_vs_spo, null, 2));
    console.log('Top Customers:', JSON.stringify(sdoRes.data.data.top_customers, null, 2));

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
