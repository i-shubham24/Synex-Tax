import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'node:crypto';

/**
 * Request metrics in the Prometheus text format, for whichever monitoring service the firm
 * chooses (Grafana Cloud, Datadog, New Relic, a self-hosted Prometheus): per route, the number of
 * requests by status class and a latency histogram, from which p50, p95 and p99 are computed.
 *
 * GET /metrics answers only with `Authorization: Bearer <METRICS_TOKEN>`; without METRICS_TOKEN
 * it does not exist. Each instance reports its own counts; on serverless, send the logs to a log
 * drain instead, where every request's route, status and duration are already recorded.
 */

const BUCKETS_MS = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

interface RouteStats {
  byClass: Record<string, number>;
  buckets: number[];
  sumMs: number;
  count: number;
}

export class Metrics {
  readonly started = Date.now();
  private routes = new Map<string, RouteStats>();

  record(method: string, route: string, status: number, ms: number) {
    const key = `${method} ${route}`;
    let r = this.routes.get(key);
    if (!r) {
      r = { byClass: {}, buckets: BUCKETS_MS.map(() => 0), sumMs: 0, count: 0 };
      this.routes.set(key, r);
    }
    const cls = `${Math.floor(status / 100)}xx`;
    r.byClass[cls] = (r.byClass[cls] ?? 0) + 1;
    BUCKETS_MS.forEach((b, i) => {
      if (ms <= b) r!.buckets[i] += 1;
    });
    r.sumMs += ms;
    r.count += 1;
  }

  /** The latency below which the given share of requests to a route finished (from the buckets). */
  quantile(method: string, route: string, q: number): number | null {
    const r = this.routes.get(`${method} ${route}`);
    if (!r || r.count === 0) return null;
    const target = q * r.count;
    const i = r.buckets.findIndex((n) => n >= target);
    return i === -1 ? Infinity : BUCKETS_MS[i];
  }

  render(): string {
    const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const out: string[] = [
      '# HELP synextax_http_requests_total Requests by route and status class.',
      '# TYPE synextax_http_requests_total counter',
    ];
    for (const [key, r] of this.routes) {
      const [method, route] = key.split(' ');
      for (const [cls, n] of Object.entries(r.byClass)) out.push(`synextax_http_requests_total{method="${method}",route="${esc(route)}",status="${cls}"} ${n}`);
    }
    out.push('# HELP synextax_http_request_duration_ms Request duration.', '# TYPE synextax_http_request_duration_ms histogram');
    for (const [key, r] of this.routes) {
      const [method, route] = key.split(' ');
      const l = `method="${method}",route="${esc(route)}"`;
      BUCKETS_MS.forEach((b, i) => out.push(`synextax_http_request_duration_ms_bucket{${l},le="${b}"} ${r.buckets[i]}`));
      out.push(`synextax_http_request_duration_ms_bucket{${l},le="+Inf"} ${r.count}`);
      out.push(`synextax_http_request_duration_ms_sum{${l}} ${Math.round(r.sumMs)}`);
      out.push(`synextax_http_request_duration_ms_count{${l}} ${r.count}`);
    }
    out.push('# HELP synextax_process_uptime_seconds Seconds since this instance started.', '# TYPE synextax_process_uptime_seconds gauge');
    out.push(`synextax_process_uptime_seconds ${Math.floor((Date.now() - this.started) / 1000)}`);
    return out.join('\n') + '\n';
  }
}

export function registerMetrics(app: FastifyInstance, metrics = new Metrics()) {
  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    // The route pattern, never the raw URL: ids and upload-link tokens stay out of the labels.
    const route = request.routeOptions?.url ?? 'unmatched';
    if (route === '/metrics') return;
    metrics.record(request.method, route, reply.statusCode, reply.elapsedTime);
  });

  const token = process.env.METRICS_TOKEN;
  if (token && token.length >= 24) {
    const expected = Buffer.from(`Bearer ${token}`);
    app.get('/metrics', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
      const got = Buffer.from(String(request.headers.authorization ?? ''));
      if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return reply.status(404).send({ error: 'Not found' });
      reply.header('Content-Type', 'text/plain; version=0.0.4');
      return reply.send(metrics.render());
    });
  }
  return metrics;
}
