export const permissionKeys = [
  'overview.read',
  'staff.manage',
  'roles.manage',
  'cost.view',
  'price.edit',
  'orders.confirm',
  'inventory.adjust',
  'payments.manage',
  'receivables.view',
  'customers.read',
  'customers.write',
  'customers.export',
  'tasks.manage',
  'opportunities.manage',
  'catalog.read',
  'catalog.write',
  'media.manage',
  'purchasing.read',
  'purchasing.write',
  'inventory.read',
  'inventory.receive',
  'connectors.manage',
] as const;

export type PermissionKey = (typeof permissionKeys)[number];

export interface ApiMeta {
  requestId: string;
}

export interface ApiSuccess<T> {
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorDetail {
  field?: string;
  reason: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
    retryable: boolean;
  };
  meta: ApiMeta;
}

export interface CurrentStaff {
  id: string;
  displayName: string;
  email: string;
  business: { id: string; name: string };
  roles: string[];
  permissions: PermissionKey[];
}
