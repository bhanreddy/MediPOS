import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '2m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    errors: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.API_URL || 'https://staging-api.example.com/api';
const JWT = __ENV.TEST_JWT;

export default function () {
  const headers = { headers: { Authorization: `Bearer ${JWT}` } };

  const searchRes = http.get(`${BASE_URL}/inventory/medicines/search?q=para`, headers);
  check(searchRes, {
    'search status 200': (r) => r.status === 200,
    'search < 200ms': (r) => r.timings.duration < 200,
  });
  errorRate.add(searchRes.status !== 200);

  sleep(0.5);

  const dashRes = http.get(`${BASE_URL}/reports/dashboard`, headers);
  check(dashRes, {
    'dashboard status 200': (r) => r.status === 200,
    'dashboard < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
