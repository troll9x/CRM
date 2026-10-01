import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client';
import { hashPassword } from '../src/identity/password';
import { ALL_PERMISSION_KEYS, PERMISSIONS } from '../src/identity/permissions';

loadEnv({ path: '../../.env', quiet: true });

const permissionDescriptions: Record<string, string> = {
  [PERMISSIONS.OVERVIEW_READ]: 'Xem tổng quan và bảng so sánh nghiệp vụ',
  [PERMISSIONS.STAFF_MANAGE]: 'Tạo, xem, khóa và mở khóa nhân viên',
  [PERMISSIONS.ROLES_MANAGE]: 'Xem và gán vai trò cho nhân viên',
  [PERMISSIONS.COST_VIEW]: 'Xem giá vốn và dữ liệu lợi nhuận liên quan',
  [PERMISSIONS.PRICE_EDIT]: 'Tạo và sửa bảng giá',
  [PERMISSIONS.ORDERS_CONFIRM]: 'Xác nhận đơn bán',
  [PERMISSIONS.INVENTORY_ADJUST]: 'Lập chứng từ điều chỉnh kho',
  [PERMISSIONS.PAYMENTS_MANAGE]: 'Ghi nhận thu, chi và hoàn tiền',
  [PERMISSIONS.RECEIVABLES_VIEW]: 'Xem công nợ và báo cáo phải thu',
  [PERMISSIONS.CUSTOMERS_READ]: 'Xem và tìm kiếm hồ sơ khách hàng',
  [PERMISSIONS.CUSTOMERS_WRITE]: 'Tạo và cập nhật hồ sơ, liên hệ, địa chỉ khách hàng',
  [PERMISSIONS.CUSTOMERS_EXPORT]: 'Xuất danh sách khách hàng',
  [PERMISSIONS.TASKS_MANAGE]: 'Tạo và cập nhật việc nhắc chăm sóc khách hàng',
  [PERMISSIONS.OPPORTUNITIES_MANAGE]: 'Tạo và cập nhật cơ hội bán hàng',
  [PERMISSIONS.CATALOG_READ]: 'Xem và tìm kiếm sản phẩm, SKU, đơn vị',
  [PERMISSIONS.CATALOG_WRITE]: 'Tạo, sửa và ngừng bán sản phẩm, SKU, quy đổi đơn vị',
  [PERMISSIONS.MEDIA_MANAGE]: 'Quản lý metadata ảnh sản phẩm',
  [PERMISSIONS.PURCHASING_READ]: 'Xem nhà cung cấp và đơn mua',
  [PERMISSIONS.PURCHASING_WRITE]: 'Tạo, sửa và phát hành đơn mua',
  [PERMISSIONS.INVENTORY_READ]: 'Xem số lượng tồn và sổ kho',
  [PERMISSIONS.INVENTORY_RECEIVE]: 'Nhận hàng theo đơn mua đã phát hành',
  [PERMISSIONS.CONNECTORS_MANAGE]: 'Cấu hình và thu hồi connector',
};

const roles = [
  {
    code: 'owner',
    name: 'Chủ cửa hàng',
    description: 'Toàn quyền trong đơn vị kinh doanh',
    permissions: ALL_PERMISSION_KEYS,
  },
  {
    code: 'sales',
    name: 'Bán hàng',
    description: 'Quyền nghiệp vụ bán hàng sẽ được bổ sung theo từng đợt',
    permissions: [
      PERMISSIONS.OVERVIEW_READ,
      PERMISSIONS.CUSTOMERS_READ,
      PERMISSIONS.CUSTOMERS_WRITE,
      PERMISSIONS.TASKS_MANAGE,
      PERMISSIONS.OPPORTUNITIES_MANAGE,
      PERMISSIONS.CATALOG_READ,
      PERMISSIONS.ORDERS_CONFIRM,
    ],
  },
  {
    code: 'warehouse',
    name: 'Kho',
    description: 'Thao tác kho theo chứng từ',
    permissions: [
      PERMISSIONS.OVERVIEW_READ,
      PERMISSIONS.CATALOG_READ,
      PERMISSIONS.PURCHASING_READ,
      PERMISSIONS.PURCHASING_WRITE,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.INVENTORY_RECEIVE,
      PERMISSIONS.INVENTORY_ADJUST,
    ],
  },
  {
    code: 'finance',
    name: 'Theo dõi thu chi',
    description: 'Thu chi và công nợ, không mặc định xác nhận đơn',
    permissions: [
      PERMISSIONS.OVERVIEW_READ,
      PERMISSIONS.PAYMENTS_MANAGE,
      PERMISSIONS.RECEIVABLES_VIEW,
    ],
  },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed local/test bị từ chối trong NODE_ENV=production.');
  }
  const connectionString = process.env.DATABASE_URL;
  const ownerEmail = process.env.SEED_OWNER_EMAIL;
  const ownerPassword = process.env.SEED_OWNER_PASSWORD;
  const ownerName = process.env.SEED_OWNER_NAME ?? 'Chủ cửa hàng';
  if (!connectionString || !ownerEmail || !ownerPassword) {
    throw new Error('Cần DATABASE_URL, SEED_OWNER_EMAIL và SEED_OWNER_PASSWORD để seed.');
  }
  if (ownerPassword.length < 12) throw new Error('SEED_OWNER_PASSWORD phải có ít nhất 12 ký tự.');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const business = await prisma.business.upsert({
      where: { id: 'business_local_default' },
      update: {},
      create: {
        id: 'business_local_default',
        name: 'Cửa hàng Sơn',
        timezone: 'Asia/Ho_Chi_Minh',
        currency: 'VND',
      },
    });

    for (const key of ALL_PERMISSION_KEYS) {
      await prisma.permission.upsert({
        where: { key },
        update: { description: permissionDescriptions[key] ?? key },
        create: { key, description: permissionDescriptions[key] ?? key },
      });
    }

    await prisma.warehouse.upsert({
      where: { businessId_code: { businessId: business.id, code: 'KHO-CHINH' } },
      update: { name: 'Kho chính', status: 'ACTIVE' },
      create: {
        businessId: business.id,
        code: 'KHO-CHINH',
        name: 'Kho chính',
      },
    });

    const seededRoles = new Map<string, string>();
    for (const definition of roles) {
      const role = await prisma.role.upsert({
        where: { businessId_code: { businessId: business.id, code: definition.code } },
        update: { name: definition.name, description: definition.description, isSystem: true },
        create: {
          businessId: business.id,
          code: definition.code,
          name: definition.name,
          description: definition.description,
          isSystem: true,
        },
      });
      seededRoles.set(definition.code, role.id);
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      await prisma.rolePermission.createMany({
        data: definition.permissions.map((permissionKey) => ({ roleId: role.id, permissionKey })),
      });
    }

    const emailNormalized = ownerEmail.trim().toLocaleLowerCase('en-US');

    for (const group of [
      { code: 'retail', name: 'Khách lẻ', description: 'Khách mua lẻ mặc định' },
      { code: 'wholesale', name: 'Khách sỉ', description: 'Khách sỉ hoặc đại lý' },
    ]) {
      await prisma.customerGroup.upsert({
        where: { businessId_code: { businessId: business.id, code: group.code } },
        update: { name: group.name, description: group.description, isSystem: true },
        create: { businessId: business.id, ...group, isSystem: true },
      });
    }

    const existingOwner = await prisma.staffUser.findUnique({ where: { emailNormalized } });
    let ownerId: string;
    if (existingOwner) {
      const owner = await prisma.staffUser.update({
        where: { id: existingOwner.id },
        data: { businessId: business.id, displayName: ownerName, status: 'ACTIVE' },
      });
      ownerId = owner.id;
    } else {
      const owner = await prisma.staffUser.create({
        data: {
          businessId: business.id,
          email: ownerEmail.trim(),
          emailNormalized,
          displayName: ownerName,
          passwordHash: await hashPassword(ownerPassword),
          status: 'ACTIVE',
        },
      });
      ownerId = owner.id;
    }

    const ownerRoleId = seededRoles.get('owner')!;
    await prisma.staffUserRole.upsert({
      where: { staffUserId_roleId: { staffUserId: ownerId, roleId: ownerRoleId } },
      update: {},
      create: { staffUserId: ownerId, roleId: ownerRoleId },
    });
    console.log(`Seed hoàn tất cho owner ${emailNormalized}; mật khẩu không được in ra.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
