import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Metrics } from './metrics.js';

test('metrics: counts by status class, latency buckets and quantiles', () => {
  const m = new Metrics();
  for (let i = 0; i < 98; i++) m.record('GET', '/api/v1/audit/logs', 200, 40);
  m.record('GET', '/api/v1/audit/logs', 503, 900);
  m.record('GET', '/api/v1/audit/logs', 200, 3000);
  assert.equal(m.quantile('GET', '/api/v1/audit/logs', 0.5), 50);
  assert.equal(m.quantile('GET', '/api/v1/audit/logs', 0.99), 1000);
  assert.equal(m.quantile('GET', '/nothing', 0.99), null);
  const text = m.render();
  assert.match(text, /synextax_http_requests_total\{method="GET",route="\/api\/v1\/audit\/logs",status="2xx"\} 99/);
  assert.match(text, /synextax_http_requests_total\{method="GET",route="\/api\/v1\/audit\/logs",status="5xx"\} 1/);
  assert.match(text, /synextax_http_request_duration_ms_bucket\{method="GET",route="\/api\/v1\/audit\/logs",le="\+Inf"\} 100/);
});
