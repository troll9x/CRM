import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ProblemException } from '../common/problem.exception';
import type { RequestStaff } from '../common/request-context';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeCustomerName, normalizeEmail, normalizePhone } from './customer-normalization';
import type {
  AddressInputDto,
  ContactInputDto,
  CreateCustomerDto,
  DuplicateCandidatesQueryDto,
  ListCustomersQueryDto,
  UpdateAddressDto,
  UpdateCustomerDto,
} from './dto/customer.dto';

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

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

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

  async list(businessId: string, query: ListCustomersQueryDto) {
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
    return { items, nextCursor: hasMore ? items.at(-1)?.id : null, hasMore };
  }

  async getById(id: string, businessId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, businessId },
      select: customerDetailSelect,
    });
    if (!customer) {
      throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy khách hàng.');
    }
    return customer;
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

  async create(dto: CreateCustomerDto, actor: RequestStaff, requestId: string) {
    const group = await this.requireGroup(actor.businessId, dto.groupCode);
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
          source: dto.source?.trim() || null,
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
    return { customer: await this.getById(id, actor.businessId), duplicateCandidates };
  }

  async update(id: string, dto: UpdateCustomerDto, actor: RequestStaff, requestId: string) {
    const current = await this.prisma.customer.findFirst({
      where: { id, businessId: actor.businessId },
      select: { id: true, groupId: true },
    });
    if (!current) {
      throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy khách hàng.');
    }
    const groupId = dto.groupCode
      ? (await this.requireGroup(actor.businessId, dto.groupCode)).id
      : current.groupId;
    const assignedStaffId =
      dto.assignedStaffId === undefined
        ? undefined
        : await this.requireAssignee(actor.businessId, dto.assignedStaffId);
    const contacts = dto.contacts ? this.normalizeContacts(dto.contacts) : undefined;
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.customer.updateMany({
        where: { id, businessId: actor.businessId, version: dto.version },
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
    return this.getById(id, actor.businessId);
  }

  async addAddress(
    customerId: string,
    dto: AddressInputDto,
    actor: RequestStaff,
    requestId: string,
  ) {
    await this.getById(customerId, actor.businessId);
    const id = randomUUID();
    const data = this.cleanAddress(dto);
    await this.prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
      }
      await tx.address.create({ data: { id, customerId, ...data } });
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
    return this.getById(customerId, actor.businessId);
  }

  async updateAddress(
    customerId: string,
    addressId: string,
    dto: UpdateAddressDto,
    actor: RequestStaff,
    requestId: string,
  ) {
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, customerId, customer: { businessId: actor.businessId } },
    });
    if (!address) {
      throw new ProblemException(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy địa chỉ.');
    }
    const data = this.cleanAddress(dto);
    await this.prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
      }
      await tx.address.update({
        where: { id: addressId },
        data: { ...data, ...(dto.status ? { status: dto.status } : {}) },
      });
      await tx.auditLog.create({
        data: {
          businessId: actor.businessId,
          actorId: actor.id,
          action: 'customer.address.update',
          entityType: 'Address',
          entityId: addressId,
          requestId,
          metadata: { customerId, status: dto.status },
        },
      });
    });
    return this.getById(customerId, actor.businessId);
  }
}
