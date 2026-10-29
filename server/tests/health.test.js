// server/tests/health.test.js
const request = require('supertest');
const app = require('../index');

describe('GET /api/health', () => {
  it('should return a 200 OK with the correct JSON structure', async () => {
    const res = await request(app)
      .get('/api/health');

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('service', 'W4Y API');
    expect(res.body).toHaveProperty('time');
  });
});
