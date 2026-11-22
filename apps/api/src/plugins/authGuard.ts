import { FastifyRequest, FastifyReply } from 'fastify';
import { UserRole } from '@synextax/shared-schemas';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: string;
      firmId: string;
      identityId: string;
      role: UserRole;
      email: string;
      displayName: string;
    };
    user: {
      userId: string;
      firmId: string;
      identityId: string;
      role: UserRole;
      email: string;
      displayName: string;
    };
  }
}

export function requireRole(allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (!allowedRoles.includes(request.user.role)) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `Role '${request.user.role}' is not authorized to access this resource. Allowed roles: ${allowedRoles.join(', ')}`,
      });
    }
  };
}

/**
 * Maker-Checker Guard: Under Section 39/Rule 26 and ICAI code of ethics,
 * preparation (Maker) is strictly segregated from signing and filing (Checker).
 * STAFF role cannot approve or file returns or offset liabilities.
 */
export async function enforceMakerCheckerGuard(
  request: FastifyRequest,
  reply: FastifyReply,
  action: 'SIGN' | 'FILE' | 'APPROVE' | 'OFFSET_LIABILITY'
) {
  if (!request.user) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  // Clients never sign or file; staff prepare and a partner or manager signs and files.
  if (request.user.role === 'CLIENT') {
    return reply.status(403).send({ error: 'Forbidden', message: `A client login cannot perform ${action}.` });
  }
  if (request.user.role === 'STAFF') {
    return reply.status(403).send({
      statusCode: 403,
      error: 'Segregation of Duties Violation',
      message: `Staff members are designated as return preparers (Makers) and cannot perform Checker actions (${action}). A Partner or authorized Manager must sign and file.`,
    });
  }
}
