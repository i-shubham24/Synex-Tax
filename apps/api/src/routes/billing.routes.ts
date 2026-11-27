import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  BILLING_GST_RATES,
  BILLING_UQC,
  billingDocumentsIssued,
  billingFinancialYear,
  billingGstr1Sections,
  billingHsnSummary,
  billingSalesRows,
  billingStockRegister,
  buildEinvoiceJson,
  buildEwayBillEntry,
  buildEwayBillJson,
  computeBillingDoc,
  ewayBillRequired,
  ewayConsignmentValue,
  formatSeriesNumber,
  normalizeEwayTransportMode,
  seriesPrefixError,
  validateEwayBillNumber,
  validateRcmIrnEligibility,
  type BillingDoc,
  type BillingDocInput,
  type BillingStoredDoc,
  type EinvParty,
  type EwayTransport,
  type StockMovement,
} from '@synextax/tax-engine';
import { db } from '../db/pool.js';
import { insertRows } from '../db/batchInsert.js';
import { expectedVersion, versionTag, VERSION_MATCHES } from '../plugins/concurrency.js';
import { publicMessage } from '../plugins/publicError.js';

/**
 * Billing for a firm's small clients, per GSTIN: items, customers, numbering series, tax
 * invoices and credit or debit notes (cancelled, never deleted), purchases for the stock
 * register, the e-invoice (INV-01 v1.1) and e-way bill (NIC bulk) JSON for upload on the portals,
 * the IRN and e-way bill numbers recorded back, and GSTR-1 from the invoices, written into
 * public.gst_invoices_sales so the GSTR-1 screens use them. Mounted at /api/v1/billing.
 */

const GSTIN = z.string().trim().toUpperCase().regex(/^[0-9]{2}[0-9A-Z]{13}$/);
const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const PERIOD = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const UUID = z.string().uuid();
const NON_NEG_QTY = z.string().trim().max(20).regex(/^\d+(\.\d{1,3})?$/);
const QTY = NON_NEG_QTY.refine((v) => Number(v) > 0, { message: 'Quantity must be greater than zero' });
const MONEY = z.string().trim().max(20).regex(/^\d+(\.\d{1,2})?$/);
const PRICE = z.string().trim().max(20).regex(/^\d+(\.\d{1,3})?$/);
const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const optText = (max: number) => z.preprocess(blankToNull, z.string().trim().max(max).nullable().optional());
const GST_RATE = z.number().refine((r) => BILLING_GST_RATES.includes(r), 'not a GST rate');
const UNIT = z.string().trim().toUpperCase().refine((u) => !!BILLING_UQC[u], 'not a UQC');
const STATE = z.string().regex(/^[0-9]{2}$/);
const PIN = z.string().regex(/^[1-9][0-9]{5}$/);

const GstinQuery = z.object({ gstin: GSTIN });
const ItemBody = z.object({
  name: z.string().trim().min(3).max(120),
  hsn: z.string().trim().regex(/^([0-9]{4}|[0-9]{6}|[0-9]{8})$/),
  isService: z.boolean(),
  unit: UNIT,
  gstRate: GST_RATE,
  cessRate: z.number().min(0).max(999).default(0),
  salePrice: PRICE.default('0'),
  openingQty: NON_NEG_QTY.default('0'),
  openingValue: MONEY.default('0'),
  active: z.boolean().default(true),
});
const CustomerBody = z.object({
  legalName: z.string().trim().min(3).max(100),
  tradeName: optText(100),
  gstin: z.preprocess(blankToNull, GSTIN.nullable().optional()),
  stateCode: STATE,
  address1: z.string().trim().min(1).max(100),
  address2: optText(100),
  place: z.string().trim().min(3).max(50),
  pincode: z.preprocess(blankToNull, PIN.nullable().optional()),
  phone: optText(15),
  email: z.preprocess(blankToNull, z.string().trim().max(100).email().nullable().optional()),
  active: z.boolean().default(true),
});
const SellerBody = z.object({
  gstin: GSTIN,
  address1: z.string().trim().min(1).max(100),
  address2: optText(100),
  place: z.string().trim().min(3).max(50),
  pincode: PIN,
  phone: optText(15),
  email: z.preprocess(blankToNull, z.string().trim().max(100).email().nullable().optional()),
  bankDetails: optText(300),
  terms: optText(500),
});
const SeriesBody = z.object({
  gstin: GSTIN,
  fy: z.number().int().min(2017).max(2100),
  docType: z.enum(['INV', 'CRN', 'DBN']),
  prefix: z.string().trim().toUpperCase().max(15).default(''),
  padWidth: z.number().int().min(1).max(10).default(4),
  startNo: z.number().int().min(1).max(99_999_999).default(1),
});
const LineBody = z.object({
  itemId: z.preprocess(blankToNull, UUID.nullable().optional()),
  description: z.string().trim().min(3).max(300),
  hsn: z.string().trim().regex(/^([0-9]{4}|[0-9]{6}|[0-9]{8})$/),
  isService: z.boolean(),
  unit: UNIT,
  quantity: QTY,
  unitPrice: PRICE,
  discount: MONEY.default('0'),
  gstRate: GST_RATE,
  cessRate: z.number().min(0).max(999).default(0),
});
const DocumentBody = z.object({
  gstin: GSTIN,
  seriesId: UUID,
  docDate: ISO_DATE,
  customerId: UUID,
  placeOfSupply: STATE,
  reverseCharge: z.boolean().default(false),
  originalDocNo: z.preprocess(blankToNull, z.string().trim().toUpperCase().max(16).nullable().optional()),
  originalDocDate: z.preprocess(blankToNull, ISO_DATE.nullable().optional()),
  notes: optText(500),
  lines: z.array(LineBody).min(1).max(1000),
});
const ListQuery = z.object({ gstin: GSTIN, from: ISO_DATE.optional(), to: ISO_DATE.optional() });
const CancelBody = z.object({ reason: z.string().trim().min(3).max(200) });
const IrnBody = z.object({
  irn: z.string().trim().toLowerCase().regex(/^[0-9a-f]{64}$/),
  ackNo: z.string().trim().regex(/^[0-9A-Za-z]{1,32}$/),
  ackDate: z.string().trim().max(40).refine((s) => !Number.isNaN(Date.parse(s)), 'not a date'),
});
const EwbBody = z.object({
  ewbNo: z.string().trim().refine((val) => validateEwayBillNumber(val, { allowVariableAdv687: process.env.GSTN_ADV_687_ENABLED === 'true' }), 'EWB number must be 12 or 14 digits (or 10-32 chars under Adv 687)'),
  ewbDate: z.string().trim().max(40).refine((s) => !Number.isNaN(Date.parse(s)), 'not a date'),
});
const TransportBody = z.object({
  mode: z.union([
    z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5),
    z.enum(['ROAD', 'RAIL', 'AIR', 'SHIP', 'METRO', 'METRO_RAIL']),
  ]),
  distanceKm: z.number().int().min(1).max(4000),
  vehicleNo: optText(20),
  vehicleType: z.preprocess(blankToNull, z.enum(['R', 'O']).nullable().optional()),
  transporterId: z.preprocess(blankToNull, z.string().trim().toUpperCase().regex(/^[0-9]{2}[0-9A-Z]{13}$/).nullable().optional()),
  transporterName: optText(100),
  transDocNo: optText(15),
  transDocDate: z.preprocess(blankToNull, ISO_DATE.nullable().optional()),
});
const PurchaseBody = z.object({
  gstin: GSTIN,
  itemId: UUID,
  supplierName: z.string().trim().min(2).max(100),
  supplierGstin: z.preprocess(blankToNull, GSTIN.nullable().optional()),
  billNo: z.string().trim().min(1).max(32),
  billDate: ISO_DATE,
  quantity: QTY,
  value: MONEY,
});
const PeriodQuery = z.object({ gstin: GSTIN, period: PERIOD });
const PushBody = z.object({ gstin: GSTIN, period: PERIOD });
const StockQuery = z.object({ gstin: GSTIN, to: ISO_DATE.optional() });

const ctx = (req: FastifyRequest) => ({
  firmId: req.user.firmId,
  userId: req.user.userId,
  actorKind: 'USER' as const,
  ip: req.ip,
  requestId: req.id,
  userAgent: req.headers['user-agent'],
});

class HttpError extends Error {
  constructor(public statusCode: number, message: string, public details?: unknown) {
    super(message);
  }
}
const bad = (message: string, details?: unknown) => new HttpError(422, message, details);
const notFound = (what: string) => new HttpError(404, `${what} was not found.`);
const invalid = (reply: FastifyReply, err: z.ZodError) =>
  reply.status(400).send({ error: 'Invalid', message: `Check: ${[...new Set(err.issues.map((i) => i.path.join('.') || 'request'))].join(', ')}.` });

function fail(reply: FastifyReply, err: any) {
  if (err instanceof HttpError) return reply.status(err.statusCode).send({ error: 'Not saved', message: err.message, ...(err.details ? { details: err.details } : {}) });
  if (err?.code === '23505') return reply.status(409).send({ error: 'Conflict', message: 'That number or name is already used for this client.' });
  if (/PERIOD_IMMUTABLE_LOCKED/.test(err?.message ?? '')) return reply.status(409).send({ error: 'Locked', message: 'That month is locked because its return has been filed.' });
  if (err?.code === '23514' || err?.code === '23503') return reply.status(422).send({ error: 'Not saved', message: 'A value is out of range or refers to a record of another client.' });
  return reply.status(500).send({ error: 'Server error', message: publicMessage(err) });
}

interface Reg {
  id: string;
  entity_id: string;
  gstin: string;
  legal_name: string;
  trade_name: string | null;
}

async function registration(c: pg.PoolClient, gstin: string): Promise<Reg> {
  const r = (
    await c.query<Reg>(
      `SELECT g.id, g.entity_id, g.gstin, COALESCE(g.legal_name_on_portal, e.legal_name) AS legal_name, COALESCE(g.trade_name_on_portal, e.trade_name) AS trade_name
       FROM public.gst_registrations g JOIN public.entities e ON e.id = g.entity_id WHERE g.gstin = $1`,
      [gstin],
    )
  ).rows[0];
  if (!r) throw notFound(`GSTIN ${gstin}`);
  return r;
}

async function sellerParty(c: pg.PoolClient, reg: Reg): Promise<EinvParty & { bankDetails: string | null; terms: string | null; configured: boolean }> {
  const s = (await c.query(`SELECT * FROM public.billing_sellers WHERE gst_registration_id = $1`, [reg.id])).rows[0];
  return {
    gstin: reg.gstin,
    legalName: reg.legal_name,
    tradeName: reg.trade_name,
    address1: s?.address1 ?? '',
    address2: s?.address2 ?? null,
    place: s?.place ?? '',
    pincode: s?.pincode ?? '',
    stateCode: reg.gstin.slice(0, 2),
    phone: s?.phone ?? null,
    email: s?.email ?? null,
    bankDetails: s?.bank_details ?? null,
    terms: s?.terms ?? null,
    configured: !!s,
  };
}

const itemOut = (r: any) => ({
  id: r.id,
  name: r.name,
  hsn: r.hsn,
  isService: r.is_service,
  unit: r.unit,
  gstRate: Number(r.gst_rate),
  cessRate: Number(r.cess_rate),
  salePrice: r.sale_price,
  openingQty: r.opening_qty,
  openingValue: r.opening_value,
  active: r.active,
  version: new Date(r.updated_at).toISOString(),
});
const customerOut = (r: any) => ({
  id: r.id,
  legalName: r.legal_name,
  tradeName: r.trade_name,
  gstin: r.gstin,
  stateCode: r.state_code,
  address1: r.address1,
  address2: r.address2,
  place: r.place,
  pincode: r.pincode,
  phone: r.phone,
  email: r.email,
  active: r.active,
  version: new Date(r.updated_at).toISOString(),
});
const iso = (d: Date | string) => (typeof d === 'string' ? d.slice(0, 10) : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10));

/** A stored document and its lines, recomputed by the tax engine (the same figures as when it was saved). */
async function loadDocument(c: pg.PoolClient, id: string) {
  const d = (
    await c.query(
      `SELECT d.*, g.gstin AS supplier_gstin, s.prefix AS series_prefix FROM public.billing_documents d
       JOIN public.gst_registrations g ON g.id = d.gst_registration_id JOIN public.billing_series s ON s.id = d.series_id WHERE d.id = $1`,
      [id],
    )
  ).rows[0];
  if (!d) throw notFound('The document');
  const lines = (await c.query(`SELECT * FROM public.billing_document_lines WHERE document_id = $1 ORDER BY line_no`, [id])).rows;
  return { row: d, lines, doc: recompute(d, lines) };
}

function recompute(d: any, lines: any[]): BillingDoc {
  const input: BillingDocInput = {
    docType: d.doc_type,
    docNo: d.doc_no,
    docDate: iso(d.doc_date),
    supplierGstin: d.supplier_gstin,
    customerGstin: d.buyer?.gstin ?? null,
    placeOfSupply: d.place_of_supply,
    reverseCharge: d.reverse_charge,
    originalDocNo: d.original_doc_no,
    originalDocDate: d.original_doc_date ? iso(d.original_doc_date) : null,
    roundOff: true,
    lines: lines.map((l) => ({
      itemId: l.item_id,
      description: l.description,
      hsn: l.hsn,
      isService: l.is_service,
      unit: l.unit,
      quantity: String(Number(l.quantity)),
      unitPrice: String(Number(l.unit_price)),
      discount: l.discount,
      gstRate: Number(l.gst_rate),
      cessRate: Number(l.cess_rate),
    })),
  };
  return computeBillingDoc(input);
}

function documentOut(row: any, doc: BillingDoc) {
  return {
    id: row.id,
    docType: row.doc_type,
    docNo: row.doc_no,
    docDate: iso(row.doc_date),
    fy: row.fy,
    seriesId: row.series_id,
    customerId: row.customer_id,
    buyer: row.buyer,
    placeOfSupply: row.place_of_supply,
    reverseCharge: row.reverse_charge,
    interState: row.inter_state,
    section: row.gstr1_section,
    originalDocNo: row.original_doc_no,
    originalDocDate: row.original_doc_date ? iso(row.original_doc_date) : null,
    notes: row.notes,
    status: row.status,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    irn: row.irn,
    ackNo: row.ack_no,
    ackDate: row.ack_date,
    ewbNo: row.ewb_no,
    ewbDate: row.ewb_date,
    transport: row.transport,
    lines: doc.lines,
    totals: doc.totals,
    ewayBillRequired: row.status === 'ACTIVE' && ewayBillRequired(doc),
    consignmentValue: ewayConsignmentValue(doc).toFixed(2),
    version: new Date(row.updated_at).toISOString(),
  };
}

/** Documents of a GSTIN dated within [from, to], as the GSTR-1 builders read them. */
async function storedDocs(c: pg.PoolClient, regId: string, from: string, to: string): Promise<BillingStoredDoc[]> {
  const docs = (
    await c.query(
      `SELECT d.*, s.prefix AS series_prefix FROM public.billing_documents d JOIN public.billing_series s ON s.id = d.series_id
       WHERE d.gst_registration_id = $1 AND d.doc_date BETWEEN $2 AND $3 ORDER BY d.doc_date, d.doc_no`,
      [regId, from, to],
    )
  ).rows;
  if (!docs.length) return [];
  const lines = (await c.query(`SELECT * FROM public.billing_document_lines WHERE document_id = ANY($1::uuid[]) ORDER BY line_no`, [docs.map((d) => d.id)])).rows;
  return docs.map((d) => ({
    docType: d.doc_type,
    docNo: d.doc_no,
    docDate: iso(d.doc_date),
    seriesPrefix: d.series_prefix,
    seriesNo: d.series_no,
    cancelled: d.status === 'CANCELLED',
    customerGstin: d.buyer?.gstin ?? null,
    customerName: d.buyer?.legalName ?? '',
    placeOfSupply: d.place_of_supply,
    reverseCharge: d.reverse_charge,
    interState: d.inter_state,
    invoiceValue: d.invoice_value,
    originalDocNo: d.original_doc_no,
    originalDocDate: d.original_doc_date ? iso(d.original_doc_date) : null,
    lines: lines
      .filter((l) => l.document_id === d.id)
      .map((l) => ({ hsn: l.hsn, isService: l.is_service, unit: l.unit, quantity: l.quantity, gstRate: Number(l.gst_rate), taxable: l.taxable_value, igst: l.igst_amount, cgst: l.cgst_amount, sgst: l.sgst_amount, cess: l.cess_amount })),
  }));
}

const monthBounds = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, '0')}` };
};

const buyerParty = (b: any, pos: string): EinvParty => ({
  gstin: b?.gstin ?? null,
  legalName: b?.legalName ?? '',
  tradeName: b?.tradeName ?? null,
  address1: b?.address1 ?? '',
  address2: b?.address2 ?? null,
  place: b?.place ?? '',
  pincode: b?.pincode ?? '',
  stateCode: b?.stateCode ?? pos,
  phone: b?.phone ?? null,
  email: b?.email ?? null,
});

const fileName = (docNo: string, kind: string) => `${kind}-${docNo.replace(/[^A-Za-z0-9-]/g, '-')}.json`;

export async function billingRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    if (request.user.role === 'CLIENT') return reply.status(403).send({ error: 'Forbidden' });
  });

  const WRITE = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } };
  const READ = { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } };

  // Client GSTINs the user can see, with whether e-invoicing applies to them.
  fastify.get('/registrations', READ, async (request, reply) => {
    try {
      const rows = await db.withTenantTransaction(ctx(request), async (c) =>
        (
          await c.query(
            `SELECT g.gstin, g.einvoice_applicable, g.filing_category, e.legal_name, (s.id IS NOT NULL) AS seller_ready
             FROM public.gst_registrations g JOIN public.entities e ON e.id = g.entity_id
             LEFT JOIN public.billing_sellers s ON s.gst_registration_id = g.id
             WHERE g.registration_type = 'REGULAR' AND g.status = 'ACTIVE' ORDER BY e.legal_name, g.gstin`,
          )
        ).rows,
      );
      return reply.send({ registrations: rows.map((r) => ({ gstin: r.gstin, name: r.legal_name, einvoiceApplicable: r.einvoice_applicable, category: r.filing_category, sellerReady: r.seller_ready })) });
    } catch (err) {
      return fail(reply, err);
    }
  });

  /* Seller details */

  fastify.get('/seller', READ, async (request, reply) => {
    const q = GstinQuery.safeParse(request.query);
    if (!q.success) return invalid(reply, q.error);
    try {
      const out = await db.withTenantTransaction(ctx(request), async (c) => {
        const reg = await registration(c, q.data.gstin);
        const row = (await c.query(`SELECT updated_at FROM public.billing_sellers WHERE gst_registration_id = $1`, [reg.id])).rows[0];
        return { seller: await sellerParty(c, reg), version: row ? new Date(row.updated_at).toISOString() : null };
      });
      if (out.version) reply.header('ETag', versionTag(out.version));
      return reply.send(out);
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.put('/seller', WRITE, async (request, reply) => {
    const b = SellerBody.safeParse(request.body);
    if (!b.success) return invalid(reply, b.error);
    const d = b.data;
    const expected = expectedVersion(request);
    try {
      const row = await db.withTenantTransaction(ctx(request), async (c) => {
        const reg = await registration(c, d.gstin);
        const vals = [d.address1, d.address2 ?? null, d.place, d.pincode, d.phone ?? null, d.email ?? null, d.bankDetails ?? null, d.terms ?? null];
        const upd = await c.query(
          `UPDATE public.billing_sellers SET address1 = $2, address2 = $3, place = $4, pincode = $5, phone = $6, email = $7, bank_details = $8, terms = $9
           WHERE gst_registration_id = $1 AND ${VERSION_MATCHES('$10')} RETURNING updated_at`,
          [reg.id, ...vals, expected],
        );
        if (upd.rows[0]) return upd.rows[0];
        const exists = (await c.query(`SELECT 1 FROM public.billing_sellers WHERE gst_registration_id = $1`, [reg.id])).rowCount;
        if (exists) throw new HttpError(409, 'Someone else changed these details. Reload and try again.');
        return (
          await c.query(
            `INSERT INTO public.billing_sellers (firm_id, entity_id, gst_registration_id, address1, address2, place, pincode, phone, email, bank_details, terms, created_by)
             VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING updated_at`,
            [reg.entity_id, reg.id, ...vals, request.user.userId],
          )
        ).rows[0];
      });
      reply.header('ETag', versionTag(row.updated_at));
      return reply.send({ saved: true, version: new Date(row.updated_at).toISOString() });
    } catch (err) {
      return fail(reply, err);
    }
  });

  /* Items */

  fastify.get('/items', READ, async (request, reply) => {
    const q = GstinQuery.safeParse(request.query);
    if (!q.success) return invalid(reply, q.error);
    try {
      const rows = await db.withTenantTransaction(ctx(request), async (c) => {
        const reg = await registration(c, q.data.gstin);
        return (await c.query(`SELECT * FROM public.billing_items WHERE entity_id = $1 ORDER BY active DESC, name`, [reg.entity_id])).rows;
      });
      return reply.send({ items: rows.map(itemOut), units: BILLING_UQC, rates: BILLING_GST_RATES });
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.post('/items', WRITE, async (request, reply) => {
    const b = ItemBody.extend({ gstin: GSTIN }).safeParse(request.body);
    if (!b.success) return invalid(reply, b.error);
    const d = b.data;
    try {
      const row = await db.withTenantTransaction(ctx(request), async (c) => {
        const reg = await registration(c, d.gstin);
        return (
          await c.query(
            `INSERT INTO public.billing_items (firm_id, entity_id, name, hsn, is_service, unit, gst_rate, cess_rate, sale_price, opening_qty, opening_value, active, created_by)
             VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
            [reg.entity_id, d.name, d.hsn, d.isService, d.unit, d.gstRate, d.cessRate, d.salePrice, d.isService ? '0' : d.openingQty, d.isService ? '0' : d.openingValue, d.active, request.user.userId],
          )
        ).rows[0];
      });
      reply.header('ETag', versionTag(row.updated_at));
      return reply.status(201).send({ item: itemOut(row) });
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.put('/items/:id', WRITE, async (request, reply) => {
    const id = UUID.safeParse((request.params as any).id);
    const b = ItemBody.safeParse(request.body);
    if (!id.success) return reply.status(404).send({ error: 'Not found' });
    if (!b.success) return invalid(reply, b.error);
    const d = b.data;
    const expected = expectedVersion(request);
    try {
      const row = await db.withTenantTransaction(ctx(request), async (c) => {
        const r = await c.query(
          `UPDATE public.billing_items SET name = $2, hsn = $3, is_service = $4, unit = $5, gst_rate = $6, cess_rate = $7, sale_price = $8, opening_qty = $9, opening_value = $10, active = $11
           WHERE id = $1 AND ${VERSION_MATCHES('$12')} RETURNING *`,
          [id.data, d.name, d.hsn, d.isService, d.unit, d.gstRate, d.cessRate, d.salePrice, d.isService ? '0' : d.openingQty, d.isService ? '0' : d.openingValue, d.active, expected],
        );
        if (r.rows[0]) return r.rows[0];
        if ((await c.query(`SELECT 1 FROM public.billing_items WHERE id = $1`, [id.data])).rowCount) throw new HttpError(409, 'Someone else changed this item. Reload and try again.');
        throw notFound('The item');
      });
      reply.header('ETag', versionTag(row.updated_at));
      return reply.send({ item: itemOut(row) });
    } catch (err) {
      return fail(reply, err);
    }
  });

  /* Customers */

  fastify.get('/customers', READ, async (request, reply) => {
    const q = GstinQuery.safeParse(request.query);
    if (!q.success) return invalid(reply, q.error);
    try {
      const rows = await db.withTenantTransaction(ctx(request), async (c) => {
        const reg = await registration(c, q.data.gstin);
        return (await c.query(`SELECT * FROM public.billing_customers WHERE entity_id = $1 ORDER BY active DESC, legal_name`, [reg.entity_id])).rows;
      });
      return reply.send({ customers: rows.map(customerOut) });
    } catch (err) {
      return fail(reply, err);
    }
  });

  const customerCheck = (d: z.infer<typeof CustomerBody>) => {
    if (d.gstin && d.gstin.slice(0, 2) !== d.stateCode) throw bad('The state must be the one in the customer GSTIN (its first two digits).');
  };

  fastify.post('/customers', WRITE, async (request, reply) => {
    const b = CustomerBody.extend({ clientGstin: GSTIN }).safeParse(request.body);
    if (!b.success) return invalid(reply, b.error);
    const d = b.data;
    try {
      customerCheck(d);
      const row = await db.withTenantTransaction(ctx(request), async (c) => {
        const reg = await registration(c, d.clientGstin);
        if (d.gstin && d.gstin === reg.gstin) throw bad('The customer GSTIN is the client’s own GSTIN.');
        return (
          await c.query(
            `INSERT INTO public.billing_customers (firm_id, entity_id, legal_name, trade_name, gstin, state_code, address1, address2, place, pincode, phone, email, active, created_by)
             VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
            [reg.entity_id, d.legalName, d.tradeName ?? null, d.gstin ?? null, d.stateCode, d.address1, d.address2 ?? null, d.place, d.pincode ?? null, d.phone ?? null, d.email ?? null, d.active, request.user.userId],
          )
        ).rows[0];
      });
      reply.header('ETag', versionTag(row.updated_at));
      return reply.status(201).send({ customer: customerOut(row) });
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.put('/customers/:id', WRITE, async (request, reply) => {
    const id = UUID.safeParse((request.params as any).id);
    const b = CustomerBody.safeParse(request.body);
    if (!id.success) return reply.status(404).send({ error: 'Not found' });
    if (!b.success) return invalid(reply, b.error);
    const d = b.data;
    const expected = expectedVersion(request);
    try {
      customerCheck(d);
      const row = await db.withTenantTransaction(ctx(request), async (c) => {
        const r = await c.query(
          `UPDATE public.billing_customers SET legal_name = $2, trade_name = $3, gstin = $4, state_code = $5, address1 = $6, address2 = $7, place = $8, pincode = $9, phone = $10, email = $11, active = $12
           WHERE id = $1 AND ${VERSION_MATCHES('$13')} RETURNING *`,
          [id.data, d.legalName, d.tradeName ?? null, d.gstin ?? null, d.stateCode, d.address1, d.address2 ?? null, d.place, d.pincode ?? null, d.phone ?? null, d.email ?? null, d.active, expected],
        );
        if (r.rows[0]) return r.rows[0];
        if ((await c.query(`SELECT 1 FROM public.billing_customers WHERE id = $1`, [id.data])).rowCount) throw new HttpError(409, 'Someone else changed this customer. Reload and try again.');
        throw notFound('The customer');
      });
      reply.header('ETag', versionTag(row.updated_at));
      return reply.send({ customer: customerOut(row) });
    } catch (err) {
      return fail(reply, err);
    }
  });

  /* Number series */

  fastify.get('/series', READ, async (request, reply) => {
    const q = GstinQuery.safeParse(request.query);
    if (!q.success) return invalid(reply, q.error);
    try {
      const rows = await db.withTenantTransaction(ctx(request), async (c) => {
        const reg = await registration(c, q.data.gstin);
        return (await c.query(`SELECT * FROM public.billing_series WHERE gst_registration_id = $1 ORDER BY fy DESC, doc_type, prefix`, [reg.id])).rows;
      });
      return reply.send({
        series: rows.map((r) => ({ id: r.id, fy: r.fy, docType: r.doc_type, prefix: r.prefix, padWidth: r.pad_width, nextNo: r.next_no, nextDocNo: formatSeriesNumber(r.prefix, r.next_no, r.pad_width) })),
      });
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.post('/series', WRITE, async (request, reply) => {
    const b = SeriesBody.safeParse(request.body);
    if (!b.success) return invalid(reply, b.error);
    const d = b.data;
    const err = seriesPrefixError(d.prefix, d.padWidth);
    if (err) return reply.status(422).send({ error: 'Not saved', message: err });
    if (formatSeriesNumber(d.prefix, d.startNo, d.padWidth).length > 16) return reply.status(422).send({ error: 'Not saved', message: 'The first number does not fit in 16 characters with this prefix.' });
    try {
      const row = await db.withTenantTransaction(ctx(request), async (c) => {
        const reg = await registration(c, d.gstin);
        return (
          await c.query(
            `INSERT INTO public.billing_series (firm_id, entity_id, gst_registration_id, fy, doc_type, prefix, pad_width, next_no, created_by)
             VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [reg.entity_id, reg.id, d.fy, d.docType, d.prefix, d.padWidth, d.startNo, request.user.userId],
          )
        ).rows[0];
      });
      return reply.status(201).send({ series: { id: row.id, fy: row.fy, docType: row.doc_type, prefix: row.prefix, padWidth: row.pad_width, nextNo: row.next_no, nextDocNo: formatSeriesNumber(row.prefix, row.next_no, row.pad_width) } });
    } catch (e) {
      return fail(reply, e);
    }
  });

  /* Invoices and notes */

  /** Builds and checks a document from the request; with `allocate` it also takes the series number. */
  async function prepare(c: pg.PoolClient, d: z.infer<typeof DocumentBody>, allocate: boolean) {
    const reg = await registration(c, d.gstin);
    const series = (await c.query(`SELECT * FROM public.billing_series WHERE id = $1 AND gst_registration_id = $2 ${allocate ? 'FOR UPDATE' : ''}`, [d.seriesId, reg.id])).rows[0];
    if (!series) throw notFound('The number series');
    const fy = billingFinancialYear(d.docDate);
    if (series.fy !== fy) throw bad(`This series is for ${series.fy}-${String((series.fy + 1) % 100).padStart(2, '0')}; the date falls in another financial year.`);
    const customer = (await c.query(`SELECT * FROM public.billing_customers WHERE id = $1 AND entity_id = $2`, [d.customerId, reg.entity_id])).rows[0];
    if (!customer) throw notFound('The customer');
    const itemIds = [...new Set(d.lines.map((l) => l.itemId).filter((x): x is string => !!x))];
    if (itemIds.length) {
      const n = (await c.query(`SELECT count(*)::int AS n FROM public.billing_items WHERE id = ANY($1::uuid[]) AND entity_id = $2`, [itemIds, reg.entity_id])).rows[0].n;
      if (n !== itemIds.length) throw bad('A line refers to an item of another client.');
    }
    const docNo = formatSeriesNumber(series.prefix, series.next_no, series.pad_width);
    const doc = computeBillingDoc({
      docType: series.doc_type,
      docNo,
      docDate: d.docDate,
      supplierGstin: reg.gstin,
      customerGstin: customer.gstin,
      placeOfSupply: d.placeOfSupply,
      reverseCharge: d.reverseCharge,
      originalDocNo: d.originalDocNo ?? null,
      originalDocDate: d.originalDocDate ?? null,
      lines: d.lines,
    });
    return { reg, series, customer, doc };
  }

  fastify.post('/documents/preview', { ...READ, bodyLimit: 2 * 1024 * 1024 }, async (request, reply) => {
    const b = DocumentBody.safeParse(request.body);
    if (!b.success) return invalid(reply, b.error);
    try {
      const out = await db.withTenantTransaction(ctx(request), (c) => prepare(c, b.data, false));
      return reply.send({ docNo: out.doc.input.docNo, interState: out.doc.interState, section: out.doc.section, table: out.doc.table, lines: out.doc.lines, totals: out.doc.totals, errors: out.doc.errors, warnings: out.doc.warnings, ewayBillRequired: ewayBillRequired(out.doc) });
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.post('/documents', { ...WRITE, bodyLimit: 2 * 1024 * 1024 }, async (request, reply) => {
    const b = DocumentBody.safeParse(request.body);
    if (!b.success) return invalid(reply, b.error);
    const d = b.data;
    try {
      const out = await db.withTenantTransaction(ctx(request), async (c) => {
        const { reg, series, customer, doc } = await prepare(c, d, true);
        if (doc.errors.length) throw bad('The document has errors; nothing was saved.', doc.errors);
        const t = doc.totals;
        const buyer = {
          legalName: customer.legal_name,
          tradeName: customer.trade_name,
          gstin: customer.gstin,
          stateCode: customer.state_code,
          address1: customer.address1,
          address2: customer.address2,
          place: customer.place,
          pincode: customer.pincode,
          phone: customer.phone,
          email: customer.email,
        };
        const row = (
          await c.query(
            `INSERT INTO public.billing_documents (firm_id, entity_id, gst_registration_id, customer_id, series_id, series_no, fy, doc_type, doc_no, doc_date, place_of_supply,
               reverse_charge, inter_state, gstr1_section, original_doc_no, original_doc_date, buyer, taxable_value, igst_amount, cgst_amount, sgst_amount, cess_amount,
               round_off, invoice_value, amount_payable, notes, created_by)
             VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26) RETURNING *`,
            [
              reg.entity_id, reg.id, customer.id, series.id, series.next_no, series.fy, series.doc_type, doc.input.docNo, d.docDate, d.placeOfSupply,
              d.reverseCharge, doc.interState, doc.section, series.doc_type === 'INV' ? null : d.originalDocNo ?? null, series.doc_type === 'INV' ? null : d.originalDocDate ?? null,
              JSON.stringify(buyer), t.taxable, t.igst, t.cgst, t.sgst, t.cess, t.roundOff, t.invoiceValue, t.amountPayable, d.notes ?? null, request.user.userId,
            ],
          )
        ).rows[0];
        await insertRows(
          c,
          `INSERT INTO public.billing_document_lines (firm_id, entity_id, document_id, line_no, item_id, description, hsn, is_service, unit, quantity, unit_price, discount,
             taxable_value, gst_rate, igst_amount, cgst_amount, sgst_amount, cess_rate, cess_amount)`,
          `(app.current_firm_id(), ${Array(18).fill('?').join(', ')})`,
          doc.lines.map((l) => [reg.entity_id, row.id, l.lineNo, l.itemId ?? null, l.description, l.hsn, l.isService, l.unit, l.quantity, l.unitPrice, l.discount, l.taxable, l.gstRate, l.igst, l.cgst, l.sgst, l.cessRate ?? 0, l.cess]),
        );
        await c.query(`UPDATE public.billing_series SET next_no = next_no + 1 WHERE id = $1`, [series.id]);
        row.supplier_gstin = reg.gstin;
        return { row, doc };
      });
      reply.header('ETag', versionTag(out.row.updated_at));
      return reply.status(201).send({ document: documentOut(out.row, out.doc), warnings: out.doc.warnings });
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.get('/documents', READ, async (request, reply) => {
    const q = ListQuery.safeParse(request.query);
    if (!q.success) return invalid(reply, q.error);
    try {
      const rows = await db.withTenantTransaction(ctx(request), async (c) => {
        const reg = await registration(c, q.data.gstin);
        return (
          await c.query(
            `SELECT id, doc_type, doc_no, doc_date, buyer->>'legalName' AS buyer_name, buyer->>'gstin' AS buyer_gstin, place_of_supply, reverse_charge, gstr1_section,
                    taxable_value, igst_amount + cgst_amount + sgst_amount + cess_amount AS tax, invoice_value, status, irn, ewb_no, updated_at
             FROM public.billing_documents WHERE gst_registration_id = $1 AND doc_date BETWEEN $2 AND $3 ORDER BY doc_date DESC, doc_no DESC LIMIT 1000`,
            [reg.id, q.data.from ?? '2017-07-01', q.data.to ?? '2100-12-31'],
          )
        ).rows;
      });
      return reply.send({
        documents: rows.map((r) => ({
          id: r.id,
          docType: r.doc_type,
          docNo: r.doc_no,
          docDate: iso(r.doc_date),
          buyerName: r.buyer_name,
          buyerGstin: r.buyer_gstin,
          placeOfSupply: r.place_of_supply,
          reverseCharge: r.reverse_charge,
          section: r.gstr1_section,
          taxable: r.taxable_value,
          tax: r.tax,
          invoiceValue: r.invoice_value,
          status: r.status,
          irn: r.irn,
          ewbNo: r.ewb_no,
          version: new Date(r.updated_at).toISOString(),
        })),
      });
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.get('/documents/:id', READ, async (request, reply) => {
    const id = UUID.safeParse((request.params as any).id);
    if (!id.success) return reply.status(404).send({ error: 'Not found' });
    try {
      const out = await db.withTenantTransaction(ctx(request), async (c) => {
        const { row, doc } = await loadDocument(c, id.data);
        const reg = await registration(c, row.supplier_gstin);
        return { row, doc, seller: await sellerParty(c, reg) };
      });
      reply.header('ETag', versionTag(out.row.updated_at));
      return reply.send({ document: documentOut(out.row, out.doc), seller: out.seller });
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.post('/documents/:id/cancel', WRITE, async (request, reply) => {
    const id = UUID.safeParse((request.params as any).id);
    const b = CancelBody.safeParse(request.body);
    if (!id.success) return reply.status(404).send({ error: 'Not found' });
    if (!b.success) return invalid(reply, b.error);
    const expected = expectedVersion(request);
    try {
      const row = await db.withTenantTransaction(ctx(request), async (c) => {
        const r = await c.query(
          `UPDATE public.billing_documents SET status = 'CANCELLED', cancelled_at = now(), cancel_reason = $2
           WHERE id = $1 AND status = 'ACTIVE' AND ${VERSION_MATCHES('$3')} RETURNING updated_at, irn, ewb_no`,
          [id.data, b.data.reason, expected],
        );
        if (r.rows[0]) return r.rows[0];
        const cur = (await c.query(`SELECT status FROM public.billing_documents WHERE id = $1`, [id.data])).rows[0];
        if (!cur) throw notFound('The document');
        if (cur.status === 'CANCELLED') throw new HttpError(409, 'The document is already cancelled.');
        throw new HttpError(409, 'Someone else changed this document. Reload and try again.');
      });
      const reminders = [
        ...(row.irn ? ['Cancel the IRN on the IRP as well (allowed within 24 hours of generation); after that, issue a credit note instead.'] : []),
        ...(row.ewb_no ? ['Cancel the e-way bill on the e-way bill portal as well (allowed within 24 hours).'] : []),
      ];
      reply.header('ETag', versionTag(row.updated_at));
      return reply.send({ cancelled: true, reminders, version: new Date(row.updated_at).toISOString() });
    } catch (err) {
      return fail(reply, err);
    }
  });

  /* e-invoice */

  fastify.get('/documents/:id/einvoice', READ, async (request, reply) => {
    const id = UUID.safeParse((request.params as any).id);
    if (!id.success) return reply.status(404).send({ error: 'Not found' });
    const query = (request.query ?? {}) as { rcmType?: 'RCMDOM' | 'RCMIMP'; env?: 'PRODUCTION' | 'SANDBOX' };
    try {
      const out = await db.withTenantTransaction(ctx(request), async (c) => {
        const { row, doc } = await loadDocument(c, id.data);
        if (row.status !== 'ACTIVE') throw bad('A cancelled document gets no IRN.');
        if (query.rcmType) {
          const rcmCheck = validateRcmIrnEligibility({
            docDate: doc.input.docDate,
            rcmType: query.rcmType,
            environment: query.env ?? 'PRODUCTION',
          });
          if (!rcmCheck.allowed) throw bad(rcmCheck.error ?? 'RCM IRN date check failed.');
        }
        const reg = await registration(c, row.supplier_gstin);
        const seller = await sellerParty(c, reg);
        if (!seller.configured) throw bad('Enter the client’s address (billing settings) first: the IRP needs it.');
        const patchedDoc = query.rcmType
          ? { ...doc, input: { ...doc.input, rcmSelfInvoiceType: query.rcmType, irnEnvironment: query.env ?? 'PRODUCTION' } }
          : doc;
        return { row, ...buildEinvoiceJson(patchedDoc, seller, buyerParty(row.buyer, row.place_of_supply)) };
      });
      if (out.errors.length) return reply.status(422).send({ error: 'Not ready', message: 'The e-invoice JSON cannot be prepared yet.', details: out.errors });
      reply.header('Content-Type', 'application/json; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${fileName(out.row.doc_no, 'einvoice')}"`);
      // The IRP's bulk upload takes a list of documents.
      return reply.send(JSON.stringify([out.json], null, 2));
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.put('/documents/:id/irn', WRITE, async (request, reply) => {
    const id = UUID.safeParse((request.params as any).id);
    const b = IrnBody.safeParse(request.body);
    if (!id.success) return reply.status(404).send({ error: 'Not found' });
    if (!b.success) return invalid(reply, b.error);
    const expected = expectedVersion(request);
    try {
      const row = await db.withTenantTransaction(ctx(request), async (c) => {
        const r = await c.query(
          `UPDATE public.billing_documents SET irn = $2, ack_no = $3, ack_date = $4
           WHERE id = $1 AND status = 'ACTIVE' AND (buyer->>'gstin') IS NOT NULL AND ${VERSION_MATCHES('$5')} RETURNING updated_at`,
          [id.data, b.data.irn, b.data.ackNo, new Date(b.data.ackDate).toISOString(), expected],
        );
        if (r.rows[0]) return r.rows[0];
        const cur = (await c.query(`SELECT status, buyer->>'gstin' AS g FROM public.billing_documents WHERE id = $1`, [id.data])).rows[0];
        if (!cur) throw notFound('The document');
        if (cur.status !== 'ACTIVE') throw bad('The document is cancelled.');
        if (!cur.g) throw bad('An IRN is generated only for a registered buyer.');
        throw new HttpError(409, 'Someone else changed this document. Reload and try again.');
      });
      reply.header('ETag', versionTag(row.updated_at));
      return reply.send({ saved: true, version: new Date(row.updated_at).toISOString() });
    } catch (err) {
      return fail(reply, err);
    }
  });

  /* e-way bill */

  fastify.post('/documents/:id/ewaybill-json', WRITE, async (request, reply) => {
    const id = UUID.safeParse((request.params as any).id);
    const b = TransportBody.safeParse(request.body);
    if (!id.success) return reply.status(404).send({ error: 'Not found' });
    if (!b.success) return invalid(reply, b.error);
    const normalizedMode = normalizeEwayTransportMode(b.data.mode);
    if (!normalizedMode) return reply.status(400).send({ error: 'Invalid', message: 'Check: transport mode.' });
    const transport: EwayTransport = { ...b.data, mode: normalizedMode };
    try {
      const out = await db.withTenantTransaction(ctx(request), async (c) => {
        const { row, doc } = await loadDocument(c, id.data);
        if (row.status !== 'ACTIVE') throw bad('A cancelled document gets no e-way bill.');
        const reg = await registration(c, row.supplier_gstin);
        const seller = await sellerParty(c, reg);
        if (!seller.configured) throw bad('Enter the client’s address (billing settings) first: the e-way bill needs the dispatch PIN code.');
        const built = buildEwayBillEntry(doc, seller, buyerParty(row.buyer, row.place_of_supply), transport);
        if (!built.errors.length) await c.query(`UPDATE public.billing_documents SET transport = $2 WHERE id = $1`, [row.id, JSON.stringify(transport)]);
        return { row, doc, ...built };
      });
      if (out.errors.length) return reply.status(422).send({ error: 'Not ready', message: 'The e-way bill JSON cannot be prepared yet.', details: out.errors });
      reply.header('Content-Type', 'application/json; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${fileName(out.row.doc_no, 'ewaybill')}"`);
      return reply.send(JSON.stringify(buildEwayBillJson([out.entry]), null, 2));
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.put('/documents/:id/ewb', WRITE, async (request, reply) => {
    const id = UUID.safeParse((request.params as any).id);
    const b = EwbBody.safeParse(request.body);
    if (!id.success) return reply.status(404).send({ error: 'Not found' });
    if (!b.success) return invalid(reply, b.error);
    const expected = expectedVersion(request);
    try {
      const row = await db.withTenantTransaction(ctx(request), async (c) => {
        const r = await c.query(
          `UPDATE public.billing_documents SET ewb_no = $2, ewb_date = $3 WHERE id = $1 AND status = 'ACTIVE' AND doc_type = 'INV' AND ${VERSION_MATCHES('$4')} RETURNING updated_at`,
          [id.data, b.data.ewbNo, new Date(b.data.ewbDate).toISOString(), expected],
        );
        if (r.rows[0]) return r.rows[0];
        const cur = (await c.query(`SELECT status, doc_type FROM public.billing_documents WHERE id = $1`, [id.data])).rows[0];
        if (!cur) throw notFound('The document');
        if (cur.status !== 'ACTIVE' || cur.doc_type !== 'INV') throw bad('An e-way bill is recorded only against an active tax invoice.');
        throw new HttpError(409, 'Someone else changed this document. Reload and try again.');
      });
      reply.header('ETag', versionTag(row.updated_at));
      return reply.send({ saved: true, version: new Date(row.updated_at).toISOString() });
    } catch (err) {
      return fail(reply, err);
    }
  });

  /* Purchases and stock */

  fastify.get('/purchases', READ, async (request, reply) => {
    const q = GstinQuery.safeParse(request.query);
    if (!q.success) return invalid(reply, q.error);
    try {
      const rows = await db.withTenantTransaction(ctx(request), async (c) => {
        const reg = await registration(c, q.data.gstin);
        return (
          await c.query(
            `SELECT p.*, i.name AS item_name, i.unit FROM public.billing_purchases p JOIN public.billing_items i ON i.id = p.item_id
             WHERE p.entity_id = $1 ORDER BY p.bill_date DESC, p.created_at DESC LIMIT 1000`,
            [reg.entity_id],
          )
        ).rows;
      });
      return reply.send({
        purchases: rows.map((r) => ({ id: r.id, itemId: r.item_id, itemName: r.item_name, unit: r.unit, supplierName: r.supplier_name, supplierGstin: r.supplier_gstin, billNo: r.bill_no, billDate: iso(r.bill_date), quantity: r.quantity, value: r.value, status: r.status, version: new Date(r.updated_at).toISOString() })),
      });
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.post('/purchases', WRITE, async (request, reply) => {
    const b = PurchaseBody.safeParse(request.body);
    if (!b.success) return invalid(reply, b.error);
    const d = b.data;
    try {
      const row = await db.withTenantTransaction(ctx(request), async (c) => {
        const reg = await registration(c, d.gstin);
        const item = (await c.query(`SELECT is_service FROM public.billing_items WHERE id = $1 AND entity_id = $2`, [d.itemId, reg.entity_id])).rows[0];
        if (!item) throw notFound('The item');
        if (item.is_service) throw bad('A service holds no stock.');
        return (
          await c.query(
            `INSERT INTO public.billing_purchases (firm_id, entity_id, item_id, supplier_name, supplier_gstin, bill_no, bill_date, quantity, value, created_by)
             VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, updated_at`,
            [reg.entity_id, d.itemId, d.supplierName, d.supplierGstin ?? null, d.billNo, d.billDate, d.quantity, d.value, request.user.userId],
          )
        ).rows[0];
      });
      return reply.status(201).send({ id: row.id, version: new Date(row.updated_at).toISOString() });
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.post('/purchases/:id/cancel', WRITE, async (request, reply) => {
    const id = UUID.safeParse((request.params as any).id);
    if (!id.success) return reply.status(404).send({ error: 'Not found' });
    const expected = expectedVersion(request);
    try {
      await db.withTenantTransaction(ctx(request), async (c) => {
        const r = await c.query(`UPDATE public.billing_purchases SET status = 'CANCELLED' WHERE id = $1 AND status = 'ACTIVE' AND ${VERSION_MATCHES('$2')}`, [id.data, expected]);
        if (r.rowCount) return;
        if (!(await c.query(`SELECT 1 FROM public.billing_purchases WHERE id = $1`, [id.data])).rowCount) throw notFound('The purchase');
        throw new HttpError(409, 'The purchase is already cancelled or was changed by someone else.');
      });
      return reply.send({ cancelled: true });
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.get('/stock', READ, async (request, reply) => {
    const q = StockQuery.safeParse(request.query);
    if (!q.success) return invalid(reply, q.error);
    const to = q.data.to ?? new Date().toISOString().slice(0, 10);
    try {
      const rows = await db.withTenantTransaction(ctx(request), async (c) => {
        const reg = await registration(c, q.data.gstin);
        const items = (await c.query(`SELECT * FROM public.billing_items WHERE entity_id = $1 ORDER BY name`, [reg.entity_id])).rows;
        const purchases = (await c.query(`SELECT item_id, bill_date, bill_no, quantity, value FROM public.billing_purchases WHERE entity_id = $1 AND status = 'ACTIVE' AND bill_date <= $2`, [reg.entity_id, to])).rows;
        // Sales and sales returns of every GSTIN of the client move the same stock.
        const sales = (
          await c.query(
            `SELECT l.item_id, d.doc_date, d.doc_no, d.doc_type, l.quantity FROM public.billing_document_lines l JOIN public.billing_documents d ON d.id = l.document_id
             WHERE d.entity_id = $1 AND d.status = 'ACTIVE' AND d.doc_type IN ('INV','CRN') AND l.item_id IS NOT NULL AND d.doc_date <= $2`,
            [reg.entity_id, to],
          )
        ).rows;
        const movements: StockMovement[] = [
          ...purchases.map((p) => ({ itemId: p.item_id, date: iso(p.bill_date), kind: 'PURCHASE' as const, reference: p.bill_no, quantity: p.quantity, value: p.value })),
          ...sales.map((s) => ({ itemId: s.item_id, date: iso(s.doc_date), kind: s.doc_type === 'CRN' ? ('SALES_RETURN' as const) : ('SALE' as const), reference: s.doc_no, quantity: s.quantity })),
        ];
        return billingStockRegister(
          items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, isService: i.is_service, openingQty: i.opening_qty, openingValue: i.opening_value })),
          movements,
        );
      });
      return reply.send({ asOn: to, rows });
    } catch (err) {
      return fail(reply, err);
    }
  });

  /* GSTR-1 */

  fastify.get('/gstr1', READ, async (request, reply) => {
    const q = PeriodQuery.safeParse(request.query);
    if (!q.success) return invalid(reply, q.error);
    const { from, to } = monthBounds(q.data.period);
    try {
      const out = await db.withTenantTransaction(ctx(request), async (c) => {
        const reg = await registration(c, q.data.gstin);
        const docs = await storedDocs(c, reg.id, from, to);
        const pushes = (
          await c.query(`SELECT id, documents, rows_written, superseded, created_at FROM public.billing_gstr1_pushes WHERE gst_registration_id = $1 AND return_period = $2 ORDER BY created_at DESC`, [reg.id, q.data.period])
        ).rows;
        return { docs, pushes };
      });
      return reply.send({
        gstin: q.data.gstin,
        period: q.data.period,
        documents: out.docs.length,
        sections: billingGstr1Sections(out.docs),
        hsn: billingHsnSummary(out.docs),
        documentsIssued: billingDocumentsIssued(out.docs),
        pushes: out.pushes.map((p) => ({ batch: p.id, documents: p.documents, rows: p.rows_written, superseded: p.superseded, at: p.created_at })),
      });
    } catch (err) {
      return fail(reply, err);
    }
  });

  /**
   * Writes the month's active documents into public.gst_invoices_sales (one row per document and
   * GST rate; revision_no numbers the rates of a document) under a new import batch, replacing the
   * rows of earlier pushes of the same month, so the GSTR-1 summary and returns screens read them.
   */
  fastify.post('/gstr1/push', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const b = PushBody.safeParse(request.body);
    if (!b.success) return invalid(reply, b.error);
    const { from, to } = monthBounds(b.data.period);
    const batch = randomUUID();
    try {
      const out = await db.withTenantTransaction(ctx(request), async (c) => {
        const reg = await registration(c, b.data.gstin);
        const docs = await storedDocs(c, reg.id, from, to);
        const active = docs.filter((d) => !d.cancelled);
        if (!active.length) throw bad('There are no active invoices or notes in that month.');
        const extra = (
          await c.query(`SELECT doc_type, doc_no, irn, ack_no, ack_date, ewb_no FROM public.billing_documents WHERE gst_registration_id = $1 AND doc_date BETWEEN $2 AND $3 AND status = 'ACTIVE'`, [reg.id, from, to])
        ).rows;
        const ids = new Map(extra.map((e) => [`${e.doc_type}|${e.doc_no}`, e]));
        const earlier = (await c.query(`SELECT id FROM public.billing_gstr1_pushes WHERE gst_registration_id = $1 AND return_period = $2 AND superseded = false FOR UPDATE`, [reg.id, b.data.period])).rows.map((r) => r.id);
        if (earlier.length) {
          await c.query(`DELETE FROM public.gst_invoices_sales WHERE gst_registration_id = $1 AND import_batch = ANY($2::uuid[])`, [reg.id, earlier]);
          await c.query(`UPDATE public.billing_gstr1_pushes SET superseded = true WHERE id = ANY($1::uuid[])`, [earlier]);
        }
        const rows = billingSalesRows(active);
        await insertRows(
          c,
          `INSERT INTO public.gst_invoices_sales (firm_id, entity_id, gst_registration_id, invoice_num, invoice_date, doc_type, supply_type, customer_gstin, customer_legal_name,
             pos_state_code, reverse_charge, table_section, taxable_value, igst_rate, igst_amount, cgst_rate, cgst_amount, sgst_rate, sgst_amount, cess_amount,
             total_invoice_value, original_invoice_ref, original_invoice_date, irn, ack_no, ack_date, ewb_number, return_period, revision_no, created_by, import_batch)`,
          `(app.current_firm_id(), ${Array(30).fill('?').join(', ')})`,
          rows.map((r) => {
            const e = ids.get(`${r.docType}|${r.invoiceNo}`);
            return [
              reg.entity_id, reg.id, r.invoiceNo, r.invoiceDate, r.docType, r.supplyType, r.customerGstin, r.customerName.slice(0, 200) || null, r.pos, r.reverseCharge, r.table,
              r.taxableValue, r.igstRate, r.igst, r.cgstRate, r.cgst, r.sgstRate, r.sgst, r.cess, r.invoiceValue, r.originalInvoiceNo, r.originalInvoiceDate,
              e?.irn ?? null, e?.ack_no ?? null, e?.ack_date ?? null, e?.ewb_no ?? null, b.data.period, r.rateIndex, request.user.userId, batch,
            ];
          }),
        );
        await c.query(
          `INSERT INTO public.billing_gstr1_pushes (id, firm_id, entity_id, gst_registration_id, return_period, documents, rows_written, created_by) VALUES ($1, app.current_firm_id(), $2, $3, $4, $5, $6, $7)`,
          [batch, reg.entity_id, reg.id, b.data.period, active.length, rows.length, request.user.userId],
        );
        return { documents: active.length, rows: rows.length, replaced: earlier.length };
      });
      return reply.status(201).send({ batch, ...out });
    } catch (err: any) {
      if (err?.code === '23505') return reply.status(409).send({ error: 'Conflict', message: 'Some of these invoice numbers are already in the sales register for this month (imported separately). Remove that import first; nothing was written.' });
      return fail(reply, err);
    }
  });
}
