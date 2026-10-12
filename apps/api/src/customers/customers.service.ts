import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { ProblemException } from '../common/problem.exception';
import type { RequestStaff } from '../common/request-context';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeCustomerName, normalizeEmail, normalizePhone } from './customer-normalization';
import { customerGroupFromSource } from './customer-channel';
import type {
  AddressInputDto,
  ContactInputDto,
  CreateCustomerDto,
  DuplicateCandidatesQueryDto,
  ListCustomersQueryDto,
  UpdateAddressDto,
  UpdateCustomerDto,
} from './dto/customer.dto';
import type { CustomerProfileNoteDto, CustomerTimelineQueryDto } from './dto/customer-profile.dto';
import type { DuplicateDecisionDto, MergeCustomerDto } from './dto/customer-identity.dto';

const customerSummarySelect = {
  id: true,
  customerCode: true,
  displayName: true,
  source: true,
  status: true,
  version: true,
  marketingConsent: true,
  updatedAt: true,
  group: { select: { code: true, name: true } },
  contacts: {
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
    select: { id: true, type: true, value: true, label: true, isPrimary: true },
  },
  assignedStaff: { select: { id: true, displayName: true } },
  _count: { select: { addresses: true, tasks: true, opportunities: true } },
} satisfies Prisma.CustomerSelect;

const customerDetailSelect = {
  ...customerSummarySelect,
  legalName: true,
  taxCode: true,
  notes: true,
  createdAt: true,
  addresses: {
    orderBy: [{ isDefault: 'desc' as const }, { createdAt: 'asc' as const }],
    select: {
      id: true,
      label: true,
      recipientName: true,
      phone: true,
      line1: true,
      ward: true,
      district: true,
      province: true,
      countryCode: true,
      isDefault: true,
      status: true,
    },
  },
  tasks: {
    orderBy: [{ status: 'asc' as const }, { dueAt: 'asc' as const }],
    select: {
      id: true,
      title: true,
      description: true,
      dueAt: true,
      status: true,
      completedAt: true,
      assignedStaff: { select: { id: true, displayName: true } },
    },
  },
  opportunities: {
    orderBy: { updatedAt: 'desc' as const },
    select: {
      id: true,
      title: true,
      kind: true,
      stage: true,
      note: true,
      updatedAt: true,
      assignedStaff: { select: { id: true, displayName: true } },
    },
  },
} satisfies Prisma.CustomerSelect;

type CustomerTimelineType = 'NOTE' | 'TASK' | 'OPPORTUNITY' | 'QUOTE' | 'ORDER' | 'PAYMENT';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  private async canonicalCustomerId(id: string, businessId: string) {
    let currentId = id;
    const visited = new Set<string>();
    for (let hop = 0; hop < 8; hop += 1) {
      if (visited.has(currentId))
        throw new ProblemException(
          409,
          'MERGE_REDIRECT_CYCLE',
          'Đường dẫn hồ sơ gộp không hợp lệ.',
        );
      visited.add(currentId);
      const customer = await this.prisma.customer.findFirst({
        where: { id: currentId, businessId },
        select: { id: true, status: true, mergedIntoId: true },
      });
      if (!customer)
        throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy khách hàng.');
      if (customer.status !== 'MERGED') return customer.id;
      if (!customer.mergedIntoId)
        throw new ProblemException(
          409,
          'MERGE_TARGET_MISSING',
          'Hồ sơ đã gộp nhưng thiếu hồ sơ đích.',
        );
      currentId = customer.mergedIntoId;
    }
    throw new ProblemException(
      409,
      'MERGE_REDIRECT_DEPTH',
      'Chuỗi chuyển hồ sơ vượt giới hạn an toàn.',
    );
  }

  private async requireGroup(businessId: string, code: string) {
    const group = await this.prisma.customerGroup.findUnique({
      where: { businessId_code: { businessId, code: code.trim().toLocaleLowerCase('en-US') } },
    });
    if (!group) {
      throw new ProblemException(422, 'UNKNOWN_CUSTOMER_GROUP', 'Nhóm khách không tồn tại.');
    }
    return group;
  }

  private async requireAssignee(businessId: string, staffId?: string) {
    if (!staffId) return null;
    const staff = await this.prisma.staffUser.findFirst({
      where: { id: staffId, businessId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!staff) {
      throw new ProblemException(422, 'UNKNOWN_ASSIGNEE', 'Nhân viên phụ trách không hợp lệ.');
    }
    return staff.id;
  }

  private normalizeContacts(contacts: ContactInputDto[] = []) {
    const seen = new Set<string>();
    return contacts.map((contact) => {
      const value = contact.value.trim();
      const normalizedValue =
        contact.type === 'EMAIL' ? normalizeEmail(value) : normalizePhone(value);
      if (!normalizedValue || (contact.type === 'EMAIL' && !/^\S+@\S+\.\S+$/.test(value))) {
        throw new ProblemException(
          HttpStatus.BAD_REQUEST,
          'INVALID_CONTACT',
          contact.type === 'EMAIL' ? 'Email không hợp lệ.' : 'Số điện thoại không hợp lệ.',
        );
      }
      const key = `${contact.type}:${normalizedValue}`;
      if (seen.has(key)) {
        throw new ProblemException(
          422,
          'DUPLICATE_CONTACT_IN_PROFILE',
          'Liên hệ bị lặp trong hồ sơ.',
        );
      }
      seen.add(key);
      return {
        type: contact.type,
        value,
        normalizedValue,
        label: contact.label?.trim() || null,
        isPrimary: Boolean(contact.isPrimary),
      };
    });
  }

  private cleanAddress(address: AddressInputDto) {
    return {
      label: address.label?.trim() || null,
      recipientName: address.recipientName?.trim() || null,
      phone: address.phone?.trim() || null,
      line1: address.line1.trim(),
      ward: address.ward?.trim() || null,
      district: address.district?.trim() || null,
      province: address.province.trim(),
      countryCode: address.countryCode?.trim().toUpperCase() || 'VN',
      isDefault: Boolean(address.isDefault),
    };
  }

  async list(businessId: string, query: ListCustomersQueryDto, permissions: string[] = []) {
    const search = query.query?.trim();
    const normalizedSearch = search ? normalizeCustomerName(search) : undefined;
    const normalizedPhone = search ? normalizePhone(search) : null;
    const normalizedEmail = search?.includes('@') ? normalizeEmail(search) : undefined;
    const where: Prisma.CustomerWhereInput = {
      businessId,
      status: 'ACTIVE',
      ...(query.groupCode ? { group: { code: query.groupCode } } : {}),
      ...(search
        ? {
            OR: [
              { customerCode: { contains: search.toUpperCase(), mode: 'insensitive' } },
              { nameNormalized: { contains: normalizedSearch } },
              ...(normalizedPhone
                ? [{ contacts: { some: { normalizedValue: normalizedPhone } } }]
                : []),
              ...(normalizedEmail
                ? [{ contacts: { some: { normalizedValue: normalizedEmail } } }]
                : []),
            ],
          }
        : {}),
    };
    const rows = await this.prisma.customer.findMany({
      where,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: customerSummarySelect,
    });
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const canReadTasks = permissions.includes('tasks.manage');
    const canReadOpportunities = permissions.includes('opportunities.manage');
    return {
      items: items.map((item) => ({
        ...item,
        _count: {
          addresses: item._count.addresses,
          ...(canReadTasks ? { tasks: item._count.tasks } : {}),
          ...(canReadOpportunities ? { opportunities: item._count.opportunities } : {}),
        },
      })),
      nextCursor: hasMore ? items.at(-1)?.id : null,
      hasMore,
    };
  }

  async getById(id: string, businessId: string, permissions: string[] = []) {
    const canonicalId = await this.canonicalCustomerId(id, businessId);
    const customer = await this.prisma.customer.findFirst({
      where: { id: canonicalId, businessId, status: 'ACTIVE' },
      select: customerDetailSelect,
    });
    if (!customer) {
      throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy khách hàng.');
    }
    const canReadTasks = permissions.includes('tasks.manage');
    const canReadOpportunities = permissions.includes('opportunities.manage');
    const canReadIntegrations = permissions.includes('integrations.read');
    const [linkedIdentities, linkedConversations] = canReadIntegrations
      ? await Promise.all([
          this.prisma.externalCustomerIdentity.findMany({
            where: { businessId, customerId: customer.id },
            orderBy: [{ linkedAt: 'desc' }, { createdAt: 'desc' }],
            select: {
              id: true,
              displayName: true,
              externalUserId: true,
              linkedAt: true,
              linkedBy: { select: { displayName: true } },
              version: true,
              connection: {
                select: { provider: true, externalAccountId: true, displayName: true },
              },
            },
          }),
          this.prisma.conversation.findMany({
            where: { businessId, identity: { customerId: customer.id } },
            take: 50,
            orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
            select: {
              id: true,
              externalId: true,
              status: true,
              lastMessageAt: true,
              identity: { select: { displayName: true, externalUserId: true } },
              connection: { select: { provider: true, displayName: true } },
              messages: {
                orderBy: { providerAt: 'desc' },
                take: 1,
                select: { body: true, contentType: true, providerAt: true },
              },
            },
          }),
        ])
      : [[], []];
    return {
      ...customer,
      _count: {
        addresses: customer._count.addresses,
        ...(canReadTasks ? { tasks: customer._count.tasks } : {}),
        ...(canReadOpportunities ? { opportunities: customer._count.opportunities } : {}),
      },
      ...(canReadTasks ? {} : { tasks: undefined }),
      ...(canReadOpportunities ? {} : { opportunities: undefined }),
      capabilities: {
        tasks: canReadTasks,
        opportunities: canReadOpportunities,
        identities: canReadIntegrations,
      },
      linkedIdentities: linkedIdentities.map((identity) => ({
        id: identity.id,
        provider: identity.connection.provider,
        accountName: identity.connection.displayName,
        accountIdMasked:
          identity.connection.externalAccountId.length > 6
            ? `${identity.connection.externalAccountId.slice(0, 3)}…${identity.connection.externalAccountId.slice(-3)}`
            : '••••',
        displayName: identity.displayName,
        externalUserIdMasked:
          identity.externalUserId.length > 6
            ? `${identity.externalUserId.slice(0, 3)}…${identity.externalUserId.slice(-3)}`
            : '••••',
        linkedAt: identity.linkedAt,
        linkedBy: identity.linkedBy?.displayName ?? null,
        version: identity.version,
      })),
      linkedConversations,
    };
  }

  private decodeTimelineCursor(cursor: string | undefined) {
    if (!cursor) return null;
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
        at?: unknown;
        type?: unknown;
        id?: unknown;
      };
      if (
        typeof parsed.at !== 'string' ||
        Number.isNaN(Date.parse(parsed.at)) ||
        typeof parsed.type !== 'string' ||
        !['NOTE', 'TASK', 'OPPORTUNITY', 'QUOTE', 'ORDER', 'PAYMENT'].includes(parsed.type) ||
        typeof parsed.id !== 'string'
      ) {
        throw new Error('bad cursor');
      }
      return { at: new Date(parsed.at), type: parsed.type, id: parsed.id };
    } catch {
      throw new ProblemException(400, 'INVALID_CURSOR', 'Con trỏ dòng thời gian không hợp lệ.');
    }
  }

  async timeline(id: string, actor: RequestStaff, query: CustomerTimelineQueryDto) {
    const canonicalId = await this.canonicalCustomerId(id, actor.businessId);
    const customer = await this.prisma.customer.findFirst({
      where: { id: canonicalId, businessId: actor.businessId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!customer) {
      throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy khách hàng.');
    }

    const cursor = this.decodeTimelineCursor(query.cursor);
    const limit = query.limit ?? 20;
    const permissions = new Set(actor.permissions);
    const cursorWhere = (type: CustomerTimelineType) => {
      if (!cursor) return {};
      const typeComparison = type < cursor.type ? -1 : type > cursor.type ? 1 : 0;
      if (typeComparison < 0) return { createdAt: { lte: cursor.at } };
      if (typeComparison > 0) return { createdAt: { lt: cursor.at } };
      return {
        OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }],
      };
    };
    const take = limit + 1;
    const [notes, tasks, opportunities, quotes, orders, payments] = await Promise.all([
      this.prisma.customerNote.findMany({
        where: {
          businessId: actor.businessId,
          customerId: customer.id,
          ...cursorWhere('NOTE'),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        select: {
          id: true,
          content: true,
          createdAt: true,
          createdBy: { select: { id: true, displayName: true } },
        },
      }),
      permissions.has('tasks.manage')
        ? this.prisma.customerTask.findMany({
            where: {
              businessId: actor.businessId,
              customerId: customer.id,
              ...cursorWhere('TASK'),
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take,
            select: { id: true, title: true, status: true, dueAt: true, createdAt: true },
          })
        : [],
      permissions.has('opportunities.manage')
        ? this.prisma.salesOpportunity.findMany({
            where: {
              businessId: actor.businessId,
              customerId: customer.id,
              ...cursorWhere('OPPORTUNITY'),
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take,
            select: { id: true, title: true, kind: true, stage: true, createdAt: true },
          })
        : [],
      permissions.has('quotes.read')
        ? this.prisma.quote.findMany({
            where: {
              businessId: actor.businessId,
              customerId: customer.id,
              ...cursorWhere('QUOTE'),
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take,
            select: {
              id: true,
              quoteNumber: true,
              status: true,
              grandTotalVnd: true,
              createdAt: true,
            },
          })
        : [],
      permissions.has('orders.read')
        ? this.prisma.salesOrder.findMany({
            where: {
              businessId: actor.businessId,
              customerId: customer.id,
              ...cursorWhere('ORDER'),
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take,
            select: {
              id: true,
              orderNumber: true,
              status: true,
              grandTotalVnd: true,
              createdAt: true,
            },
          })
        : [],
      permissions.has('receivables.view')
        ? this.prisma.paymentReceipt.findMany({
            where: {
              businessId: actor.businessId,
              customerId: customer.id,
              ...cursorWhere('PAYMENT'),
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take,
            select: {
              id: true,
              amountVnd: true,
              reference: true,
              receivedAt: true,
              createdAt: true,
            },
          })
        : [],
    ]);

    const items = [
      ...notes.map((row) => ({
        type: 'NOTE' as const,
        id: row.id,
        sourceId: row.id,
        occurredAt: row.createdAt,
        title: row.content,
        detail: row.createdBy.displayName,
      })),
      ...tasks.map((row) => ({
        type: 'TASK' as const,
        id: row.id,
        sourceId: row.id,
        occurredAt: row.createdAt,
        title: row.title,
        detail: row.status,
        dueAt: row.dueAt,
      })),
      ...opportunities.map((row) => ({
        type: 'OPPORTUNITY' as const,
        id: row.id,
        sourceId: row.id,
        occurredAt: row.createdAt,
        title: row.title,
        detail: `${row.kind}:${row.stage}`,
      })),
      ...quotes.map((row) => ({
        type: 'QUOTE' as const,
        id: row.id,
        sourceId: row.quoteNumber,
        occurredAt: row.createdAt,
        title: row.quoteNumber,
        detail: row.status,
        amountVnd: row.grandTotalVnd.toString(),
      })),
      ...orders.map((row) => ({
        type: 'ORDER' as const,
        id: row.id,
        sourceId: row.orderNumber,
        occurredAt: row.createdAt,
        title: row.orderNumber,
        detail: row.status === 'DRAFT' ? 'Đơn nháp' : row.status,
        amountVnd: row.grandTotalVnd.toString(),
      })),
      ...payments.map((row) => ({
        type: 'PAYMENT' as const,
        id: row.id,
        sourceId: row.id,
        occurredAt: row.createdAt,
        receivedAt: row.receivedAt,
        title: 'Phiếu thu',
        detail: row.reference ? `Đã ghi nhận:${row.reference}` : 'Đã ghi nhận tiền thực nhận',
        amountVnd: row.amountVnd.toString(),
      })),
    ]
      .filter((item) => {
        if (!cursor) return true;
        const at = item.occurredAt.getTime();
        if (at < cursor.at.getTime()) return true;
        if (at > cursor.at.getTime()) return false;
        const key = `${item.type}:${item.id}`;
        const cursorKey = `${cursor.type}:${cursor.id}`;
        return key < cursorKey;
      })
      .sort((left, right) => {
        const timestamp = right.occurredAt.getTime() - left.occurredAt.getTime();
        if (timestamp !== 0) return timestamp;
        const rightKey = `${right.type}:${right.id}`;
        const leftKey = `${left.type}:${left.id}`;
        return rightKey < leftKey ? -1 : rightKey > leftKey ? 1 : 0;
      });
    const page = items.slice(0, limit);
    const hasMore = items.length > limit;
    const last = page.at(-1);
    const nextCursor =
      hasMore && last
        ? Buffer.from(
            JSON.stringify({ at: last.occurredAt.toISOString(), type: last.type, id: last.id }),
          ).toString('base64url')
        : null;
    return {
      items: page.map((item) => ({
        ...item,
        occurredAt: item.occurredAt.toISOString(),
        ...('dueAt' in item ? { dueAt: item.dueAt?.toISOString() } : {}),
      })),
      nextCursor,
      hasMore,
      capabilities: {
        notes: permissions.has('customers.read'),
        canWriteNotes: permissions.has('customers.write'),
        tasks: permissions.has('tasks.manage'),
        opportunities: permissions.has('opportunities.manage'),
        quotes: permissions.has('quotes.read'),
        orders: permissions.has('orders.read'),
        payments: permissions.has('receivables.view'),
      },
    };
  }

  async addNote(id: string, dto: CustomerProfileNoteDto, actor: RequestStaff, requestId: string) {
    const canonicalId = await this.canonicalCustomerId(id, actor.businessId);
    const content = dto.content.trim();
    if (!content) throw new ProblemException(400, 'INVALID_NOTE', 'Ghi chú không được để trống.');
    const noteId = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: canonicalId, businessId: actor.businessId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!customer) {
        throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy khách hàng.');
      }
      const note = await tx.customerNote.create({
        data: {
          id: noteId,
          businessId: actor.businessId,
          customerId: customer.id,
          createdById: actor.id,
          content,
        },
        select: {
          id: true,
          content: true,
          createdAt: true,
          createdBy: { select: { id: true, displayName: true } },
        },
      });
      await tx.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action: 'customer.note.created',
          entityType: 'CUSTOMER_NOTE',
          entityId: note.id,
          requestId,
          metadata: { customerId: customer.id },
        },
      });
      return note;
    });
  }

  async groups(businessId: string) {
    return this.prisma.customerGroup.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true, description: true },
    });
  }

  async duplicateCandidates(businessId: string, input: DuplicateCandidatesQueryDto) {
    const name = input.displayName ? normalizeCustomerName(input.displayName) : undefined;
    const phone = input.phone ? normalizePhone(input.phone) : undefined;
    if (input.phone && !phone) {
      throw new ProblemException(400, 'INVALID_CONTACT', 'Số điện thoại không hợp lệ.');
    }
    const email = input.email ? normalizeEmail(input.email) : undefined;
    if (!name && !phone && !email) return [];
    const candidates = await this.prisma.customer.findMany({
      where: {
        businessId,
        status: 'ACTIVE',
        OR: [
          ...(name ? [{ nameNormalized: name }] : []),
          ...(phone
            ? [{ contacts: { some: { type: 'PHONE' as const, normalizedValue: phone } } }]
            : []),
          ...(email
            ? [{ contacts: { some: { type: 'EMAIL' as const, normalizedValue: email } } }]
            : []),
        ],
      },
      take: 10,
      select: {
        id: true,
        customerCode: true,
        displayName: true,
        nameNormalized: true,
        group: { select: { code: true, name: true } },
        contacts: { select: { type: true, normalizedValue: true } },
      },
    });
    return candidates.map((candidate) => ({
      id: candidate.id,
      customerCode: candidate.customerCode,
      displayName: candidate.displayName,
      group: candidate.group,
      matchReasons: [
        ...(name && candidate.nameNormalized === name ? ['SAME_NAME'] : []),
        ...(phone && candidate.contacts.some((contact) => contact.normalizedValue === phone)
          ? ['SAME_PHONE']
          : []),
        ...(email && candidate.contacts.some((contact) => contact.normalizedValue === email)
          ? ['SAME_EMAIL']
          : []),
      ],
    }));
  }

  async scanCustomerDuplicates(id: string, expectedVersion: number, businessId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, businessId, status: 'ACTIVE' },
      include: {
        contacts: { select: { type: true, normalizedValue: true } },
        addresses: {
          where: { status: 'ACTIVE' },
          select: { line1: true, ward: true, district: true, province: true, countryCode: true },
        },
      },
    });
    if (!customer)
      throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy khách đang hoạt động.');
    if (customer.version !== expectedVersion)
      throw new ProblemException(
        409,
        'STALE_CUSTOMER',
        'Hồ sơ đã thay đổi; hãy tải lại trước khi quét.',
      );

    const phoneValues = customer.contacts
      .filter((item) => item.type === 'PHONE')
      .map((item) => item.normalizedValue);
    const emailValues = customer.contacts
      .filter((item) => item.type === 'EMAIL')
      .map((item) => item.normalizedValue);
    const indexedMatches =
      phoneValues.length || emailValues.length
        ? await this.prisma.customer.findMany({
            where: {
              businessId,
              status: 'ACTIVE',
              id: { not: id },
              contacts: {
                some: {
                  OR: [
                    ...(phoneValues.length
                      ? [{ type: 'PHONE' as const, normalizedValue: { in: phoneValues } }]
                      : []),
                    ...(emailValues.length
                      ? [{ type: 'EMAIL' as const, normalizedValue: { in: emailValues } }]
                      : []),
                  ],
                },
              },
            },
            take: 50,
            select: {
              id: true,
              version: true,
              contacts: { select: { type: true, normalizedValue: true } },
            },
          })
        : [];
    const candidates = new Map<string, { id: string; version: number; fields: string[] }>();
    for (const match of indexedMatches) {
      const fields = [
        ...(match.contacts.some(
          (contact) => contact.type === 'PHONE' && phoneValues.includes(contact.normalizedValue),
        )
          ? ['PHONE']
          : []),
        ...(match.contacts.some(
          (contact) => contact.type === 'EMAIL' && emailValues.includes(contact.normalizedValue),
        )
          ? ['EMAIL']
          : []),
      ];
      if (fields.length) candidates.set(match.id, { id: match.id, version: match.version, fields });
    }

    const customerAddresses = new Set(customer.addresses.map((item) => this.addressKey(item)));
    if (customer.nameNormalized && customerAddresses.size) {
      const named = await this.prisma.customer.findMany({
        where: {
          businessId,
          status: 'ACTIVE',
          id: { not: id },
          nameNormalized: customer.nameNormalized,
        },
        take: 50,
        select: {
          id: true,
          version: true,
          addresses: {
            where: { status: 'ACTIVE' },
            select: { line1: true, ward: true, district: true, province: true, countryCode: true },
          },
        },
      });
      for (const match of named) {
        if (match.addresses.some((address) => customerAddresses.has(this.addressKey(address)))) {
          const existing = candidates.get(match.id);
          candidates.set(match.id, {
            id: match.id,
            version: match.version,
            fields: [...(existing?.fields ?? []), 'NAME_AND_ADDRESS'],
          });
        }
      }
    }

    const created: Array<{
      id: string;
      customerId: string;
      status: string;
      evidence: Prisma.JsonValue;
    }> = [];
    for (const candidate of candidates.values()) {
      const customerAId = [id, candidate.id].sort()[0]!;
      const customerBId = [id, candidate.id].sort()[1]!;
      const versionA = customerAId === id ? customer.version : candidate.version;
      const versionB = customerBId === id ? customer.version : candidate.version;
      const fields = [...new Set(candidate.fields)].sort();
      const evidence = { fields, versionA, versionB, checkedAt: new Date().toISOString() };
      const evidenceFingerprint = this.hash({ fields, versionA, versionB });
      const suggestionKey = `${customerAId}:${customerBId}:${evidenceFingerprint}`;
      const suggestion = await this.prisma.customerDuplicateSuggestion.upsert({
        where: { businessId_suggestionKey: { businessId, suggestionKey } },
        create: {
          businessId,
          suggestionKey,
          customerAId,
          customerBId,
          evidence,
          evidenceFingerprint,
        },
        update: {},
        select: { id: true, status: true, evidence: true, customerAId: true },
      });
      created.push({
        id: suggestion.id,
        customerId: suggestion.customerAId === id ? candidate.id : customerAId,
        status: suggestion.status,
        evidence: suggestion.evidence,
      });
    }
    return { scannedCustomerId: id, candidates: created };
  }

  private addressKey(address: {
    line1: string;
    ward: string | null;
    district: string | null;
    province: string;
    countryCode: string;
  }) {
    return [address.line1, address.ward, address.district, address.province, address.countryCode]
      .map((value) => normalizeCustomerName(value ?? ''))
      .join('|');
  }

  private hash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  async duplicateSuggestions(businessId: string) {
    const rows = await this.prisma.customerDuplicateSuggestion.findMany({
      where: { businessId, status: 'PENDING' },
      take: 100,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        customerA: {
          select: {
            id: true,
            customerCode: true,
            displayName: true,
            version: true,
            contacts: { select: { type: true, value: true } },
            addresses: {
              where: { status: 'ACTIVE' },
              select: { line1: true, district: true, province: true },
            },
          },
        },
        customerB: {
          select: {
            id: true,
            customerCode: true,
            displayName: true,
            version: true,
            contacts: { select: { type: true, value: true } },
            addresses: {
              where: { status: 'ACTIVE' },
              select: { line1: true, district: true, province: true },
            },
          },
        },
      },
    });
    return rows;
  }

  async decideDuplicate(
    id: string,
    dto: DuplicateDecisionDto,
    actor: RequestStaff,
    requestId: string,
  ) {
    const suggestion = await this.prisma.customerDuplicateSuggestion.findFirst({
      where: { id, businessId: actor.businessId },
      include: {
        customerA: { select: { id: true, version: true, status: true } },
        customerB: { select: { id: true, version: true, status: true } },
      },
    });
    if (!suggestion)
      throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy đề xuất trùng.');
    if (suggestion.status !== 'PENDING' && dto.decision !== 'REVIEW_AGAIN')
      throw new ProblemException(409, 'DUPLICATE_ALREADY_DECIDED', 'Đề xuất đã được xử lý.');
    const sameVersion =
      suggestion.customerA.version === dto.versionA &&
      suggestion.customerB.version === dto.versionB;
    if (
      !sameVersion ||
      suggestion.customerA.status !== 'ACTIVE' ||
      suggestion.customerB.status !== 'ACTIVE'
    ) {
      await this.prisma.customerDuplicateSuggestion.update({
        where: { id },
        data: { status: 'STALE' },
      });
      throw new ProblemException(
        409,
        'STALE_DUPLICATE_EVIDENCE',
        'Hồ sơ đã thay đổi; không thể duyệt bằng bằng chứng cũ.',
      );
    }
    if (dto.decision === 'REJECT' && !dto.reason?.trim())
      throw new ProblemException(
        400,
        'DECISION_REASON_REQUIRED',
        'Cần ghi lý do đánh dấu khác người.',
      );
    if (dto.decision === 'REVIEW_AGAIN' && !dto.reason?.trim())
      throw new ProblemException(400, 'DECISION_REASON_REQUIRED', 'Cần ghi lý do xem xét lại.');
    const status =
      dto.decision === 'REJECT'
        ? 'REJECTED'
        : dto.decision === 'CONFIRM_SAME'
          ? 'ACCEPTED'
          : 'PENDING';
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.customerDuplicateSuggestion.updateMany({
        where: { id, businessId: actor.businessId, status: suggestion.status },
        data: {
          status,
          decisionReason:
            dto.reason?.trim() ??
            (dto.decision === 'CONFIRM_SAME'
              ? 'Người dùng xác nhận cùng một khách; chưa tự gộp.'
              : null),
          decidedById: actor.id,
          decidedAt: new Date(),
        },
      });
      if (changed.count !== 1)
        throw new ProblemException(
          409,
          'DUPLICATE_ALREADY_DECIDED',
          'Đề xuất đã được xử lý bởi người khác.',
        );
      await tx.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action: `customer.duplicate.${dto.decision.toLowerCase()}`,
          entityType: 'CustomerDuplicateSuggestion',
          entityId: id,
          requestId,
          metadata: {
            customerAId: suggestion.customerAId,
            customerBId: suggestion.customerBId,
            reason: dto.reason?.trim() ?? null,
            evidenceFingerprint: suggestion.evidenceFingerprint,
          },
        },
      });
      return tx.customerDuplicateSuggestion.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          status: true,
          decisionReason: true,
          decidedAt: true,
          decidedById: true,
        },
      });
    });
  }

  async create(dto: CreateCustomerDto, actor: RequestStaff, requestId: string) {
    const source = dto.source?.trim() || null;
    const groupCode = customerGroupFromSource(source) ?? dto.groupCode;
    const group = await this.requireGroup(actor.businessId, groupCode);
    const assignedStaffId = await this.requireAssignee(
      actor.businessId,
      dto.assignedStaffId ?? actor.id,
    );
    const contacts = this.normalizeContacts(dto.contacts);
    const duplicateCandidates = await this.duplicateCandidates(actor.businessId, {
      displayName: dto.displayName,
      phone: contacts.find((contact) => contact.type === 'PHONE')?.value,
      email: contacts.find((contact) => contact.type === 'EMAIL')?.value,
    });
    const id = randomUUID();
    const customerCode = `KH-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    await this.prisma.$transaction([
      this.prisma.customer.create({
        data: {
          id,
          businessId: actor.businessId,
          customerCode,
          displayName: dto.displayName.trim(),
          nameNormalized: normalizeCustomerName(dto.displayName),
          groupId: group.id,
          source,
          legalName: dto.legalName?.trim() || null,
          taxCode: dto.taxCode?.trim() || null,
          notes: dto.notes?.trim() || null,
          marketingConsent: Boolean(dto.marketingConsent),
          assignedStaffId,
          contacts: {
            create: contacts.map((contact) => ({ ...contact, businessId: actor.businessId })),
          },
          ...(dto.address ? { addresses: { create: this.cleanAddress(dto.address) } } : {}),
        },
      }),
      this.prisma.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action: 'customer.create',
          entityType: 'Customer',
          entityId: id,
          requestId,
          metadata: { customerCode, groupCode: group.code, contactCount: contacts.length },
        },
      }),
    ]);
    await this.scanCustomerDuplicates(id, 1, actor.businessId);
    return {
      customer: await this.getById(id, actor.businessId, actor.permissions),
      duplicateCandidates,
    };
  }

  async update(id: string, dto: UpdateCustomerDto, actor: RequestStaff, requestId: string) {
    const current = await this.prisma.customer.findFirst({
      where: { id, businessId: actor.businessId, status: 'ACTIVE' },
      select: { id: true, groupId: true, source: true },
    });
    if (!current) {
      throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy khách hàng.');
    }
    const effectiveSource = dto.source !== undefined ? dto.source.trim() || null : current.source;
    const groupCode = customerGroupFromSource(effectiveSource) ?? dto.groupCode;
    const groupId = groupCode
      ? (await this.requireGroup(actor.businessId, groupCode)).id
      : current.groupId;
    const assignedStaffId =
      dto.assignedStaffId === undefined
        ? undefined
        : await this.requireAssignee(actor.businessId, dto.assignedStaffId);
    const contacts = dto.contacts ? this.normalizeContacts(dto.contacts) : undefined;
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.customer.updateMany({
        where: { id, businessId: actor.businessId, version: dto.version, status: 'ACTIVE' },
        data: {
          ...(dto.displayName !== undefined
            ? {
                displayName: dto.displayName.trim(),
                nameNormalized: normalizeCustomerName(dto.displayName),
              }
            : {}),
          groupId,
          ...(dto.source !== undefined ? { source: dto.source.trim() || null } : {}),
          ...(dto.legalName !== undefined ? { legalName: dto.legalName.trim() || null } : {}),
          ...(dto.taxCode !== undefined ? { taxCode: dto.taxCode.trim() || null } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
          ...(dto.marketingConsent !== undefined ? { marketingConsent: dto.marketingConsent } : {}),
          ...(assignedStaffId !== undefined ? { assignedStaffId } : {}),
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new ProblemException(
          409,
          'VERSION_CONFLICT',
          'Hồ sơ đã được cập nhật ở nơi khác. Vui lòng tải lại.',
        );
      }
      if (contacts) {
        await tx.contactPoint.deleteMany({ where: { customerId: id } });
        if (contacts.length) {
          await tx.contactPoint.createMany({
            data: contacts.map((contact) => ({
              ...contact,
              businessId: actor.businessId,
              customerId: id,
            })),
          });
        }
      }
      await tx.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action: 'customer.update',
          entityType: 'Customer',
          entityId: id,
          requestId,
          metadata: { previousVersion: dto.version, contactCount: contacts?.length },
        },
      });
    });
    await this.scanCustomerDuplicates(id, dto.version + 1, actor.businessId);
    return this.getById(id, actor.businessId, actor.permissions);
  }

  private async mergeRelationCounts(customerId: string) {
    const [
      contacts,
      addresses,
      tasks,
      opportunities,
      notes,
      quotes,
      orders,
      receipts,
      receivables,
      returns,
      identities,
      externalOrders,
      creditBalances,
      creditApplications,
      creditEvents,
    ] = await Promise.all([
      this.prisma.contactPoint.count({ where: { customerId } }),
      this.prisma.address.count({ where: { customerId } }),
      this.prisma.customerTask.count({ where: { customerId } }),
      this.prisma.salesOpportunity.count({ where: { customerId } }),
      this.prisma.customerNote.count({ where: { customerId } }),
      this.prisma.quote.count({ where: { customerId } }),
      this.prisma.salesOrder.count({ where: { customerId } }),
      this.prisma.paymentReceipt.count({ where: { customerId } }),
      this.prisma.receivable.count({ where: { customerId } }),
      this.prisma.returnRequest.count({ where: { customerId } }),
      this.prisma.externalCustomerIdentity.count({ where: { customerId } }),
      this.prisma.externalOrder.count({ where: { customerId } }),
      this.prisma.customerCreditBalance.count({ where: { customerId } }),
      this.prisma.customerCreditApplication.count({ where: { customerId } }),
      this.prisma.customerCreditEvent.count({ where: { customerId } }),
    ]);
    return {
      contacts,
      addresses,
      tasks,
      opportunities,
      notes,
      quotes,
      orders,
      receipts,
      receivables,
      returns,
      identities,
      externalOrders,
      creditBalances,
      creditApplications,
      creditEvents,
    };
  }

  private mergePermissionBlocks(
    counts: Awaited<ReturnType<CustomersService['mergeRelationCounts']>>,
    permissions: string[],
  ) {
    const required: Partial<Record<keyof typeof counts, string[]>> = {
      tasks: ['tasks.manage'],
      opportunities: ['opportunities.manage'],
      quotes: ['quotes.read'],
      orders: ['orders.read'],
      receipts: ['payments.manage', 'receivables.view'],
      receivables: ['receivables.view'],
      returns: ['returns.read'],
      identities: ['integrations.read'],
      externalOrders: ['integrations.read'],
      creditBalances: ['payments.manage', 'receivables.view'],
      creditApplications: ['payments.manage', 'receivables.view'],
      creditEvents: ['payments.manage', 'receivables.view'],
    };
    const missing: string[] = [];
    for (const key of Object.keys(required) as (keyof typeof required)[]) {
      if (counts[key] > 0) {
        missing.push(
          ...(required[key] ?? []).filter((permission) => !permissions.includes(permission)),
        );
      }
    }
    return missing;
  }

  async mergePreview(sourceId: string, targetId: string, actor: RequestStaff) {
    if (sourceId === targetId)
      throw new ProblemException(400, 'INVALID_MERGE', 'Không thể gộp một hồ sơ vào chính nó.');
    const include = {
      group: { select: { name: true } },
      assignedStaff: { select: { id: true, displayName: true } },
      contacts: { select: { type: true, value: true, normalizedValue: true } },
      addresses: {
        where: { status: 'ACTIVE' as const },
        select: { line1: true, district: true, province: true },
      },
      creditBalance: { select: { id: true, balanceVnd: true } },
    };
    const [source, target] = await Promise.all([
      this.prisma.customer.findFirst({
        where: { id: sourceId, businessId: actor.businessId },
        include,
      }),
      this.prisma.customer.findFirst({
        where: { id: targetId, businessId: actor.businessId },
        include,
      }),
    ]);
    if (!source || !target)
      throw new ProblemException(
        404,
        'RESOURCE_NOT_FOUND',
        'Không tìm thấy một trong hai hồ sơ trong đơn vị.',
      );
    if (source.status !== 'ACTIVE' || target.status !== 'ACTIVE')
      throw new ProblemException(
        409,
        'MERGE_NOT_ACTIVE',
        'Chỉ có thể gộp hai hồ sơ đang hoạt động.',
      );
    const [sourceCounts, targetCounts] = await Promise.all([
      this.mergeRelationCounts(source.id),
      this.mergeRelationCounts(target.id),
    ]);
    const total = Object.fromEntries(
      Object.keys(sourceCounts).map((key) => [
        key,
        sourceCounts[key as keyof typeof sourceCounts] +
          targetCounts[key as keyof typeof targetCounts],
      ]),
    );
    const permissionBlocks = this.mergePermissionBlocks(
      total as Awaited<ReturnType<CustomersService['mergeRelationCounts']>>,
      actor.permissions,
    );
    const blockers = [
      ...(source.assignedStaffId !== target.assignedStaffId
        ? ['Hai hồ sơ có người phụ trách khác nhau; cần xử lý quyền sở hữu trước.']
        : []),
      ...(source.creditBalance && target.creditBalance
        ? ['Cả hai hồ sơ đều có số dư khách hàng; cần quyết định nghiệp vụ trước khi gộp.']
        : []),
      ...(permissionBlocks.length
        ? [`Thiếu quyền xem quan hệ cần chuyển: ${[...new Set(permissionBlocks)].join(', ')}.`]
        : []),
    ];
    const permissionRequirements: Partial<Record<keyof typeof total, string[]>> = {
      tasks: ['tasks.manage'],
      opportunities: ['opportunities.manage'],
      quotes: ['quotes.read'],
      orders: ['orders.read'],
      receipts: ['payments.manage', 'receivables.view'],
      receivables: ['receivables.view'],
      returns: ['returns.read'],
      identities: ['integrations.read'],
      externalOrders: ['integrations.read'],
      creditBalances: ['payments.manage', 'receivables.view'],
      creditApplications: ['payments.manage', 'receivables.view'],
      creditEvents: ['payments.manage', 'receivables.view'],
    };
    const visibleCounts = Object.fromEntries(
      Object.entries(total).filter(([key]) =>
        (permissionRequirements[key as keyof typeof permissionRequirements] ?? []).every(
          (permission) => actor.permissions.includes(permission),
        ),
      ),
    );
    return {
      source: {
        id: source.id,
        customerCode: source.customerCode,
        displayName: source.displayName,
        version: source.version,
        group: source.group.name,
        assignedStaff: source.assignedStaff,
        contacts: source.contacts.map(({ type, value }) => ({ type, value })),
        addresses: source.addresses,
      },
      target: {
        id: target.id,
        customerCode: target.customerCode,
        displayName: target.displayName,
        version: target.version,
        group: target.group.name,
        assignedStaff: target.assignedStaff,
        contacts: target.contacts.map(({ type, value }) => ({ type, value })),
        addresses: target.addresses,
      },
      keepProfileFieldsFrom: target.id,
      profileDifferences: [
        ...(source.displayName !== target.displayName ? ['displayName'] : []),
        ...(source.groupId !== target.groupId ? ['group'] : []),
        ...(source.source !== target.source ? ['source'] : []),
        ...(source.legalName !== target.legalName ? ['legalName'] : []),
        ...(source.taxCode !== target.taxCode ? ['taxCode'] : []),
        ...(source.notes !== target.notes ? ['notes'] : []),
        ...(source.marketingConsent !== target.marketingConsent ? ['marketingConsent'] : []),
        ...(source.contacts.length || target.contacts.length ? ['contacts'] : []),
        ...(source.addresses.length || target.addresses.length ? ['addresses'] : []),
      ],
      marketingConsent: 'Giữ nguyên lựa chọn của hồ sơ đích; không gộp consent giữa kênh.',
      relationCounts: visibleCounts,
      blockers,
      canMerge: blockers.length === 0,
    };
  }

  private checkMergeKey(key: string | undefined) {
    if (!key || !/^[A-Za-z0-9._:-]{8,100}$/.test(key))
      throw new ProblemException(
        400,
        'INVALID_IDEMPOTENCY_KEY',
        'Cần Idempotency-Key dài 8–100 ký tự hợp lệ.',
      );
    return key;
  }

  async merge(
    sourceId: string,
    dto: MergeCustomerDto,
    idempotencyKeyRaw: string | undefined,
    actor: RequestStaff,
    requestId: string,
  ) {
    const key = this.checkMergeKey(idempotencyKeyRaw);
    const requestHash = this.hash({
      sourceId,
      targetId: dto.targetCustomerId,
      sourceVersion: dto.sourceVersion,
      targetVersion: dto.targetVersion,
    });
    const prior = await this.prisma.customerMergeCommand.findUnique({
      where: { businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey: key } },
      select: { requestHash: true, response: true },
    });
    if (prior) {
      if (prior.requestHash !== requestHash)
        throw new ProblemException(
          409,
          'IDEMPOTENCY_CONFLICT',
          'Idempotency-Key đã dùng với nội dung khác.',
        );
      return prior.response;
    }
    const preview = await this.mergePreview(sourceId, dto.targetCustomerId, actor);
    if (!preview.canMerge)
      throw new ProblemException(409, 'MERGE_BLOCKED', preview.blockers.join(' '));
    if (
      preview.source.version !== dto.sourceVersion ||
      preview.target.version !== dto.targetVersion
    )
      throw new ProblemException(
        409,
        'VERSION_CONFLICT',
        'Một hồ sơ đã thay đổi; hãy tải lại preview.',
      );
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const repeated = await tx.customerMergeCommand.findUnique({
            where: {
              businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey: key },
            },
            select: { requestHash: true, response: true },
          });
          if (repeated) {
            if (repeated.requestHash !== requestHash)
              throw new ProblemException(
                409,
                'IDEMPOTENCY_CONFLICT',
                'Idempotency-Key đã dùng với nội dung khác.',
              );
            return repeated.response;
          }
          const source = await tx.customer.findFirst({
            where: {
              id: sourceId,
              businessId: actor.businessId,
              status: 'ACTIVE',
              version: dto.sourceVersion,
            },
            select: { id: true, assignedStaffId: true, version: true },
          });
          const target = await tx.customer.findFirst({
            where: {
              id: dto.targetCustomerId,
              businessId: actor.businessId,
              status: 'ACTIVE',
              version: dto.targetVersion,
            },
            select: {
              id: true,
              assignedStaffId: true,
              version: true,
              creditBalance: { select: { id: true } },
            },
          });
          if (!source || !target)
            throw new ProblemException(
              409,
              'VERSION_CONFLICT',
              'Hồ sơ đã thay đổi; hãy tải lại preview.',
            );
          if (source.assignedStaffId !== target.assignedStaffId)
            throw new ProblemException(
              409,
              'OWNERSHIP_CONFLICT',
              'Người phụ trách khác nhau; gộp bị chặn.',
            );
          const sourceCredit = await tx.customerCreditBalance.findUnique({
            where: { customerId: sourceId },
            select: { id: true },
          });
          if (sourceCredit && target.creditBalance)
            throw new ProblemException(
              409,
              'CREDIT_BALANCE_CONFLICT',
              'Cả hai hồ sơ có số dư; gộp bị chặn để không làm thay đổi tiền.',
            );

          const currentCounts = {
            contacts: await tx.contactPoint.count({ where: { customerId: sourceId } }),
            addresses: await tx.address.count({ where: { customerId: sourceId } }),
            tasks: await tx.customerTask.count({ where: { customerId: sourceId } }),
            opportunities: await tx.salesOpportunity.count({ where: { customerId: sourceId } }),
            notes: await tx.customerNote.count({ where: { customerId: sourceId } }),
            quotes: await tx.quote.count({ where: { customerId: sourceId } }),
            orders: await tx.salesOrder.count({ where: { customerId: sourceId } }),
            receipts: await tx.paymentReceipt.count({ where: { customerId: sourceId } }),
            receivables: await tx.receivable.count({ where: { customerId: sourceId } }),
            returns: await tx.returnRequest.count({ where: { customerId: sourceId } }),
            identities: await tx.externalCustomerIdentity.count({
              where: { customerId: sourceId },
            }),
            externalOrders: await tx.externalOrder.count({ where: { customerId: sourceId } }),
            creditBalances: await tx.customerCreditBalance.count({
              where: { customerId: sourceId },
            }),
            creditApplications: await tx.customerCreditApplication.count({
              where: { customerId: sourceId },
            }),
            creditEvents: await tx.customerCreditEvent.count({ where: { customerId: sourceId } }),
          };
          const missingPermissions = this.mergePermissionBlocks(currentCounts, actor.permissions);
          if (missingPermissions.length)
            throw new ProblemException(
              403,
              'MERGE_RELATION_PERMISSION_REQUIRED',
              `Thiếu quyền trên quan hệ phát sinh mới: ${[...new Set(missingPermissions)].join(', ')}.`,
            );

          const sourceContactRows = await tx.contactPoint.findMany({
            where: { customerId: sourceId },
            select: { id: true, type: true, value: true, normalizedValue: true },
          });
          const targetContactRows = await tx.contactPoint.findMany({
            where: { customerId: dto.targetCustomerId },
            select: { type: true, normalizedValue: true },
          });
          const targetKeys = new Set(
            targetContactRows.map((c) => `${c.type}:${c.normalizedValue}`),
          );
          const moveContactIds = sourceContactRows
            .filter((c) => !targetKeys.has(`${c.type}:${c.normalizedValue}`))
            .map((c) => c.id);
          if (moveContactIds.length)
            await tx.contactPoint.updateMany({
              where: { id: { in: moveContactIds } },
              data: { customerId: dto.targetCustomerId },
            });
          const targetDefault = await tx.address.count({
            where: { customerId: dto.targetCustomerId, isDefault: true, status: 'ACTIVE' },
          });
          if (targetDefault)
            await tx.address.updateMany({
              where: { customerId: sourceId, isDefault: true },
              data: { isDefault: false },
            });
          const transferCounts = {
            addresses: await tx.address.updateMany({
              where: { customerId: sourceId },
              data: { customerId: dto.targetCustomerId },
            }),
            tasks: await tx.customerTask.updateMany({
              where: { customerId: sourceId },
              data: { customerId: dto.targetCustomerId },
            }),
            opportunities: await tx.salesOpportunity.updateMany({
              where: { customerId: sourceId },
              data: { customerId: dto.targetCustomerId },
            }),
            notes: await tx.customerNote.updateMany({
              where: { customerId: sourceId },
              data: { customerId: dto.targetCustomerId },
            }),
            quotes: await tx.quote.updateMany({
              where: { customerId: sourceId },
              data: { customerId: dto.targetCustomerId },
            }),
            orders: await tx.salesOrder.updateMany({
              where: { customerId: sourceId },
              data: { customerId: dto.targetCustomerId },
            }),
            receipts: await tx.paymentReceipt.updateMany({
              where: { customerId: sourceId },
              data: { customerId: dto.targetCustomerId },
            }),
            receivables: await tx.receivable.updateMany({
              where: { customerId: sourceId },
              data: { customerId: dto.targetCustomerId },
            }),
            returns: await tx.returnRequest.updateMany({
              where: { customerId: sourceId },
              data: { customerId: dto.targetCustomerId },
            }),
            identities: await tx.externalCustomerIdentity.updateMany({
              where: { customerId: sourceId },
              data: { customerId: dto.targetCustomerId, version: { increment: 1 } },
            }),
            externalOrders: await tx.externalOrder.updateMany({
              where: { customerId: sourceId },
              data: { customerId: dto.targetCustomerId },
            }),
            creditBalances: await tx.customerCreditBalance.updateMany({
              where: { customerId: sourceId },
              data: { customerId: dto.targetCustomerId, version: { increment: 1 } },
            }),
            creditApplications: await tx.customerCreditApplication.updateMany({
              where: { customerId: sourceId },
              data: { customerId: dto.targetCustomerId },
            }),
            creditEvents: await tx.customerCreditEvent.updateMany({
              where: { customerId: sourceId },
              data: { customerId: dto.targetCustomerId },
            }),
          };
          const moved = Object.fromEntries(
            Object.entries(transferCounts).map(([name, result]) => [name, result.count]),
          );
          await tx.customerDuplicateSuggestion.updateMany({
            where: {
              businessId: actor.businessId,
              status: 'PENDING',
              OR: [{ customerAId: sourceId }, { customerBId: sourceId }],
            },
            data: { status: 'STALE' },
          });
          const changedSource = await tx.customer.updateMany({
            where: {
              id: sourceId,
              businessId: actor.businessId,
              version: dto.sourceVersion,
              status: 'ACTIVE',
            },
            data: {
              status: 'MERGED',
              mergedIntoId: dto.targetCustomerId,
              version: { increment: 1 },
            },
          });
          const changedTarget = await tx.customer.updateMany({
            where: {
              id: dto.targetCustomerId,
              businessId: actor.businessId,
              version: dto.targetVersion,
              status: 'ACTIVE',
            },
            data: { version: { increment: 1 } },
          });
          if (changedSource.count !== 1 || changedTarget.count !== 1)
            throw new ProblemException(409, 'VERSION_CONFLICT', 'Hồ sơ đã thay đổi đồng thời.');
          const response = {
            sourceCustomerId: sourceId,
            canonicalCustomerId: dto.targetCustomerId,
            moved,
            retainedDuplicateContacts: sourceContactRows.length - moveContactIds.length,
            mergedAt: new Date().toISOString(),
          };
          await tx.customerMergeCommand.create({
            data: {
              businessId: actor.businessId,
              idempotencyKey: key,
              requestHash,
              sourceId,
              targetId: dto.targetCustomerId,
              actorId: actor.id,
              response,
            },
          });
          await tx.auditLog.create({
            data: {
              businessId: actor.businessId,
              actorId: actor.id,
              action: 'customer.merge',
              entityType: 'Customer',
              entityId: sourceId,
              requestId,
              metadata: {
                targetCustomerId: dto.targetCustomerId,
                sourceVersion: dto.sourceVersion,
                targetVersion: dto.targetVersion,
                moved,
                retainedDuplicateContacts: sourceContactRows.length - moveContactIds.length,
                idempotencyKey: key,
              },
            },
          });
          return response;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      ) {
        const repeated = await this.prisma.customerMergeCommand.findUnique({
          where: {
            businessId_idempotencyKey: { businessId: actor.businessId, idempotencyKey: key },
          },
          select: { requestHash: true, response: true },
        });
        if (repeated?.requestHash === requestHash) return repeated.response;
        if (repeated)
          throw new ProblemException(
            409,
            'IDEMPOTENCY_CONFLICT',
            'Idempotency-Key đã dùng với nội dung khác.',
          );
        if (error.code === 'P2034')
          throw new ProblemException(
            409,
            'MERGE_CONCURRENT_CHANGE',
            'Có thao tác khác đang gộp hoặc cập nhật hồ sơ; hãy tải lại preview.',
          );
      }
      throw error;
    }
  }

  async addAddress(
    customerId: string,
    dto: AddressInputDto,
    actor: RequestStaff,
    requestId: string,
  ) {
    const canonicalId = await this.canonicalCustomerId(customerId, actor.businessId);
    const customer = await this.getById(customerId, actor.businessId, actor.permissions);
    const id = randomUUID();
    const data = this.cleanAddress(dto);
    await this.prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.address.updateMany({
          where: { customerId: canonicalId },
          data: { isDefault: false },
        });
      }
      await tx.address.create({ data: { id, customerId: canonicalId, ...data } });
      const versioned = await tx.customer.updateMany({
        where: {
          id: customer.id,
          businessId: actor.businessId,
          version: customer.version,
          status: 'ACTIVE',
        },
        data: { version: { increment: 1 } },
      });
      if (versioned.count !== 1)
        throw new ProblemException(
          409,
          'VERSION_CONFLICT',
          'Hồ sơ đã thay đổi; hãy tải lại trước khi thêm địa chỉ.',
        );
      await tx.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action: 'customer.address.create',
          entityType: 'Address',
          entityId: id,
          requestId,
          metadata: { customerId },
        },
      });
    });
    await this.scanCustomerDuplicates(customer.id, customer.version + 1, actor.businessId);
    return this.getById(canonicalId, actor.businessId, actor.permissions);
  }

  async updateAddress(
    customerId: string,
    addressId: string,
    dto: UpdateAddressDto,
    actor: RequestStaff,
    requestId: string,
  ) {
    const canonicalId = await this.canonicalCustomerId(customerId, actor.businessId);
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, customerId: canonicalId, customer: { businessId: actor.businessId } },
    });
    if (!address) {
      throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy địa chỉ.');
    }
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, businessId: actor.businessId, status: 'ACTIVE' },
      select: { id: true, version: true },
    });
    if (!customer)
      throw new ProblemException(
        404,
        'RESOURCE_NOT_FOUND',
        'Không tìm thấy khách hàng đang hoạt động.',
      );
    const data = this.cleanAddress(dto);
    await this.prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.address.updateMany({
          where: { customerId: canonicalId },
          data: { isDefault: false },
        });
      }
      await tx.address.update({
        where: { id: addressId },
        data: { ...data, ...(dto.status ? { status: dto.status } : {}) },
      });
      const versioned = await tx.customer.updateMany({
        where: { id: customer.id, businessId: actor.businessId, version: customer.version },
        data: { version: { increment: 1 } },
      });
      if (versioned.count !== 1)
        throw new ProblemException(
          409,
          'VERSION_CONFLICT',
          'Hồ sơ đã thay đổi; hãy tải lại trước khi sửa địa chỉ.',
        );
      await tx.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action: 'customer.address.update',
          entityType: 'Address',
          entityId: addressId,
          requestId,
          metadata: { customerId: canonicalId, status: dto.status },
        },
      });
    });
    await this.scanCustomerDuplicates(customer.id, customer.version + 1, actor.businessId);
    return this.getById(canonicalId, actor.businessId, actor.permissions);
  }
}
