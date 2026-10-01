import { prisma } from './db.js';
import { auth, appOrigin } from './auth.js';
import type { Conversation, Organization, DocumentMetadata } from '@relay/shared';
import type { Prisma } from './generated/prisma/client.js';

class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
function fail(message: string, status = 400): never {
  throw new ApiError(message, status);
}
function text(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    fail(`${name} is required and must be at most ${max} characters.`);
  return value.trim();
}
const chatInclude = { messages: { orderBy: { sequence: 'asc' as const } } };
const organizationInclude = { _count: { select: { conversations: true, documents: true } } };
const documentSelect = { id: true, name: true, size: true, type: true, createdAt: true } as const;
type DbChat = Prisma.ConversationGetPayload<{ include: typeof chatInclude }>;
type DbOrganization = Prisma.OrganizationGetPayload<{ include: typeof organizationInclude }>;
const chatDto = (c: DbChat): Conversation => ({
  id: c.id,
  title: c.title,
  updated: c.updatedAt.getTime(),
  messages: c.messages.map((m) => ({
    id: m.id,
    role: m.role,
    text: m.text,
    createdAt: m.createdAt.getTime(),
  })),
});
const orgDto = (o: DbOrganization): Organization => ({
  id: o.id,
  name: o.name,
  description: o.description,
  createdAt: o.createdAt.getTime(),
  conversationCount: o._count.conversations,
  documentCount: o._count.documents,
});
const docDto = (
  d: Prisma.DocumentGetPayload<{ select: typeof documentSelect }>,
): DocumentMetadata => ({ ...d, createdAt: d.createdAt.getTime() });

async function body(request: Request): Promise<Request> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (reader)
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 6 * 1024 * 1024) {
        await reader.cancel();
        fail('Request exceeds 6 MB.', 413);
      }
      chunks.push(value);
    }
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: Buffer.concat(chunks),
  });
}
async function json(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await (await body(request)).json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    fail('Invalid JSON body.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Expected a JSON object.');
  return value as Record<string, unknown>;
}

export async function handle(request: Request, segments: string[]): Promise<Response> {
  try {
    const method = request.method;
    if (!['GET', 'POST'].includes(method))
      return Response.json(
        { error: 'Method not allowed.' },
        { status: 405, headers: { Allow: 'GET, POST' } },
      );
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) fail('Sign in to continue.', 401);
    if (!session.user.emailVerified)
      fail('Verify your email before accessing your workspace.', 403);
    if (method === 'POST' && request.headers.get('origin') !== appOrigin)
      fail('Invalid request origin.', 403);
    if (segments[0] !== 'organizations') fail('Not found.', 404);
    const userId = session.user.id;
    let result: unknown;
    if (segments.length === 1) {
      if (method === 'GET')
        result = (
          await prisma.organization.findMany({
            where: { memberships: { some: { userId } } },
            include: organizationInclude,
            orderBy: { createdAt: 'asc' },
          })
        ).map(orgDto);
      else {
        const payload = await json(request);
        const name = text(payload.name, 'Organization name', 60);
        if (
          payload.description != null &&
          (typeof payload.description !== 'string' || payload.description.length > 500)
        )
          fail('Description must be at most 500 characters.');
        result = orgDto(
          await prisma.organization.create({
            data: {
              name,
              description:
                typeof payload.description === 'string' ? payload.description.trim() : '',
              memberships: { create: { userId } },
            },
            include: organizationInclude,
          }),
        );
      }
    } else {
      const organizationId = segments[1];
      const membership = await prisma.membership.findUnique({
        where: { userId_organizationId: { userId, organizationId } },
      });
      if (!membership) fail('Organization not found.', 404);
      if (segments.length === 2 && method === 'GET')
        result = orgDto(
          await prisma.organization.findUniqueOrThrow({
            where: { id: organizationId },
            include: organizationInclude,
          }),
        );
      else if (segments[2] === 'documents' && segments.length === 3) {
        if (method === 'GET')
          result = (
            await prisma.document.findMany({
              where: { organizationId },
              select: documentSelect,
              orderBy: { createdAt: 'desc' },
            })
          ).map(docDto);
        else {
          const buffered = await body(request);
          let form: FormData;
          try {
            form = await buffered.formData();
          } catch {
            fail('Send a multipart form with a file field.');
          }
          const file = form.get('file');
          if (!(file instanceof File) || !file.size) fail('A nonempty file is required.');
          if (file.size > 5 * 1024 * 1024) fail('Files must be at most 5 MB.', 413);
          if (!/\.(pdf|txt|md|docx)$/i.test(file.name))
            fail('Supported files: PDF, TXT, MD, DOCX.');
          result = docDto(
            await prisma.document.create({
              data: {
                organizationId,
                name: file.name.slice(0, 200),
                size: file.size,
                type: file.type || 'application/octet-stream',
                content: new Uint8Array(await file.arrayBuffer()),
              },
              select: documentSelect,
            }),
          );
        }
      } else if (segments[2] === 'conversations') {
        if (segments.length === 3) {
          if (method === 'GET')
            result = (
              await prisma.conversation.findMany({
                where: { organizationId },
                include: chatInclude,
                orderBy: { updatedAt: 'desc' },
              })
            ).map(chatDto);
          else {
            const payload = await json(request);
            result = chatDto(
              await prisma.conversation.create({
                data: {
                  organizationId,
                  title:
                    payload.title == null ? 'New conversation' : text(payload.title, 'Title', 100),
                },
                include: chatInclude,
              }),
            );
          }
        } else {
          const id = segments[3];
          const conversation = await prisma.conversation.findFirst({
            where: { id, organizationId },
            include: chatInclude,
          });
          if (!conversation) fail('Conversation not found.', 404);
          if (segments.length === 4 && method === 'GET') result = chatDto(conversation);
          else if (segments.length === 5 && segments[4] === 'messages') {
            if (method === 'GET') result = chatDto(conversation).messages;
            else {
              const message = text((await json(request)).text, 'Message', 2000);
              result = await prisma.$transaction(async (tx) => {
                // Lock this conversation before assigning message sequence numbers.
                await tx.conversation.update({ where: { id }, data: { updatedAt: new Date() } });
                const count = await tx.message.count({ where: { conversationId: id } });
                const saved = await tx.conversation.update({
                  where: { id },
                  data: {
                    ...(count === 0 ? { title: message.slice(0, 60) } : {}),
                    messages: {
                      create: [
                        { role: 'user', text: message, sequence: count },
                        {
                          role: 'assistant',
                          text: 'Thanks for your message! This is a demo reply. Your message has been saved; an AI assistant can be connected later.',
                          sequence: count + 1,
                        },
                      ],
                    },
                  },
                  include: chatInclude,
                });
                return chatDto(saved);
              });
            }
          } else fail('Not found.', 404);
        }
      } else fail('Not found.', 404);
    }
    return Response.json(result, {
      status: method === 'POST' ? 201 : 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error(error);
    return Response.json(
      { error: error instanceof ApiError ? error.message : 'Unable to complete the request.' },
      { status: error instanceof ApiError ? error.status : 500 },
    );
  }
}
