import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.API_URL || 'https://staging-api.example.com/api';
const JWT = __ENV.TEST_JWT;

export default function () {
  const headers = {
    headers: {
      Authorization: `Bearer ${JWT}`,
      'Content-Type': 'application/json',
    },
  };

  const body = JSON.stringify({
    items: [
      {
        medicine_id: __ENV.TEST_MEDICINE_ID,
        batch_id: __ENV.TEST_BATCH_ID,
        quantity: 5,
        mrp: 10,
        discount_pct: 0,
        gst_rate: 0,
      },
    ],
    payment_mode: 'cash',
    payment_status: 'paid',
    paid_amount: 50,
  });

  const res = http.post(`${BASE_URL}/sales`, body, headers);
  check(res, {
    '201 or 400': (r) => r.status === 201 || r.status === 400,
  });

  sleep(0.3);
}
