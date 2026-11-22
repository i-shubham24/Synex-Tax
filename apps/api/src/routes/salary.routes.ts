import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { maskPan, salaryRegister, type SalaryEmployee } from '@synextax/tax-engine';
import { db } from '../db/pool.js';
import { expectedVersion, versionTag, VERSION_MATCHES } from '../plugins/concurrency.js';

const money = z.number().min(0).max(1e11);
const EmployeeBody = z.object({
  tan: z.string().regex(/^[A-Z]{4}\d{5}[A-Z]$/),
  taxYear: z.number().int().min(2026).max(2100),
  pan: z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$|^PANNOTAVBL$/),
  name: z.string().trim().min(1).max(75),
  regime: z.enum(['NEW', 'OLD']).default('NEW'),
  ageBand: z.enum(['BELOW_60', 'SENIOR', 'SUPER_SENIOR']).default('BELOW_60'),
  metroCity: z.boolean().default(false),
  monthlyGross: money,
  monthlyBasicDa: money.default(0),
  monthlyHra: money.default(0),
  monthlyEmployerNps: money.default(0),
  annualPerquisites: money.default(0),
  professionalTax: z.number().min(0).max(2500).default(0),
  joinedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  previousEmployer: z.object({ salary: money.default(0), professionalTax: money.default(0), tds: money.default(0) }).optional(),
  form124: z.record(z.string(), z.unknown()).optional(),
});
const RegisterQuery = z.object({ tan: z.string().regex(/^[A-Z]{4}\d{5}[A-Z]$/), year: z.coerce.number().int().min(2026).max(2100) });

const istToday = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const iso = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);

/** Salary register: employees, tax for the year, deducted so far and monthly TDS, with Form 124 checks. */
export async function salaryRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  });
  const ctx = (req: FastifyRequest) => ({ firmId: req.user.firmId, userId: req.user.userId, actorKind: 'USER' as const, ip: req.ip, requestId: req.id, userAgent: req.headers['user-agent'] });

  fastify.get('/salary', async (request, reply) => {
    const q = RegisterQuery.safeParse(request.query);
    if (!q.success) return reply.status(400).send({ error: 'Pass ?tan= and ?year=' });
    const data = await db.withTenantTransaction(ctx(request), async (c) => {
      const t = (await c.query<{ id: string }>('SELECT id FROM public.tan_registrations WHERE tan = $1', [q.data.tan])).rows[0];
      if (!t) return null;
      const employees = (await c.query(`SELECT * FROM public.salary_employees WHERE tan_registration_id = $1 AND tax_year = $2 ORDER BY employee_name`, [t.id, q.data.year])).rows;
      const deducted = (
        await c.query<{ pan: string; name: string; ded: string }>(
          `SELECT d.deductee_pan AS pan, lower(d.deductee_name) AS name, sum(d.tds_deducted)::text AS ded
           FROM public.tds_deductees d JOIN public.tds_challans ch ON ch.id = d.challan_id
           WHERE ch.tan_registration_id = $1 AND ch.tax_year = $2 AND d.form_code = '138'
           GROUP BY d.deductee_pan, lower(d.deductee_name)`,
          [t.id, q.data.year],
        )
      ).rows;
      return { employees, deducted };
    });
    if (!data) return reply.status(404).send({ error: 'Not found', message: `TAN ${q.data.tan} is not in Client Master.` });
    const emps: SalaryEmployee[] = data.employees.map((e) => ({
      id: e.id, pan: e.employee_pan, name: e.employee_name, regime: e.regime, ageBand: e.age_band, metroCity: e.metro_city,
      monthlyGross: e.monthly_gross, monthlyBasicDa: e.monthly_basic_da, monthlyHra: e.monthly_hra, monthlyEmployerNps: e.monthly_employer_nps,
      annualPerquisites: e.annual_perquisites, professionalTax: e.professional_tax, joinedOn: iso(e.joined_on), previousEmployer: e.previous_employer, form124: e.form124,
    }));
    // TDS so far, matched by PAN (or by name for an employee without a PAN).
    const deducted: Record<string, string> = {};
    for (const e of emps) {
      const hit = data.deducted.filter((d) => (e.pan === 'PANNOTAVBL' ? d.pan === 'PANNOTAVBL' && d.name === e.name.toLowerCase() : d.pan === e.pan));
      deducted[e.id] = hit.reduce((s, d) => s + Number(d.ded), 0).toFixed(2);
    }
    const lines = salaryRegister({ taxYear: q.data.year, today: istToday(), employees: emps, deducted });
    return reply.send({
      employees: emps.map((e) => ({ ...e, pan: maskPan(e.pan) })),
      register: lines.map((l) => ({ ...l, pan: maskPan(l.pan) })),
    });
  });

  const save = async (request: FastifyRequest, reply: FastifyReply, id?: string) => {
    const b = EmployeeBody.safeParse(request.body);
    if (!b.success) return reply.status(400).send({ error: 'Invalid', message: b.error.issues[0]?.message ?? 'Check the employee.' });
    const d = b.data;
    const expected = expectedVersion(request);
    const values = [d.pan, d.name, d.regime, d.ageBand, d.metroCity, d.monthlyGross, d.monthlyBasicDa, d.monthlyHra, d.monthlyEmployerNps, d.annualPerquisites, d.professionalTax, d.joinedOn || null, d.previousEmployer ? JSON.stringify(d.previousEmployer) : null, d.form124 ? JSON.stringify(d.form124) : null];
    try {
      const out = await db.withTenantTransaction(ctx(request), async (c) => {
        const t = (await c.query<{ id: string; entity_id: string }>('SELECT id, entity_id FROM public.tan_registrations WHERE tan = $1', [d.tan])).rows[0];
        if (!t) return null;
        if (id) {
          const updated = (
            await c.query<{ id: string; updated_at: Date }>(
              `UPDATE public.salary_employees SET employee_pan = $2, employee_name = $3, regime = $4, age_band = $5, metro_city = $6, monthly_gross = $7, monthly_basic_da = $8,
                 monthly_hra = $9, monthly_employer_nps = $10, annual_perquisites = $11, professional_tax = $12, joined_on = $13, previous_employer = $14, form124 = $15
               WHERE id = $1 AND ${VERSION_MATCHES('$16')} RETURNING id, updated_at`,
              [id, ...values, expected],
            )
          ).rows[0];
          if (updated) {
            reply.header('ETag', versionTag(updated.updated_at));
            return updated.id;
          }
          // Not updated: either it is gone, or someone saved it since this client read it.
          if (expected && (await c.query('SELECT 1 FROM public.salary_employees WHERE id = $1', [id])).rowCount) return 'STALE';
          return null;
        }
        return (
          await c.query<{ id: string }>(
            `INSERT INTO public.salary_employees (firm_id, entity_id, tan_registration_id, tax_year, employee_pan, employee_name, regime, age_band, metro_city, monthly_gross,
               monthly_basic_da, monthly_hra, monthly_employer_nps, annual_perquisites, professional_tax, joined_on, previous_employer, form124, created_by)
             VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, app.current_user_id()) RETURNING id`,
            [t.entity_id, t.id, d.taxYear, ...values],
          )
        ).rows[0].id;
      });
      if (out === 'STALE') return reply.status(409).send({ error: 'Changed', message: 'Someone saved this employee after you opened it. Reload to see their changes.' });
      if (!out) return reply.status(404).send({ error: 'Not found' });
      return reply.status(id ? 200 : 201).send({ id: out });
    } catch (err: any) {
      if (err.code === '23505') return reply.status(409).send({ error: 'Duplicate', message: 'This employee is already on the register for the year.' });
      throw err;
    }
  };

  fastify.post('/salary/employees', (request, reply) => save(request, reply));
  fastify.put('/salary/employees/:id', (request, reply) => {
    const { id } = request.params as { id: string };
    if (!/^[0-9a-f-]{36}$/i.test(id)) return reply.status(400).send({ error: 'Invalid' });
    return save(request, reply, id);
  });
  fastify.delete('/salary/employees/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!/^[0-9a-f-]{36}$/i.test(id)) return reply.status(400).send({ error: 'Invalid' });
    const n = await db.withTenantTransaction(ctx(request), async (c) => (await c.query('DELETE FROM public.salary_employees WHERE id = $1', [id])).rowCount);
    return n ? reply.send({ ok: true }) : reply.status(404).send({ error: 'Not found' });
  });
}
