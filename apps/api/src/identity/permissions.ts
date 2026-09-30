export const PERMISSIONS = {
  STAFF_MANAGE: 'staff.manage',
  ROLES_MANAGE: 'roles.manage',
  COST_VIEW: 'cost.view',
  PRICE_EDIT: 'price.edit',
  ORDERS_CONFIRM: 'orders.confirm',
  INVENTORY_ADJUST: 'inventory.adjust',
  PAYMENTS_MANAGE: 'payments.manage',
  RECEIVABLES_VIEW: 'receivables.view',
  CUSTOMERS_EXPORT: 'customers.export',
  CONNECTORS_MANAGE: 'connectors.manage',
} as const;

export const ALL_PERMISSION_KEYS = Object.values(PERMISSIONS);
