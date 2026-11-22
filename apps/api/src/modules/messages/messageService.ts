import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { detectPortalFile, sha256, storageKey, type FileStore } from '../storage/fileStore.js';
import { MESSAGE_KEY_VERSION, decryptMessage, encryptMessage } from './messageCrypto.js';

/**
 * Messages between a firm and one client entity. Every function runs inside a tenant
 * transaction opened for the signed-in user, so row-level security decides which entities and
 * messages exist; nothing here filters by role on its own. The side is the caller's: the
 * database refuses a message whose side does not match the sender's role.
 */
export type Side = 'FIRM' | 'CLIENT';

export interface MessageView {
  id: string;
  entityId: string;
  side: Side;
  senderName: string;
  body: string | null;
  sentAt: string;
  readByFirmAt: string | null;
  readByClientAt: string | null;
  attachments: Array<{ id: string; name: string; mimeType: string; sizeBytes: number }>;
}

export const MAX_BODY = 4000;

/** The entity's name if the caller may see it, else null. */
export async function visibleEntity(c: pg.PoolClient, entityId: string): Promise<{ id: string; name: string } | null> {
  const r = await c.query<{ id: string; name: string }>('SELECT id, legal_name AS name FROM public.entities WHERE id = $1', [entityId]);
  return r.rows[0] ?? null;
}

function view(r: any): MessageView {
  let body: string | null = null;
  try {
    body = decryptMessage(r.body_ciphertext, r.firm_id, r.entity_id, r.id);
  } catch {
    body = null; // wrong key or a damaged row: shown as unreadable, never as someone else's text
  }
  const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
  return {
    id: r.id,
    entityId: r.entity_id,
    side: r.sender_side,
    senderName: r.sender_name,
    body,
    sentAt: new Date(r.created_at).toISOString(),
    readByFirmAt: iso(r.read_by_firm_at),
    readByClientAt: iso(r.read_by_client_at),
    attachments: (r.attachments ?? []).map((a: any) => ({ id: a.id, name: a.original_name, mimeType: a.mime_type, sizeBytes: a.size_bytes })),
  };
}

/** The latest messages of an entity's conversation, oldest first. */
export async function listMessages(c: pg.PoolClient, entityId: string, limit = 200): Promise<MessageView[]> {
  const r = await c.query(
    `SELECT * FROM (
       SELECT m.id, m.firm_id, m.entity_id, m.sender_side, m.sender_name, m.body_ciphertext, m.created_at, m.read_by_firm_at, m.read_by_client_at,
              (SELECT json_agg(json_build_object('id', a.id, 'original_name', a.original_name, 'mime_type', a.mime_type, 'size_bytes', a.size_bytes) ORDER BY a.created_at)
                 FROM public.client_message_attachments a WHERE a.message_id = m.id) AS attachments
       FROM public.client_messages m
       WHERE m.entity_id = $1
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT $2
     ) x ORDER BY created_at, id`,
    [entityId, limit],
  );
  return r.rows.map(view);
}

async function senderName(c: pg.PoolClient): Promise<string> {
  const r = await c.query<{ display_name: string }>('SELECT display_name FROM public.users WHERE id = app.current_user_id()');
  return (r.rows[0]?.display_name ?? 'Unknown').slice(0, 150);
}

async function conversationFor(c: pg.PoolClient, entityId: string): Promise<string> {
  const r = await c.query<{ id: string }>(
    `INSERT INTO public.client_conversations (firm_id, entity_id, last_message_at) VALUES (app.current_firm_id(), $1, now())
     ON CONFLICT (firm_id, entity_id) DO UPDATE SET last_message_at = EXCLUDED.last_message_at
     RETURNING id`,
    [entityId],
  );
  return r.rows[0].id;
}

/** Writes one message; the body is encrypted before it reaches the database. */
export async function sendMessage(c: pg.PoolClient, firmId: string, entityId: string, side: Side, body: string): Promise<string> {
  const id = randomUUID();
  const conversationId = await conversationFor(c, entityId);
  const name = await senderName(c);
  const cipher = encryptMessage(body, firmId, entityId, id);
  await c.query(
    `INSERT INTO public.client_messages (id, firm_id, entity_id, conversation_id, sender_user_id, sender_side, sender_name, body_ciphertext, key_version, read_by_firm_at, read_by_client_at)
     VALUES ($1, app.current_firm_id(), $2, $3, app.current_user_id(), $4::text, $5, $6, $7, CASE WHEN $4::text = 'FIRM' THEN now() END, CASE WHEN $4::text = 'CLIENT' THEN now() END)`,
    [id, entityId, conversationId, side, name, cipher, MESSAGE_KEY_VERSION],
  );
  return id;
}

export type AttachmentCheck = { ok: true; mime: string; ext: string } | { ok: false; status: number; message: string };

/** Magic bytes decide the type; only JPEG, PNG and PDF up to 10 MB are taken. */
export function checkAttachment(body: unknown): AttachmentCheck {
  if (!Buffer.isBuffer(body) || body.length === 0) return { ok: false, status: 400, message: 'The file is empty.' };
  const kind = detectPortalFile(body);
  if (!kind) return { ok: false, status: 415, message: 'Attach a photo (JPEG or PNG) or a PDF.' };
  return { ok: true, mime: kind.mime, ext: kind.ext };
}

export function cleanFileName(raw: string | undefined, ext: string): string {
  let decoded = String(raw ?? '');
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    /* a malformed name is used as sent, then cleaned */
  }
  return decoded.replace(/[^\w .()-]+/g, '_').slice(0, 100) || `attachment.${ext}`;
}

/** A message that carries one file, with an optional caption. The file is written once under a new key. */
export async function sendAttachment(
  c: pg.PoolClient,
  store: FileStore,
  firmId: string,
  entityId: string,
  side: Side,
  file: Buffer,
  kind: { mime: string; ext: string },
  name: string,
  caption = '',
): Promise<{ messageId: string; attachmentId: string }> {
  const messageId = await sendMessage(c, firmId, entityId, side, caption);
  const key = storageKey(firmId, entityId, kind.ext);
  await store.put(key, file);
  const r = await c.query<{ id: string }>(
    `INSERT INTO public.client_message_attachments (firm_id, entity_id, message_id, storage_key, original_name, mime_type, size_bytes, sha256, uploaded_by)
     VALUES (app.current_firm_id(), $1, $2, $3, $4, $5, $6, $7, app.current_user_id()) RETURNING id`,
    [entityId, messageId, key, name, kind.mime, file.length, sha256(file)],
  );
  return { messageId, attachmentId: r.rows[0].id };
}

/** Marks the other side's messages in this conversation as read by the caller's side. */
export async function markRead(c: pg.PoolClient, entityId: string, side: Side): Promise<number> {
  const r =
    side === 'CLIENT'
      ? await c.query(`UPDATE public.client_messages SET read_by_client_at = now() WHERE entity_id = $1 AND read_by_client_at IS NULL`, [entityId])
      : await c.query(`UPDATE public.client_messages SET read_by_firm_at = now() WHERE entity_id = $1 AND read_by_firm_at IS NULL`, [entityId]);
  return r.rowCount ?? 0;
}

/** An attachment the caller may see, with its stored checksum. */
export async function findAttachment(c: pg.PoolClient, id: string) {
  const r = await c.query<{ storage_key: string; original_name: string; mime_type: string; sha256: string }>(
    'SELECT storage_key, original_name, mime_type, sha256 FROM public.client_message_attachments WHERE id = $1',
    [id],
  );
  return r.rows[0] ?? null;
}

/** Conversations the caller can see, newest first, with the count unread by the caller's side and a short preview. */
export async function listConversations(c: pg.PoolClient, side: Side) {
  const unreadCol = side === 'CLIENT' ? 'read_by_client_at' : 'read_by_firm_at';
  const r = await c.query(
    `SELECT cv.entity_id, e.legal_name AS entity_name, cv.last_message_at,
            (SELECT count(*)::int FROM public.client_messages m WHERE m.conversation_id = cv.id AND m.${unreadCol} IS NULL) AS unread,
            lm.id AS last_id, lm.firm_id AS last_firm_id, lm.body_ciphertext AS last_body, lm.sender_side AS last_side,
            (SELECT count(*)::int FROM public.client_message_attachments a WHERE a.message_id = lm.id) AS last_files
     FROM public.client_conversations cv
     JOIN public.entities e ON e.firm_id = cv.firm_id AND e.id = cv.entity_id
     LEFT JOIN LATERAL (
       SELECT m.id, m.firm_id, m.body_ciphertext, m.sender_side FROM public.client_messages m
       WHERE m.conversation_id = cv.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1
     ) lm ON true
     ORDER BY cv.last_message_at DESC NULLS LAST
     LIMIT 500`,
  );
  return r.rows.map((row: any) => {
    let preview: string | null = null;
    if (row.last_id) {
      try {
        preview = decryptMessage(row.last_body, row.last_firm_id, row.entity_id, row.last_id).slice(0, 120);
      } catch {
        preview = null;
      }
      if (!preview && row.last_files) preview = 'Sent a file';
    }
    return {
      entityId: row.entity_id as string,
      entityName: row.entity_name as string,
      lastMessageAt: row.last_message_at ? new Date(row.last_message_at).toISOString() : null,
      lastSide: (row.last_side ?? null) as Side | null,
      unread: row.unread as number,
      preview,
    };
  });
}
