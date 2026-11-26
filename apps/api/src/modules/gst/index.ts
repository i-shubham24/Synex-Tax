import type { FastifyInstance } from 'fastify';
import { salesRoutes } from './sales.routes.js';
import { gstr1Routes } from './gstr1.routes.js';
import { reconRoutes } from './recon.routes.js';
import { imsRoutes } from './ims.routes.js';
import { gstr3bRoutes } from './gstr3b.routes.js';

export async function gstModuleRoutes(fastify: FastifyInstance) {
  fastify.register(salesRoutes);
  fastify.register(gstr1Routes);
  fastify.register(reconRoutes);
  fastify.register(imsRoutes);
  fastify.register(gstr3bRoutes);
}
