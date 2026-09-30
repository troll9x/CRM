export const permissionKeys = [
  'staff.manage',
  'roles.manage',
  'cost.view',
  'price.edit',
  'orders.confirm',
  'inventory.adjust',
  'payments.manage',
  'receivables.view',
  'customers.export',
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
