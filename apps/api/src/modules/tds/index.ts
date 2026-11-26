import type { FastifyInstance } from 'fastify';
import { challansRoutes } from './challans.routes.js';
import { deducteesRoutes } from './deductees.routes.js';
import { form141Routes } from './form141.routes.js';
import { fvuRoutes } from './fvu.routes.js';
import { tracesRoutes } from './traces.routes.js';

export async function tdsModuleRoutes(fastify: FastifyInstance) {
  fastify.register(challansRoutes);
  fastify.register(deducteesRoutes);
  fastify.register(form141Routes);
  fastify.register(fvuRoutes);
  fastify.register(tracesRoutes);
}
