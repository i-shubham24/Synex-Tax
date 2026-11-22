import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { db } from '../db/pool.js';
import { activeGstPeriod } from '../modules/tenancy/trialBootstrapper.js';
import { GstItcSetOffEngine } from '@synextax/tax-engine';
import { publicMessage } from '../plugins/publicError.js';

export async function gstRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Valid JWT session token required' });
    }
  });

  const getCtx = (req: FastifyRequest) => {
    const user = req.user as { firmId: string; userId: string; role: string };
    return {
      firmId: user.firmId,
      userId: user.userId,
      actorKind: 'USER' as const,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };
  };

  // -------------------------------------------------------------------------
  // GET /api/v1/gst/sales: Outward Sales Register & HSN / Doc Aggregation
  // -------------------------------------------------------------------------
  fastify.get('/sales', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { registrationId?: string; period?: string };
    const period = query.period || activeGstPeriod();

    if (!db.isConfigured()) {
      return reply.send({
        success: true,
        source: 'SAMPLE_FALLBACK',
        data: {
          period,
          invoices: [
            {
              id: 's-1',
              invoiceNum: 'PT/26-27/0301',
              invoiceDate: `${period}-05`,
              docType: 'INV',
              supplyType: 'B2B',
              customerGstin: '07AAACD6612E1ZQ',
              customerName: 'Delhi Textiles Emporium',
              pos: '07',
              taxableValue: '350000.00',
              igstAmount: '17500.00',
              cgstAmount: '0.00',
              sgstAmount: '0.00',
              totalValue: '367500.00',
              status: 'VALIDATED',
            },
            {
              id: 's-2',
              invoiceNum: 'PT/26-27/0302',
              invoiceDate: `${period}-14`,
              docType: 'INV',
              supplyType: 'B2B',
              customerGstin: '03AACFK2207N1Z8',
              customerName: 'Ludhiana Garments Hub',
              pos: '03',
              taxableValue: '180000.00',
              igstAmount: '0.00',
              cgstAmount: '4500.00',
              sgstAmount: '4500.00',
              totalValue: '189000.00',
              status: 'VALIDATED',
            },
            {
              id: 's-3',
              invoiceNum: 'PT/26-27/0303',
              invoiceDate: `${period}-23`,
              docType: 'INV',
              supplyType: 'B2B',
              customerGstin: '03AADCR8841G1ZP',
              customerName: 'Amritsar Fashion Fabrics',
              pos: '03',
              taxableValue: '95000.00',
              igstAmount: '0.00',
              cgstAmount: '2375.00',
              sgstAmount: '2375.00',
              totalValue: '99750.00',
              status: 'VALIDATED',
            },
          ],
          summary: {
            totalInvoices: 3,
            totalTaxableValue: '625000.00',
            totalIgst: '17500.00',
            totalCgst: '6875.00',
            totalSgst: '6875.00',
            totalTax: '31250.00',
            totalInvoiceValue: '656250.00',
          },
        },
      });
    }

    try {
      const result = await db.withTenantTransaction(getCtx(request), async (client) => {
        let regId = query.registrationId;
        if (!regId) {
          const regRes = await client.query(
            `SELECT id FROM public.gst_registrations
             WHERE firm_id = app.current_firm_id() AND registration_type = 'REGULAR'
             ORDER BY created_at LIMIT 1`,
          );
          if (regRes.rows.length > 0) {
            regId = regRes.rows[0].id;
          }
        }

        const sql = `
          SELECT id, invoice_num, invoice_date::text, doc_type, supply_type,
                 customer_gstin, customer_legal_name, pos_state_code,
                 taxable_value::text, igst_rate::text, igst_amount::text,
                 cgst_rate::text, cgst_amount::text, sgst_rate::text, sgst_amount::text,
                 total_invoice_value::text, return_period
          FROM public.gst_invoices_sales
          WHERE firm_id = app.current_firm_id()
            ${regId ? 'AND gst_registration_id = $1' : ''}
            AND return_period = ${regId ? '$2' : '$1'}
          ORDER BY invoice_date DESC, invoice_num DESC
        `;
        const params = regId ? [regId, period] : [period];
        const res = await client.query(sql, params);

        let totalTaxable = new Decimal(0);
        let totalIgst = new Decimal(0);
        let totalCgst = new Decimal(0);
        let totalSgst = new Decimal(0);
        let totalVal = new Decimal(0);

        const invoices = res.rows.map((r) => {
          totalTaxable = totalTaxable.plus(r.taxable_value);
          totalIgst = totalIgst.plus(r.igst_amount);
          totalCgst = totalCgst.plus(r.cgst_amount);
          totalSgst = totalSgst.plus(r.sgst_amount);
          totalVal = totalVal.plus(r.total_invoice_value);

          return {
            id: r.id,
            invoiceNum: r.invoice_num,
            invoiceDate: r.invoice_date,
            docType: r.doc_type,
            supplyType: r.supply_type,
            customerGstin: r.customer_gstin,
            customerName: r.customer_legal_name || 'Counterparty',
            pos: r.pos_state_code,
            taxableValue: r.taxable_value,
            igstAmount: r.igst_amount,
            cgstAmount: r.cgst_amount,
            sgstAmount: r.sgst_amount,
            totalValue: r.total_invoice_value,
            status: 'VALIDATED',
          };
        });

        const totalTax = totalIgst.plus(totalCgst).plus(totalSgst);

        return {
          period,
          invoices,
          summary: {
            totalInvoices: invoices.length,
            totalTaxableValue: totalTaxable.toFixed(2),
            totalIgst: totalIgst.toFixed(2),
            totalCgst: totalCgst.toFixed(2),
            totalSgst: totalSgst.toFixed(2),
            totalTax: totalTax.toFixed(2),
            totalInvoiceValue: totalVal.toFixed(2),
          },
        };
      });

      return reply.send({ success: true, source: 'POSTGRESQL_RLS', data: result });
    } catch (err: any) {
      return reply.status(500).send({ error: 'Sales Fetch Failed', message: publicMessage(err) });
    }
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/gst/gstr3b/calculate: Rule 88A & Rule 86B Set-Off Optimization
  // -------------------------------------------------------------------------
  fastify.post('/gstr3b/calculate', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      period?: string;
      registrationId?: string;
      outwardIgst?: string;
      outwardCgst?: string;
      outwardSgst?: string;
      itcIgst?: string;
      itcCgst?: string;
      itcSgst?: string;
    };
    const period = body.period || activeGstPeriod();

    const liabilityIgst = new Decimal(body.outwardIgst || '17500.00');
    const liabilityCgst = new Decimal(body.outwardCgst || '6875.00');
    const liabilitySgst = new Decimal(body.outwardSgst || '6875.00');

    const itcIgst = new Decimal(body.itcIgst || '6000.00');
    const itcCgst = new Decimal(body.itcCgst || '13650.00');
    const itcSgst = new Decimal(body.itcSgst || '13650.00');

    const setOffResult = GstItcSetOffEngine.compute({
      liability: {
        outward: {
          igst: liabilityIgst,
          cgst: liabilityCgst,
          sgst: liabilitySgst,
          cess: '0.00',
        },
        rcm: {
          igst: '0.00',
          cgst: '0.00',
          sgst: '0.00',
          cess: '0.00',
        },
      },
      itcAvailable: {
        igst: itcIgst,
        cgst: itcCgst,
        sgst: itcSgst,
        cess: '0.00',
      },
      turnover: {
        domesticTaxable: '625000.00',
      },
    });

    return reply.send({
      success: true,
      data: {
        period,
        table31Liability: {
          igst: liabilityIgst.toFixed(2),
          cgst: liabilityCgst.toFixed(2),
          sgst: liabilitySgst.toFixed(2),
          total: liabilityIgst.plus(liabilityCgst).plus(liabilitySgst).toFixed(2),
        },
        table4Itc: {
          igst: itcIgst.toFixed(2),
          cgst: itcCgst.toFixed(2),
          sgst: itcSgst.toFixed(2),
          total: itcIgst.plus(itcCgst).plus(itcSgst).toFixed(2),
        },
        setOff: setOffResult,
        cashShortfall: {
          igst: setOffResult.cashPayable.outward.igst.toFixed(2),
          cgst: setOffResult.cashPayable.outward.cgst.toFixed(2),
          sgst: setOffResult.cashPayable.outward.sgst.toFixed(2),
          total: setOffResult.cashPayable.totalCashPayable.toFixed(2),
        },
        rule86bApplied: setOffResult.rule86bApplied,
        rule86bMaxItcCap: setOffResult.rule86bMaxItcCap ? setOffResult.rule86bMaxItcCap.toFixed(2) : null,
      },
    });
  });
}
