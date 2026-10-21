import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type IntegrationJob } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialCrypto } from './credential-crypto';

export type BackfillDataset = 'MESSAGES' | 'COMMENTS';
type Task = {
  edge: 'messages' | 'comments';
  id: string;
  postId?: string;
  psid?: string;
  after?: string;
};
type Progress = {
  discovered: number;
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  duplicates?: number;
  failed: number;
};
type State = {
  dataset: BackfillDataset;
  since: string;
  until: string;
  pageLimit?: number;
  pagesFetched?: number;
  rootAfter?: string;
  rootDone: boolean;
  tasks: Task[];
  progress: Progress;
  lastProgressAt?: string;
};
type GraphRow = Record<string, unknown>;

class GraphBackfillError extends Error {
  constructor(
    message: string,
    readonly providerCode?: number,
    readonly providerSubcode?: number,
  ) {
    super(message);
  }
}

function object(value: unknown): GraphRow {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as GraphRow) : {};
}
function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
function cursor(value: unknown): string | undefined {
  const raw = string(value);
  return raw && raw.length <= 2048 && !raw.includes('://') ? raw : undefined;
}
function within(value: unknown, state: State): Date | null {
  const raw = string(value);
  if (!raw) return null;
  const at = new Date(raw);
  return Number.isFinite(at.getTime()) && at >= new Date(state.since) && at < new Date(state.until)
    ? at
    : null;
}
function cleanState(value: Prisma.JsonValue): State {
  const state = object(value) as Partial<State>;
  if (!['MESSAGES', 'COMMENTS'].includes(state.dataset ?? '') || !Array.isArray(state.tasks))
    throw new Error('INVALID_BACKFILL_CHECKPOINT');
  return state as State;
}

@Injectable()
export class FacebookBackfillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async start(
    businessId: string,
    connectionId: string,
    dataset: BackfillDataset,
    since: string,
    until: string,
    pageLimit = 100,
  ) {
    const start = new Date(since);
    const end = new Date(until);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      start >= end ||
      end.getTime() > Date.now() + 86400_000 ||
      end.getTime() - start.getTime() > 366 * 86400_000 ||
      !Number.isInteger(pageLimit) ||
      pageLimit < 1 ||
      pageLimit > 500
    )
      throw new BadRequestException(
        'Khoảng thời gian phải hợp lệ, không quá 366 ngày và không quá ngày hiện tại.',
      );
    const connection = await this.prisma.integrationConnection.findFirst({
      where: { id: connectionId, businessId, provider: 'FACEBOOK' },
      select: { id: true, status: true, credentialCiphertext: true },
    });
    if (!connection) throw new NotFoundException('Không tìm thấy kết nối Facebook.');
    if (connection.status !== 'CONNECTED' || !connection.credentialCiphertext)
      throw new ConflictException('Page cần được cấp quyền lại trước khi nhập lịch sử.');
    const normalized = { dataset, since: start.toISOString(), until: end.toISOString() };
    const key = `facebook-backfill:${createHash('sha256').update(JSON.stringify(normalized)).digest('hex')}`;
    const state: State = {
      ...normalized,
      pageLimit,
      pagesFetched: 0,
      rootDone: false,
      tasks: [],
      progress: {
        discovered: 0,
        fetched: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        duplicates: 0,
        failed: 0,
      },
    };
    const job = await this.prisma.integrationJob.upsert({
      where: { connectionId_idempotencyKey: { connectionId, idempotencyKey: key } },
      create: {
        businessId,
        connectionId,
        kind: 'BACKFILL',
        idempotencyKey: key,
        payload: state,
        maxAttempts: 12,
      },
      update: {},
      select: { id: true, status: true },
    });
    return job;
  }

  async list(businessId: string, connectionId?: string) {
    const jobs = await this.prisma.integrationJob.findMany({
      where: { businessId, kind: 'BACKFILL', ...(connectionId ? { connectionId } : {}) },
      orderBy: { receivedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        connectionId: true,
        status: true,
        payload: true,
        lastErrorCode: true,
        receivedAt: true,
        updatedAt: true,
        completedAt: true,
        availableAt: true,
      },
    });
    return jobs.map(({ payload, ...job }) => {
      const state = cleanState(payload);
      return {
        ...job,
        dataset: state.dataset,
        since: state.since,
        until: state.until,
        progress: state.progress,
        pageLimit: state.pageLimit ?? 100,
        pagesFetched: state.pagesFetched ?? 0,
        lastProgressAt: state.lastProgressAt,
        phase: state.tasks.at(-1)?.edge ?? (state.rootDone ? 'complete' : 'discovering'),
      };
    });
  }

  async pause(businessId: string, id: string) {
    const job = await this.prisma.integrationJob.findFirst({
      where: { id, businessId, kind: 'BACKFILL' },
      select: { id: true, status: true },
    });
    if (!job) throw new NotFoundException('Không tìm thấy tác vụ nhập lịch sử.');
    if (!['PENDING', 'PROCESSING', 'RETRY'].includes(job.status))
      throw new ConflictException('Tác vụ không ở trạng thái có thể tạm dừng.');
    await this.prisma.integrationJob.updateMany({
      where: {
        id,
        businessId,
        kind: 'BACKFILL',
        status: { in: ['PENDING', 'PROCESSING', 'RETRY'] },
      },
      data: {
        status: 'BLOCKED',
        lastErrorCode: 'PAUSED_BY_USER',
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    return { id, status: 'BLOCKED' };
  }

  async resume(businessId: string, id: string) {
    const changed = await this.prisma.integrationJob.updateMany({
      where: {
        id,
        businessId,
        kind: 'BACKFILL',
        status: 'BLOCKED',
        lastErrorCode: 'PAUSED_BY_USER',
        connection: { status: 'CONNECTED' },
      },
      data: {
        status: 'PENDING',
        attempts: 0,
        availableAt: new Date(),
        lastErrorCode: null,
      },
    });
    if (!changed.count)
      throw new ConflictException('Tác vụ không ở trạng thái tạm dừng hoặc Page cần kết nối lại.');
    return { id, status: 'PENDING' };
  }

  async restart(businessId: string, id: string) {
    const job = await this.prisma.integrationJob.findFirst({
      where: { id, businessId, kind: 'BACKFILL' },
      select: { id: true, status: true, payload: true, connection: { select: { status: true } } },
    });
    if (!job) throw new NotFoundException('Không tìm thấy tác vụ nhập lịch sử.');
    if (job.connection.status !== 'CONNECTED')
      throw new ConflictException('Cần kết nối lại Page trước khi nhập.');
    if (!['SUCCEEDED', 'DEAD', 'BLOCKED'].includes(job.status))
      throw new ConflictException('Tác vụ đang chạy; không thể nhập lại cùng phạm vi.');
    const previous = cleanState(job.payload);
    const state: State = {
      dataset: previous.dataset,
      since: previous.since,
      until: previous.until,
      pageLimit: previous.pageLimit ?? 100,
      pagesFetched: 0,
      rootDone: false,
      tasks: [],
      progress: {
        discovered: 0,
        fetched: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        duplicates: 0,
        failed: 0,
      },
    };
    const changed = await this.prisma.integrationJob.updateMany({
      where: { id, businessId, kind: 'BACKFILL', status: job.status },
      data: {
        payload: state,
        status: 'PENDING',
        attempts: 0,
        availableAt: new Date(),
        completedAt: null,
        lastErrorCode: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    if (!changed.count) throw new ConflictException('Trạng thái tác vụ vừa thay đổi.');
    return { id, status: 'PENDING' };
  }

  async extend(businessId: string, id: string, additionalPages: number) {
    if (!Number.isInteger(additionalPages) || additionalPages < 1 || additionalPages > 500)
      throw new BadRequestException('Số trang bổ sung phải từ 1 đến 500.');
    const job = await this.prisma.integrationJob.findFirst({
      where: { id, businessId, kind: 'BACKFILL' },
      select: { id: true, status: true, lastErrorCode: true, payload: true },
    });
    if (!job) throw new NotFoundException('Không tìm thấy tác vụ nhập lịch sử.');
    if (job.status !== 'BLOCKED' || job.lastErrorCode !== 'BACKFILL_PAGE_LIMIT_REACHED')
      throw new ConflictException('Chỉ có thể mở rộng tác vụ bị dừng do giới hạn trang.');
    const state = cleanState(job.payload);
    state.progress.duplicates ??= 0;
    state.pageLimit = (state.pageLimit ?? 100) + additionalPages;
    const changed = await this.prisma.integrationJob.updateMany({
      where: {
        id,
        businessId,
        kind: 'BACKFILL',
        status: 'BLOCKED',
        lastErrorCode: 'BACKFILL_PAGE_LIMIT_REACHED',
      },
      data: {
        payload: state,
        status: 'PENDING',
        attempts: 0,
        availableAt: new Date(),
        lastErrorCode: null,
      },
    });
    if (!changed.count) throw new ConflictException('Trạng thái tác vụ vừa thay đổi.');
    return { id, status: 'PENDING', pageLimit: state.pageLimit };
  }

  async preflight(businessId: string, connectionId: string, dataset: BackfillDataset) {
    const connection = await this.prisma.integrationConnection.findFirst({
      where: { id: connectionId, businessId, provider: 'FACEBOOK' },
      select: { status: true, externalAccountId: true, credentialCiphertext: true },
    });
    if (!connection) throw new NotFoundException('Không tìm thấy kết nối Facebook.');
    if (connection.status !== 'CONNECTED' || !connection.credentialCiphertext)
      return { dataset, status: 'REAUTH_REQUIRED', checkedEdge: 'connection' };
    const credential = new CredentialCrypto(
      this.config.get<string>('INTEGRATION_TOKEN_ENCRYPTION_KEY'),
    ).decrypt<{ pageToken: string }>(
      connection.credentialCiphertext,
      `facebook-connection:${businessId}:${connection.externalAccountId}`,
    );
    try {
      const rootEdge = dataset === 'MESSAGES' ? 'conversations' : 'posts';
      const root = await this.graph(
        credential.pageToken,
        `${connection.externalAccountId}/${rootEdge}`,
        dataset === 'MESSAGES' ? 'id,participants' : 'id',
      );
      const childId = string(root.rows[0]?.id);
      if (!childId) return { dataset, status: 'ACCESSIBLE_EMPTY_ROOT', checkedEdge: rootEdge };
      const childEdge = dataset === 'MESSAGES' ? 'messages' : 'comments';
      const child = await this.graph(
        credential.pageToken,
        `${childId}/${childEdge}`,
        dataset === 'MESSAGES' ? 'id,created_time,from' : 'id,created_time,parent',
      );
      return {
        dataset,
        status: child.rows.length ? 'ACCESSIBLE_SAMPLE' : 'ACCESSIBLE_EMPTY_SAMPLE',
        checkedEdge: childEdge,
      };
    } catch (error) {
      if (error instanceof GraphBackfillError)
        return {
          dataset,
          status: error.message,
          checkedEdge: dataset === 'MESSAGES' ? 'conversations/messages' : 'posts/comments',
          providerCode: error.providerCode,
          providerSubcode: error.providerSubcode,
        };
      throw error;
    }
  }

  private async graph(pageToken: string, path: string, fields: string, after?: string) {
    const version = this.config.get<string>('FACEBOOK_GRAPH_API_VERSION');
    if (
      !version ||
      !/^v\d+\.\d+$/.test(version) ||
      !/^[A-Za-z0-9_-]+\/(conversations|messages|posts|comments)$/.test(path)
    )
      throw new Error('INVALID_GRAPH_PATH');
    const url = new URL(`https://graph.facebook.com/${version}/${path}`);
    url.searchParams.set('fields', fields);
    url.searchParams.set('limit', '25');
    if (after) url.searchParams.set('after', after);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${pageToken}` },
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new Error('GRAPH_TRANSIENT');
    }
    if (!response.ok) {
      // Never log provider response, URL, cursor or bearer token.
      const body = object(await response.json().catch(() => ({})));
      const providerError = object(body.error);
      const code = providerError.code;
      const providerCode = Number.isInteger(code) ? Number(code) : undefined;
      const subcode = Number.isInteger(providerError.error_subcode)
        ? Number(providerError.error_subcode)
        : undefined;
      if (code === 10 || code === 200 || response.status === 403)
        throw new GraphBackfillError('BLOCKED_PERMISSION', providerCode, subcode);
      if (code === 190 || response.status === 401)
        throw new GraphBackfillError('REAUTH_REQUIRED', providerCode, subcode);
      if (response.status === 429 || [4, 17, 613].includes(Number(code)))
        throw new GraphBackfillError('GRAPH_RATE_LIMIT', providerCode, subcode);
      throw new GraphBackfillError('GRAPH_TRANSIENT', providerCode, subcode);
    }
    const body = object(await response.json());
    if (!Array.isArray(body.data)) throw new Error('INVALID_GRAPH_RESPONSE');
    return {
      rows: body.data.map(object),
      after: cursor(object(object(body.paging).cursors).after),
    };
  }

  async processBatch(job: IntegrationJob, leaseOwner: string): Promise<boolean> {
    const state = cleanState(job.payload);
    state.progress.duplicates ??= 0;
    if (state.rootDone && state.tasks.length === 0) return true;
    if ((state.pagesFetched ?? 0) >= (state.pageLimit ?? 100))
      throw new Error('BACKFILL_PAGE_LIMIT_REACHED');
    const connection = await this.prisma.integrationConnection.findFirst({
      where: {
        id: job.connectionId,
        businessId: job.businessId,
        provider: 'FACEBOOK',
        status: 'CONNECTED',
      },
      select: { externalAccountId: true, credentialCiphertext: true },
    });
    if (!connection?.credentialCiphertext) throw new Error('REAUTH_REQUIRED');
    const credential = new CredentialCrypto(
      this.config.get<string>('INTEGRATION_TOKEN_ENCRYPTION_KEY'),
    ).decrypt<{ pageToken: string }>(
      connection.credentialCiphertext,
      `facebook-connection:${job.businessId}:${connection.externalAccountId}`,
    );
    if (!credential.pageToken) throw new Error('REAUTH_REQUIRED');
    const task = state.tasks.pop();
    const path = task
      ? `${task.id}/${task.edge}`
      : `${connection.externalAccountId}/${state.dataset === 'MESSAGES' ? 'conversations' : 'posts'}`;
    const fields =
      task?.edge === 'messages'
        ? 'id,message,created_time,from,to,attachments'
        : task?.edge === 'comments'
          ? 'id,message,created_time,from,parent,permalink_url'
          : state.dataset === 'MESSAGES'
            ? 'id,participants'
            : 'id';
    const page = await this.graph(
      credential.pageToken,
      path,
      fields,
      task ? task.after : state.rootAfter,
    );
    state.pagesFetched = (state.pagesFetched ?? 0) + 1;
    state.progress.fetched += page.rows.length;
    if (task) {
      if (page.after) state.tasks.push({ ...task, after: page.after });
      if (task.edge === 'messages')
        await this.saveMessages(job, state, task, page.rows, connection.externalAccountId);
      else await this.saveComments(job, state, task, page.rows);
    } else {
      state.rootAfter = page.after;
      state.rootDone = !page.after;
      for (const row of page.rows) {
        const id = string(row.id);
        if (!id) {
          state.progress.skipped++;
          continue;
        }
        if (state.dataset === 'MESSAGES') {
          const participants = object(row.participants).data;
          const psid = Array.isArray(participants)
            ? participants
                .map(object)
                .map((p) => string(p.id))
                .find((p) => p && p !== connection.externalAccountId)
            : undefined;
          if (!psid) {
            state.progress.skipped++;
            continue;
          }
          state.tasks.push({ edge: 'messages', id, psid });
        } else state.tasks.push({ edge: 'comments', id, postId: id });
        state.progress.discovered++;
      }
    }
    state.lastProgressAt = new Date().toISOString();
    const updated = await this.prisma.integrationJob.updateMany({
      where: { id: job.id, status: 'PROCESSING', leaseOwner },
      data: { payload: state },
    });
    if (!updated.count) throw new Error('BACKFILL_LEASE_LOST');
    return state.rootDone && state.tasks.length === 0;
  }

  private async saveMessages(
    job: IntegrationJob,
    state: State,
    task: Task,
    rows: GraphRow[],
    pageId: string,
  ) {
    if (!task.psid) throw new Error('INVALID_BACKFILL_CHECKPOINT');
    for (const row of rows) {
      const id = string(row.id);
      const at = within(row.created_time, state);
      if (!id || !at) {
        state.progress.skipped++;
        continue;
      }
      const sender = string(object(row.from).id);
      const attachments = object(row.attachments).data;
      await this.prisma.$transaction(async (tx) => {
        const identity = await tx.externalCustomerIdentity.upsert({
          where: {
            connectionId_externalUserId: {
              connectionId: job.connectionId,
              externalUserId: task.psid!,
            },
          },
          create: {
            businessId: job.businessId,
            connectionId: job.connectionId,
            externalUserId: task.psid!,
          },
          update: {},
        });
        const conversation = await tx.conversation.upsert({
          where: {
            connectionId_externalId: { connectionId: job.connectionId, externalId: task.psid! },
          },
          create: {
            businessId: job.businessId,
            connectionId: job.connectionId,
            identityId: identity.id,
            externalId: task.psid!,
            lastMessageAt: at,
          },
          update: {},
        });
        await tx.conversation.updateMany({
          where: {
            id: conversation.id,
            OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: at } }],
          },
          data: { lastMessageAt: at },
        });
        const inserted = await tx.conversationMessage.createMany({
          data: [
            {
              connectionId: job.connectionId,
              conversationId: conversation.id,
              externalMessageId: id,
              importJobId: job.id,
              providerAt: at,
              direction: sender === pageId ? 'OUTBOUND_ECHO' : 'INBOUND',
              contentType: Array.isArray(attachments) && attachments.length ? 'attachment' : 'text',
              body: string(row.message),
              mediaMetadata: Array.isArray(attachments)
                ? { count: attachments.length }
                : Prisma.DbNull,
            },
          ],
          skipDuplicates: true,
        });
        state.progress.inserted += inserted.count;
        state.progress.skipped += 1 - inserted.count;
        state.progress.duplicates = (state.progress.duplicates ?? 0) + 1 - inserted.count;
        if (sender === pageId) {
          await tx.socialOutbound.updateMany({
            where: {
              connectionId: job.connectionId,
              conversationId: conversation.id,
              providerObjectId: id,
              status: { in: ['SENDING', 'UNKNOWN'] },
            },
            data: { status: 'SENT_TO_PROVIDER', acceptedAt: at, errorCode: null },
          });
        }
      });
    }
  }

  private async saveComments(job: IntegrationJob, state: State, task: Task, rows: GraphRow[]) {
    for (const row of rows) {
      const id = string(row.id);
      if (id) {
        state.tasks.push({ edge: 'comments', id, postId: task.postId });
        state.progress.discovered++;
      }
      const at = within(row.created_time, state);
      if (!id || !at || !task.postId) {
        state.progress.skipped++;
        continue;
      }
      const inserted = await this.prisma.socialComment.createMany({
        data: [
          {
            businessId: job.businessId,
            connectionId: job.connectionId,
            externalCommentId: id,
            importJobId: job.id,
            externalPostId: task.postId,
            externalParentId:
              string(object(row.parent).id) ?? (task.id === task.postId ? undefined : task.id),
            externalAuthorId: string(object(row.from).id),
            authorDisplayName: string(object(row.from).name),
            body: string(row.message),
            sourceUrl: string(row.permalink_url),
            providerAt: at,
          },
        ],
        skipDuplicates: true,
      });
      state.progress.inserted += inserted.count;
      state.progress.skipped += 1 - inserted.count;
      state.progress.duplicates = (state.progress.duplicates ?? 0) + 1 - inserted.count;
    }
  }
}
