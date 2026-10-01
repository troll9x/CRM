export const PERMISSIONS = {
  STAFF_MANAGE: 'staff.manage',
  ROLES_MANAGE: 'roles.manage',
  COST_VIEW: 'cost.view',
  PRICE_EDIT: 'price.edit',
  ORDERS_CONFIRM: 'orders.confirm',
  INVENTORY_ADJUST: 'inventory.adjust',
  PAYMENTS_MANAGE: 'payments.manage',
  RECEIVABLES_VIEW: 'receivables.view',
  CUSTOMERS_READ: 'customers.read',
  CUSTOMERS_WRITE: 'customers.write',
  CUSTOMERS_EXPORT: 'customers.export',
  TASKS_MANAGE: 'tasks.manage',
  OPPORTUNITIES_MANAGE: 'opportunities.manage',
  CATALOG_READ: 'catalog.read',
  CATALOG_WRITE: 'catalog.write',
  MEDIA_MANAGE: 'media.manage',
  PURCHASING_READ: 'purchasing.read',
  PURCHASING_WRITE: 'purchasing.write',
  CONNECTORS_MANAGE: 'connectors.manage',
} as const;

export const ALL_PERMISSION_KEYS = Object.values(PERMISSIONS);
