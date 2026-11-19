import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import crypto from 'node:crypto';
import {
  ClientGroupCreateSchema,
  EntityCreateSchema,
  GstRegistrationCreateSchema,
  TanRegistrationCreateSchema,
} from '@synextax/shared-schemas';
import { validateGstin, validatePan } from '@synextax/tax-engine';

interface ClientGroupRecord {
  id: string;
  firmId: string;
  groupName: string;
  description?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactMobile?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface LegalEntityRecord {
  id: string;
  firmId: string;
  clientGroupId: string;
  pan: string;
  legalName: string;
  tradeName?: string;
  constitution: string;
  msmeUdyamNumber?: string;
  isRule14bEco: boolean;
  rule86bExempt: boolean;
  rule86bExemptReason?: string;
  accountingSoftware: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface GstRegistrationRecord {
  id: string;
  firmId: string;
  entityId: string;
  gstin: string;
  stateCode: string;
  stateName: string;
  legalName?: string;
  tradeName?: string;
  registrationType: string;
  filingFrequency: string;
  isEinvoiceApplicable: boolean;
  isEwbApplicable: boolean;
  portalAuthStatus: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface TanRegistrationRecord {
  id: string;
  firmId: string;
  entityId: string;
  tan: string;
  deductorType: string;
  deductorBranch?: string;
  tracesAuthStatus: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export async function clientMasterRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  const clientGroups: ClientGroupRecord[] = [
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      firmId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      groupName: 'Amritsar Textiles Group',
      description: 'Major spinning, weaving, and fabric export conglomerate based in Amritsar & Ludhiana',
      primaryContactName: 'Harpreet Singh',
      primaryContactEmail: 'harpreet@amritsartextiles.com',
      primaryContactMobile: '9814012345',
      status: 'ACTIVE',
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-01-15T10:00:00Z',
    },
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-bbbbbbbbbbbb',
      firmId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      groupName: 'Majha Agro Foods',
      description: 'Basmati rice milling, processing and retail brand',
      primaryContactName: 'Gurinder Gill',
      primaryContactEmail: 'accounts@majhafoods.com',
      primaryContactMobile: '9872054321',
      status: 'ACTIVE',
      createdAt: '2026-02-10T11:30:00Z',
      updatedAt: '2026-02-10T11:30:00Z',
    },
  ];

  const entities: LegalEntityRecord[] = [
    {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-111111111111',
      firmId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      clientGroupId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      pan: 'AABCA1234F',
      legalName: 'Amritsar Textiles Private Limited',
      tradeName: 'Golden Thread Fabrics',
      constitution: 'PRIVATE_LIMITED',
      msmeUdyamNumber: 'UDYAM-PB-02-0012345',
      isRule14bEco: false,
      rule86bExempt: false,
      accountingSoftware: 'TALLY_PRIME',
      status: 'ACTIVE',
      createdAt: '2026-01-15T10:15:00Z',
      updatedAt: '2026-01-15T10:15:00Z',
    },
    {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-222222222222',
      firmId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      clientGroupId: 'aaaaaaaa-aaaa-aaaa-aaaa-bbbbbbbbbbbb',
      pan: 'ABCPA5678F',
      legalName: 'Gurinder Gill (HUF)',
      tradeName: 'Majha Agro Mills',
      constitution: 'HUF',
      msmeUdyamNumber: 'UDYAM-PB-02-0098765',
      isRule14bEco: false,
      rule86bExempt: true,
      rule86bExemptReason: 'Income tax paid > 1 Lakh in previous 2 assessment years',
      accountingSoftware: 'BUSY',
      status: 'ACTIVE',
      createdAt: '2026-02-10T11:45:00Z',
      updatedAt: '2026-02-10T11:45:00Z',
    },
  ];

  const gstRegistrations: GstRegistrationRecord[] = [
    {
      id: 'cccccccc-cccc-cccc-cccc-111111111111',
      firmId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      entityId: 'bbbbbbbb-bbbb-bbbb-bbbb-111111111111',
      gstin: '03AABCA1234F1Z5',
      stateCode: '03',
      stateName: 'Punjab',
      legalName: 'Amritsar Textiles Private Limited',
      tradeName: 'Golden Thread Fabrics',
      registrationType: 'REGULAR',
      filingFrequency: 'MONTHLY',
      isEinvoiceApplicable: true,
      isEwbApplicable: true,
      portalAuthStatus: 'ACTIVE_SESSION',
      status: 'ACTIVE',
      createdAt: '2026-01-15T10:30:00Z',
      updatedAt: '2026-01-15T10:30:00Z',
    },
    {
      id: 'cccccccc-cccc-cccc-cccc-222222222222',
      firmId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      entityId: 'bbbbbbbb-bbbb-bbbb-bbbb-111111111111',
      gstin: '07AABCA1234F1Z3',
      stateCode: '07',
      stateName: 'Delhi',
      legalName: 'Amritsar Textiles Private Limited (Delhi Depot)',
      tradeName: 'Golden Thread Fabrics Delhi',
      registrationType: 'REGULAR',
      filingFrequency: 'MONTHLY',
      isEinvoiceApplicable: true,
      isEwbApplicable: true,
      portalAuthStatus: 'ACTIVE_SESSION',
      status: 'ACTIVE',
      createdAt: '2026-01-20T14:00:00Z',
      updatedAt: '2026-01-20T14:00:00Z',
    },
  ];

  const tanRegistrations: TanRegistrationRecord[] = [
    {
      id: 'dddddddd-dddd-dddd-dddd-111111111111',
      firmId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      entityId: 'bbbbbbbb-bbbb-bbbb-bbbb-111111111111',
      tan: 'PTLA12345B',
      deductorType: 'COMPANY',
      deductorBranch: 'Head Office Amritsar',
      tracesAuthStatus: 'VALID',
      status: 'ACTIVE',
      createdAt: '2026-01-15T11:00:00Z',
      updatedAt: '2026-01-15T11:00:00Z',
    },
  ];

  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Valid JWT session token required' });
    }
  });

  // 1. Unified 4-Tier Hierarchy Tree Endpoint
  fastify.get('/tree', async (request, reply) => {
    const firmId = request.user?.firmId;

    const tree = clientGroups
      .filter((g) => g.firmId === firmId)
      .map((group) => {
        const groupEntities = entities
          .filter((e) => e.clientGroupId === group.id && e.firmId === firmId)
          .map((entity) => {
            const entityGstins = gstRegistrations.filter((g) => g.entityId === entity.id);
            const entityTans = tanRegistrations.filter((t) => t.entityId === entity.id);
            return {
              ...entity,
              gstRegistrations: entityGstins,
              tanRegistrations: entityTans,
            };
          });

        return {
          ...group,
          entities: groupEntities,
        };
      });

    return reply.send({
      firmId,
      totalGroups: tree.length,
      totalEntities: entities.filter((e) => e.firmId === firmId).length,
      totalGstins: gstRegistrations.filter((g) => g.firmId === firmId).length,
      totalTans: tanRegistrations.filter((t) => t.firmId === firmId).length,
      groups: tree,
    });
  });

  // 2. Client Groups
  fastify.get('/client-groups', async (request, reply) => {
    const firmId = request.user?.firmId;
    const list = clientGroups.filter((g) => g.firmId === firmId);
    return reply.send(list);
  });

  fastify.post('/client-groups', async (request, reply) => {
    const firmId = request.user?.firmId;
    if (!firmId) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Missing firm identity in authentication token' });
    }

    if (request.user?.role === 'STAFF') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Staff members have read-only access to client directory' });
    }

    const parse = ClientGroupCreateSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }

    const newGroup: ClientGroupRecord = {
      id: crypto.randomUUID(),
      firmId,
      groupName: parse.data.groupName,
      description: parse.data.description,
      primaryContactName: parse.data.primaryContactName,
      primaryContactEmail: parse.data.primaryContactEmail,
      primaryContactMobile: parse.data.primaryContactMobile,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    clientGroups.push(newGroup);
    return reply.status(201).send(newGroup);
  });

  // 3. Legal Entities
  fastify.get('/entities', async (request, reply) => {
    const firmId = request.user?.firmId;
    const list = entities.filter((e) => e.firmId === firmId);
    return reply.send(list);
  });

  fastify.post('/entities', async (request, reply) => {
    const firmId = request.user?.firmId;
    if (!firmId) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Missing firm identity in authentication token' });
    }

    if (request.user?.role === 'STAFF') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Staff members have read-only access to client directory' });
    }

    const parse = EntityCreateSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }

    // BOLA Guard: Verify parent client group belongs to this authenticated firm
    const parentGroup = clientGroups.find((g) => g.id === parse.data.clientGroupId && g.firmId === firmId);
    if (!parentGroup) {
      return reply.status(403).send({
        error: 'FORBIDDEN_OBJECT_ACCESS',
        message: 'Parent client group not found or does not belong to your firm (BOLA guard).',
      });
    }

    const panResult = validatePan(parse.data.pan);
    if (!panResult.isValid) {
      return reply.status(400).send({ error: 'Invalid PAN', message: panResult.error });
    }

    const newEntity: LegalEntityRecord = {
      id: crypto.randomUUID(),
      firmId,
      clientGroupId: parse.data.clientGroupId,
      pan: parse.data.pan,
      legalName: parse.data.legalName,
      tradeName: parse.data.tradeName,
      constitution: parse.data.constitution,
      msmeUdyamNumber: parse.data.msmeUdyamNumber,
      isRule14bEco: parse.data.isRule14bEco,
      rule86bExempt: parse.data.rule86bExempt,
      rule86bExemptReason: parse.data.rule86bExemptReason,
      accountingSoftware: parse.data.accountingSoftware,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    entities.push(newEntity);
    return reply.status(201).send(newEntity);
  });

  // 4. GST Registrations
  fastify.get('/gst-registrations', async (request, reply) => {
    const firmId = request.user?.firmId;
    const list = gstRegistrations.filter((g) => g.firmId === firmId);
    return reply.send(list);
  });

  fastify.post('/gst-registrations', async (request, reply) => {
    const firmId = request.user?.firmId;
    if (!firmId) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Missing firm identity in authentication token' });
    }

    if (request.user?.role === 'STAFF') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Staff members have read-only access to client directory' });
    }

    const parse = GstRegistrationCreateSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }

    // BOLA Guard: Verify parent legal entity belongs to this authenticated firm
    const parentEntity = entities.find((e) => e.id === parse.data.entityId && e.firmId === firmId);
    if (!parentEntity) {
      return reply.status(403).send({
        error: 'FORBIDDEN_OBJECT_ACCESS',
        message: 'Parent legal entity not found or does not belong to your firm (BOLA guard).',
      });
    }

    const gstinResult = validateGstin(parse.data.gstin);
    if (!gstinResult.isValid) {
      return reply.status(400).send({
        error: 'Statutory GSTIN Validation Failed',
        message: gstinResult.error,
      });
    }

    const newGstin: GstRegistrationRecord = {
      id: crypto.randomUUID(),
      firmId,
      entityId: parse.data.entityId,
      gstin: parse.data.gstin,
      stateCode: parse.data.stateCode,
      stateName: gstinResult.stateName || 'Punjab',
      legalName: parse.data.legalName,
      tradeName: parse.data.tradeName,
      registrationType: parse.data.registrationType,
      filingFrequency: parse.data.filingFrequency,
      isEinvoiceApplicable: parse.data.isEinvoiceApplicable,
      isEwbApplicable: parse.data.isEwbApplicable,
      portalAuthStatus: 'NEVER_AUTHENTICATED',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    gstRegistrations.push(newGstin);
    return reply.status(201).send(newGstin);
  });

  // 5. TAN Registrations
  fastify.get('/tan-registrations', async (request, reply) => {
    const firmId = request.user?.firmId;
    const list = tanRegistrations.filter((t) => t.firmId === firmId);
    return reply.send(list);
  });

  fastify.post('/tan-registrations', async (request, reply) => {
    const firmId = request.user?.firmId;
    if (!firmId) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Missing firm identity in authentication token' });
    }

    if (request.user?.role === 'STAFF') {
      return reply.status(403).send({ error: 'Forbidden', message: 'Staff members have read-only access to client directory' });
    }

    const parse = TanRegistrationCreateSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({ error: 'Validation Error', details: parse.error.format() });
    }

    // BOLA Guard: Verify parent legal entity belongs to this authenticated firm
    const parentEntity = entities.find((e) => e.id === parse.data.entityId && e.firmId === firmId);
    if (!parentEntity) {
      return reply.status(403).send({
        error: 'FORBIDDEN_OBJECT_ACCESS',
        message: 'Parent legal entity not found or does not belong to your firm (BOLA guard).',
      });
    }

    const newTan: TanRegistrationRecord = {
      id: crypto.randomUUID(),
      firmId,
      entityId: parse.data.entityId,
      tan: parse.data.tan,
      deductorType: parse.data.deductorType,
      deductorBranch: parse.data.deductorBranch,
      tracesAuthStatus: 'NOT_CONFIGURED',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    tanRegistrations.push(newTan);
    return reply.status(201).send(newTan);
  });
}
