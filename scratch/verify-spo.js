import jwt from 'jsonwebtoken';
import axios from 'axios';

const token = jwt.sign(
  { id: 1, email: 'test@test.com', role: 'Supervisor Sales', role_id: 2 },
  'jwt_secret_cihuy',
  { expiresIn: '1h' }
);

async function runVerification() {
  console.log('--- STARTING EMPIRICAL VERIFICATION FOR SPO ANALYTICS ENDPOINT ---');
  const client = axios.create({
    baseURL: 'http://localhost:3000',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  try {
    console.log('Testing GET /sales/analytics/spo...');
    const spoRes = await client.get('/sales/analytics/spo');
    console.log('SPO Status:', spoRes.status);
    console.log('SPO Data structure check:', spoRes.data.status ? 'PASS' : 'FAIL');
    if (!spoRes.data.status) {
      throw new Error('SPO API returned failure: ' + JSON.stringify(spoRes.data));
    }
    console.log('SPO KPI Data:', JSON.stringify(spoRes.data.data.kpis, null, 2));
    console.log('Status Breakdown:', JSON.stringify(spoRes.data.data.status_breakdown, null, 2));
    console.log('Top Customers count:', spoRes.data.data.top_customers.length);
    console.log('Top Customers sample:', JSON.stringify(spoRes.data.data.top_customers[0], null, 2));
    console.log('Monthly Trends count:', spoRes.data.data.monthly_trends.length);
    console.log('Monthly Trends sample:', JSON.stringify(spoRes.data.data.monthly_trends[0], null, 2));

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
