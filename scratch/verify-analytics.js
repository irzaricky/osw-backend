import jwt from 'jsonwebtoken';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const token = jwt.sign(
  { id: 1, email: 'test@test.com', role: 'Staff Sales Delivery', role_id: 1 },
  'jwt_secret_cihuy',
  { expiresIn: '1h' }
);

async function runVerification() {
  console.log('--- STARTING EMPIRICAL VERIFICATION FOR ANALYTICS ENDPOINTS ---');
  const client = axios.create({
    baseURL: 'http://localhost:3000',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  try {
    // 1. Verify GET /sales/analytics/summary
    console.log('Testing GET /sales/analytics/summary...');
    const summaryRes = await client.get('/sales/analytics/summary');
    console.log('Summary Status:', summaryRes.status);
    console.log('Summary Data structure check:', summaryRes.data.status ? 'PASS' : 'FAIL');
    if (!summaryRes.data.status) {
      throw new Error('Summary API returned failure: ' + JSON.stringify(summaryRes.data));
    }
    console.log('Summary KPI Data:', JSON.stringify(summaryRes.data.data.kpis, null, 2));

    // 2. Verify GET /sales/analytics/trends
    console.log('\nTesting GET /sales/analytics/trends...');
    const trendsRes = await client.get('/sales/analytics/trends');
    console.log('Trends Status:', trendsRes.status);
    console.log('Trends Data structure check:', trendsRes.data.status ? 'PASS' : 'FAIL');
    if (!trendsRes.data.status) {
      throw new Error('Trends API returned failure: ' + JSON.stringify(trendsRes.data));
    }
    console.log('Trends Items Count:', trendsRes.data.data.length);
    console.log('Trends sample:', JSON.stringify(trendsRes.data.data[trendsRes.data.data.length - 1], null, 2));

    // 3. Verify GET /sales/analytics/export
    console.log('\nTesting GET /sales/analytics/export...');
    const exportRes = await client.get('/sales/analytics/export', { responseType: 'arraybuffer' });
    console.log('Export Status:', exportRes.status);
    console.log('Export Content Type:', exportRes.headers['content-type']);
    const buffer = Buffer.from(exportRes.data);
    const signature = buffer.slice(0, 4).toString('hex');
    console.log('Excel signature check (should be 504b0304 - PK zip):', signature);
    if (signature !== '504b0304') {
      throw new Error('Invalid Excel file signature: ' + signature);
    }
    console.log('Excel export signature verified: PASS');

    // 4. Verify unauthorized request (expect 401)
    console.log('\nTesting Unauthorized Access (no token)...');
    try {
      await axios.get('http://localhost:3000/sales/analytics/summary');
      console.log('Unauthorized check: FAIL (request succeeded when it should fail)');
      process.exit(1);
    } catch (err) {
      console.log('Unauthorized check status:', err.response?.status);
      if (err.response?.status === 401) {
        console.log('Unauthorized check: PASS');
      } else {
        console.log('Unauthorized check: FAIL (unexpected status code)');
        process.exit(1);
      }
    }

    console.log('\n--- ALL VERIFICATIONS COMPLETED SUCCESSFULLY: 100% PASS ---');
    process.exit(0);
  } catch (error) {
    console.error('Verification failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data?.toString() || error.response.data);
    }
    process.exit(1);
  }
}

runVerification();
