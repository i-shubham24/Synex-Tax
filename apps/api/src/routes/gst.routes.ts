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

  function gstr3bDueDate(period: string): string {
    const [yearStr, monthStr] = period.split('-');
    const y = Number(yearStr);
    const m = Number(monthStr);
    const nextMonth = m === 12 ? 1 : m + 1;
    const nextYear = m === 12 ? y + 1 : y;
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}-20`;
  }

  // GET /api/v1/gst/gstr3b/cockpit: Practice Multi-GSTIN 3B Position & Set-Off
  fastify.get('/gstr3b/cockpit', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { period?: string };
    const period = query.period || activeGstPeriod();

    if (!db.isConfigured()) {
      return reply.send({
        success: true,
        source: 'SAMPLE_FALLBACK',
        data: {
          period,
          summary: {
            totalGstins: 2,
            totalTaxableTurnover: '1250000.00',
            totalGrossLiability: '225000.00',
            totalEligibleItc: '180000.00',
            totalCashPayable: '45000.00',
            totalItcClosing: '0.00',
            statusCounts: {
              NOT_STARTED: 0,
              READY_TO_AUTOFILL: 1,
              VALIDATED: 1,
              FILED: 0,
            },
          },
          registrations: [
            {
              registrationId: 'reg-demo-1',
              entityId: 'ent-demo-1',
              entityName: 'Golden Gate Hardware Pvt Ltd',
              gstin: '03AABCA1234F1Z5',
              stateCode: '03',
              status: 'VALIDATED',
              arn: null,
              filedAt: null,
              outwardTaxable: '750000.00',
              grossLiability: '135000.00',
              eligibleItc: '110000.00',
              cashPayable: '25000.00',
              cashBreakdown: { igst: '0.00', cgst: '12500.00', sgst: '12500.00' },
              itcClosing: '0.00',
              rule86bApplied: false,
            },
            {
              registrationId: 'reg-demo-2',
              entityId: 'ent-demo-2',
              entityName: 'Phulkari Textiles Pvt Ltd',
              gstin: '03AAFCP4821K1Z1',
              stateCode: '03',
              status: 'READY_TO_AUTOFILL',
              arn: null,
              filedAt: null,
              outwardTaxable: '500000.00',
              grossLiability: '90000.00',
              eligibleItc: '70000.00',
              cashPayable: '20000.00',
              cashBreakdown: { igst: '10000.00', cgst: '5000.00', sgst: '5000.00' },
              itcClosing: '0.00',
              rule86bApplied: false,
            },
          ],
        },
      });
    }

    try {
      const data = await db.withTenantTransaction(getCtx(request), async (client) => {
        const queryStr = `
          SELECT 
            r.id AS registration_id,
            r.gstin,
            r.state_code,
            r.rule_86b_exempt,
            e.id AS entity_id,
            e.legal_name AS entity_name,
            f.id AS filing_id,
            f.workflow_status,
            f.arn,
            f.filed_at,
            COALESCE(s.taxable_value, 0) AS outward_taxable,
            COALESCE(s.igst, 0) AS outward_igst,
            COALESCE(s.cgst, 0) AS outward_cgst,
            COALESCE(s.sgst, 0) AS outward_sgst,
            COALESCE(s.cess, 0) AS outward_cess,
            COALESCE(p.itc_igst, 0) AS itc_igst,
            COALESCE(p.itc_cgst, 0) AS itc_cgst,
            COALESCE(p.itc_sgst, 0) AS itc_sgst,
            COALESCE(p.itc_cess, 0) AS itc_cess
          FROM public.gst_registrations r
          JOIN public.entities e ON e.id = r.entity_id AND e.firm_id = app.current_firm_id()
          LEFT JOIN public.gst_filings f ON f.gst_registration_id = r.id 
            AND f.return_period = $1 
            AND f.return_type = 'GSTR3B' 
            AND f.firm_id = app.current_firm_id()
          LEFT JOIN (
            SELECT 
              gst_registration_id,
              SUM(taxable_value) AS taxable_value,
              SUM(igst_amount) AS igst,
              SUM(cgst_amount) AS cgst,
              SUM(sgst_amount) AS sgst,
              SUM(cess_amount) AS cess
            FROM public.gst_invoices_sales
            WHERE return_period = $1 AND firm_id = app.current_firm_id()
            GROUP BY gst_registration_id
          ) s ON s.gst_registration_id = r.id
          LEFT JOIN (
            SELECT 
              gst_registration_id,
              SUM(igst_amount) AS itc_igst,
              SUM(cgst_amount) AS itc_cgst,
              SUM(sgst_amount) AS itc_sgst,
              SUM(cess_amount) AS itc_cess
            FROM public.gst_2b_records
            WHERE return_period = $1 
              AND itc_available = true 
              AND ims_action_status != 'R' 
              AND firm_id = app.current_firm_id()
            GROUP BY gst_registration_id
          ) p ON p.gst_registration_id = r.id
          WHERE r.firm_id = app.current_firm_id()
          ORDER BY e.legal_name, r.gstin
        `;
        const res = await client.query(queryStr, [period]);

        let totalTurnover = new Decimal(0);
        let totalGross = new Decimal(0);
        let totalItc = new Decimal(0);
        let totalCash = new Decimal(0);
        let totalClosing = new Decimal(0);

        const statusCounts: Record<string, number> = {
          NOT_STARTED: 0,
          READY_TO_AUTOFILL: 0,
          VALIDATED: 0,
          FILED: 0,
        };

        const registrations = res.rows.map((row: any) => {
          const outwardTaxable = new Decimal(row.outward_taxable);
          const outwardIgst = new Decimal(row.outward_igst);
          const outwardCgst = new Decimal(row.outward_cgst);
          const outwardSgst = new Decimal(row.outward_sgst);
          const outwardCess = new Decimal(row.outward_cess);

          const itcIgst = new Decimal(row.itc_igst);
          const itcCgst = new Decimal(row.itc_cgst);
          const itcSgst = new Decimal(row.itc_sgst);
          const itcCess = new Decimal(row.itc_cess);

          const grossLiability = outwardIgst.plus(outwardCgst).plus(outwardSgst).plus(outwardCess);
          const eligibleItc = itcIgst.plus(itcCgst).plus(itcSgst).plus(itcCess);

          const setOff = GstItcSetOffEngine.compute({
            liability: {
              outward: { igst: outwardIgst, cgst: outwardCgst, sgst: outwardSgst, cess: outwardCess },
              rcm: { igst: '0.00', cgst: '0.00', sgst: '0.00', cess: '0.00' },
            },
            itcAvailable: {
              igst: itcIgst,
              cgst: itcCgst,
              sgst: itcSgst,
              cess: itcCess,
            },
            turnover: {
              domesticTaxable: outwardTaxable,
            },
            rule86bExemptions: {
              itPaid1LakhLast2Fy: !!row.rule_86b_exempt,
            },
          });

          const cashPayable = setOff.cashPayable.totalCashPayable;
          const itcClosing = setOff.remainingItc.igst.plus(setOff.remainingItc.cgst).plus(setOff.remainingItc.sgst);

          let rowStatus = row.workflow_status;
          if (!rowStatus) {
            rowStatus = grossLiability.gt(0) || eligibleItc.gt(0) ? 'READY_TO_AUTOFILL' : 'NOT_STARTED';
          }
          statusCounts[rowStatus] = (statusCounts[rowStatus] || 0) + 1;

          totalTurnover = totalTurnover.plus(outwardTaxable);
          totalGross = totalGross.plus(grossLiability);
          totalItc = totalItc.plus(eligibleItc);
          totalCash = totalCash.plus(cashPayable);
          totalClosing = totalClosing.plus(itcClosing);

          return {
            registrationId: row.registration_id,
            entityId: row.entity_id,
            entityName: row.entity_name,
            gstin: row.gstin,
            stateCode: row.state_code,
            status: rowStatus,
            arn: row.arn,
            filedAt: row.filed_at,
            outwardTaxable: outwardTaxable.toFixed(2),
            grossLiability: grossLiability.toFixed(2),
            eligibleItc: eligibleItc.toFixed(2),
            cashPayable: cashPayable.toFixed(2),
            cashBreakdown: {
              igst: setOff.cashPayable.outward.igst.toFixed(2),
              cgst: setOff.cashPayable.outward.cgst.toFixed(2),
              sgst: setOff.cashPayable.outward.sgst.toFixed(2),
            },
            itcClosing: itcClosing.toFixed(2),
            rule86bApplied: setOff.rule86bApplied,
          };
        });

        return {
          period,
          summary: {
            totalGstins: registrations.length,
            totalTaxableTurnover: totalTurnover.toFixed(2),
            totalGrossLiability: totalGross.toFixed(2),
            totalEligibleItc: totalItc.toFixed(2),
            totalCashPayable: totalCash.toFixed(2),
            totalItcClosing: totalClosing.toFixed(2),
            statusCounts,
          },
          registrations,
        };
      });

      return reply.send({ success: true, source: 'POSTGRESQL_RLS', data });
    } catch (err: any) {
      request.log.error(err, 'cockpit error');
      return reply.status(500).send({ error: 'Cockpit Fetch Failed', message: publicMessage(err) });
    }
  });

  // POST /api/v1/gst/gstr3b/bulk-autofill: 1-Click Practice-Wide 3B Population
  fastify.post('/gstr3b/bulk-autofill', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as { firmId: string; userId: string; role: string };
    if (!['PARTNER', 'MANAGER'].includes(user.role)) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Only Partners and Managers can perform bulk autofill' });
    }

    const body = request.body as { period?: string; registrationIds?: string[] } | undefined;
    const period = body?.period || activeGstPeriod();

    if (!db.isConfigured()) {
      return reply.send({
        success: true,
        source: 'SAMPLE_FALLBACK',
        count: 2,
        totalLiabilityAutofilled: '225000.00',
        totalCashPayable: '45000.00',
      });
    }

    const dueDate = gstr3bDueDate(period);

    try {
      const result = await db.withTenantTransaction(getCtx(request), async (client) => {
        let regQuery = `
          SELECT 
            r.id AS registration_id,
            r.entity_id,
            r.gstin,
            r.rule_86b_exempt,
            COALESCE(s.taxable_value, 0) AS outward_taxable,
            COALESCE(s.igst, 0) AS outward_igst,
            COALESCE(s.cgst, 0) AS outward_cgst,
            COALESCE(s.sgst, 0) AS outward_sgst,
            COALESCE(s.cess, 0) AS outward_cess,
            COALESCE(p.itc_igst, 0) AS itc_igst,
            COALESCE(p.itc_cgst, 0) AS itc_cgst,
            COALESCE(p.itc_sgst, 0) AS itc_sgst,
            COALESCE(p.itc_cess, 0) AS itc_cess
          FROM public.gst_registrations r
          JOIN public.entities e ON e.id = r.entity_id AND e.firm_id = app.current_firm_id()
          LEFT JOIN (
            SELECT 
              gst_registration_id,
              SUM(taxable_value) AS taxable_value,
              SUM(igst_amount) AS igst,
              SUM(cgst_amount) AS cgst,
              SUM(sgst_amount) AS sgst,
              SUM(cess_amount) AS cess
            FROM public.gst_invoices_sales
            WHERE return_period = $1 AND firm_id = app.current_firm_id()
            GROUP BY gst_registration_id
          ) s ON s.gst_registration_id = r.id
          LEFT JOIN (
            SELECT 
              gst_registration_id,
              SUM(igst_amount) AS itc_igst,
              SUM(cgst_amount) AS itc_cgst,
              SUM(sgst_amount) AS itc_sgst,
              SUM(cess_amount) AS itc_cess
            FROM public.gst_2b_records
            WHERE return_period = $1 AND itc_available = true AND ims_action_status != 'R' AND firm_id = app.current_firm_id()
            GROUP BY gst_registration_id
          ) p ON p.gst_registration_id = r.id
          WHERE r.firm_id = app.current_firm_id()
        `;
        const params: any[] = [period];
        if (body?.registrationIds && body.registrationIds.length > 0) {
          regQuery += ` AND r.id = ANY($2::uuid[])`;
          params.push(body.registrationIds);
        }

        const regs = await client.query(regQuery, params);
        let count = 0;
        let totalAutofilled = new Decimal(0);
        let totalCash = new Decimal(0);

        for (const row of regs.rows) {
          const outwardTaxable = new Decimal(row.outward_taxable);
          const outwardIgst = new Decimal(row.outward_igst);
          const outwardCgst = new Decimal(row.outward_cgst);
          const outwardSgst = new Decimal(row.outward_sgst);
          const outwardCess = new Decimal(row.outward_cess);

          const itcIgst = new Decimal(row.itc_igst);
          const itcCgst = new Decimal(row.itc_cgst);
          const itcSgst = new Decimal(row.itc_sgst);
          const itcCess = new Decimal(row.itc_cess);

          const grossLiability = outwardIgst.plus(outwardCgst).plus(outwardSgst).plus(outwardCess);
          const totalItc = itcIgst.plus(itcCgst).plus(itcSgst).plus(itcCess);

          const setOff = GstItcSetOffEngine.compute({
            liability: {
              outward: { igst: outwardIgst, cgst: outwardCgst, sgst: outwardSgst, cess: outwardCess },
              rcm: { igst: '0.00', cgst: '0.00', sgst: '0.00', cess: '0.00' },
            },
            itcAvailable: {
              igst: itcIgst,
              cgst: itcCgst,
              sgst: itcSgst,
              cess: itcCess,
            },
            turnover: {
              domesticTaxable: outwardTaxable,
            },
            rule86bExemptions: {
              itPaid1LakhLast2Fy: !!row.rule_86b_exempt,
            },
          });

          const cashPayable = setOff.cashPayable.totalCashPayable;

          const submissionPayload = {
            table31: {
              taxable: outwardTaxable.toFixed(2),
              igst: outwardIgst.toFixed(2),
              cgst: outwardCgst.toFixed(2),
              sgst: outwardSgst.toFixed(2),
              cess: outwardCess.toFixed(2),
            },
            table4: {
              eligibleItc: {
                igst: itcIgst.toFixed(2),
                cgst: itcCgst.toFixed(2),
                sgst: itcSgst.toFixed(2),
                cess: itcCess.toFixed(2),
              },
            },
            setOffSummary: {
              itcUtilized: setOff.itcUtilization.totalItcUtilized.toFixed(2),
              remainingItc: {
                igst: setOff.remainingItc.igst.toFixed(2),
                cgst: setOff.remainingItc.cgst.toFixed(2),
                sgst: setOff.remainingItc.sgst.toFixed(2),
              },
              cashShortfall: {
                igst: setOff.cashPayable.outward.igst.toFixed(2),
                cgst: setOff.cashPayable.outward.cgst.toFixed(2),
                sgst: setOff.cashPayable.outward.sgst.toFixed(2),
                total: cashPayable.toFixed(2),
              },
              rule86bApplied: setOff.rule86bApplied,
            },
            autofilledAt: new Date().toISOString(),
          };

          await client.query(
            `INSERT INTO public.gst_filings (
               firm_id, entity_id, gst_registration_id, return_period, return_type,
               workflow_status, statutory_due_date, gross_tax_liability, total_itc_claimed,
               net_cash_paid, submission_payload, created_by
             ) VALUES (
               app.current_firm_id(), $1, $2, $3, 'GSTR3B',
               'VALIDATED'::public.filing_workflow_status, $4, $5, $6, $7, $8, $9
             )
             ON CONFLICT (firm_id, gst_registration_id, return_period, return_type)
             DO UPDATE SET
               workflow_status = CASE WHEN gst_filings.workflow_status = 'FILED'::public.filing_workflow_status THEN 'FILED'::public.filing_workflow_status ELSE 'VALIDATED'::public.filing_workflow_status END,
               gross_tax_liability = EXCLUDED.gross_tax_liability,
               total_itc_claimed = EXCLUDED.total_itc_claimed,
               net_cash_paid = EXCLUDED.net_cash_paid,
               submission_payload = EXCLUDED.submission_payload,
               updated_at = now()`,
            [
              row.entity_id,
              row.registration_id,
              period,
              dueDate,
              grossLiability.toFixed(2),
              totalItc.toFixed(2),
              cashPayable.toFixed(2),
              JSON.stringify(submissionPayload),
              user.userId,
            ]
          );

          count += 1;
          totalAutofilled = totalAutofilled.plus(grossLiability);
          totalCash = totalCash.plus(cashPayable);
        }

        return {
          count,
          totalLiabilityAutofilled: totalAutofilled.toFixed(2),
          totalCashPayable: totalCash.toFixed(2),
        };
      });

      return reply.send({ success: true, ...result });
    } catch (err: any) {
      request.log.error(err, 'bulk autofill error');
      return reply.status(500).send({ error: 'Bulk Autofill Failed', message: publicMessage(err) });
    }
  });
}
