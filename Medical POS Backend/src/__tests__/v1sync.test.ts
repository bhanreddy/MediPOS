import request from 'supertest';
import { createApp } from '../app';

describe('/api/v1/health', () => {
  const app = createApp();

  it('returns JSON with status and serverTime', async () => {
    const res = await request(app).get('/api/v1/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('serverTime');
    expect(res.body).toHaveProperty('dbLatency');
  });
});
