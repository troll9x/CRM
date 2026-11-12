export type WorkspaceId =
  | 'overview'
  | 'customers'
  | 'integrations'
  | 'quotes'
  | 'orders'
  | 'products'
  | 'pricing'
  | 'purchasing'
  | 'inventory'
  | 'shipments'
  | 'returns'
  | 'receivables'
  | 'staff';
export type IconName =
  WorkspaceId | 'search' | 'menu' | 'close' | 'chevron' | 'logout' | 'eye' | 'eye-off';
export type WorkspaceItem = {
  id: WorkspaceId;
  label: string;
  group: string;
  description: string;
  keywords: string;
  permission: string;
};
export const WORKSPACES: WorkspaceItem[] = [
  {
    id: 'overview',
    label: 'Tổng quan',
    group: 'Không gian làm việc',
    description: 'Theo dõi hoạt động kinh doanh',
    keywords: 'dashboard báo cáo doanh thu',
    permission: 'overview.read',
  },
  {
    id: 'customers',
    label: 'Khách hàng',
    group: 'Bán hàng',
    description: 'Hồ sơ, lịch sử và chăm sóc khách hàng',
    keywords: 'customer liên hệ cơ hội',
    permission: 'customers.read',
  },
  {
    id: 'integrations',
    label: 'Hộp thư đa kênh',
    group: 'Bán hàng',
    description: 'Hội thoại, bình luận và kết nối kênh',
    keywords: 'facebook messenger zalo đồng bộ chat page',
    permission: 'integrations.read',
  },
  {
    id: 'quotes',
    label: 'Báo giá',
    group: 'Bán hàng',
    description: 'Lập và theo dõi báo giá khách hàng',
    keywords: 'quote giá chào',
    permission: 'quotes.read',
  },
  {
    id: 'orders',
    label: 'Đơn hàng',
    group: 'Bán hàng',
    description: 'Đơn bán và trạng thái xử lý',
    keywords: 'order bán hàng',
    permission: 'orders.read',
  },
  {
    id: 'products',
    label: 'Sản phẩm',
    group: 'Hàng hóa & vận hành',
    description: 'Danh mục hàng hóa, SKU và đơn vị',
    keywords: 'catalog nhập excel shopee',
    permission: 'catalog.read',
  },
  {
    id: 'pricing',
    label: 'Bảng giá',
    group: 'Hàng hóa & vận hành',
    description: 'Quản lý giá bán theo SKU và bậc',
    keywords: 'price sỉ lẻ',
    permission: 'price.edit',
  },
  {
    id: 'purchasing',
    label: 'Mua hàng',
    group: 'Hàng hóa & vận hành',
    description: 'Nhà cung cấp và đơn mua',
    keywords: 'purchase nhập hàng supplier',
    permission: 'purchasing.read',
  },
  {
    id: 'inventory',
    label: 'Kho hàng',
    group: 'Hàng hóa & vận hành',
    description: 'Tồn kho, nhận hàng và kiểm kê',
    keywords: 'stock inventory nhập tồn điều chỉnh',
    permission: 'inventory.read',
  },
  {
    id: 'shipments',
    label: 'Xuất kho & giao',
    group: 'Hàng hóa & vận hành',
    description: 'Chuẩn bị hàng và theo dõi giao hàng',
    keywords: 'shipment vận chuyển',
    permission: 'shipments.read',
  },
  {
    id: 'returns',
    label: 'Đổi trả',
    group: 'Hàng hóa & vận hành',
    description: 'Tiếp nhận và kiểm tra hàng trả',
    keywords: 'return hoàn hàng',
    permission: 'returns.*',
  },
  {
    id: 'receivables',
    label: 'Công nợ',
    group: 'Tài chính',
    description: 'Theo dõi thanh toán và số dư khách hàng',
    keywords: 'finance thu tiền thanh toán',
    permission: 'receivables.view',
  },
  {
    id: 'staff',
    label: 'Tài khoản & phân quyền',
    group: 'Quản trị',
    description: 'Quản lý nhân viên và quyền truy cập',
    keywords: 'staff role nhân viên mật khẩu',
    permission: 'staff.manage',
  },
];

export function allowedWorkspaces(permissions: readonly string[]) {
  return WORKSPACES.filter((item) =>
    item.permission.endsWith('.*')
      ? permissions.some((key) => key.startsWith(item.permission.slice(0, -1)))
      : permissions.includes(item.permission),
  );
}

export function resolveWorkspace(
  hash: string,
  items: readonly WorkspaceItem[],
): WorkspaceId | null {
  const requested = hash.replace(/^#/, '');
  return items.find((item) => item.id === requested)?.id ?? items[0]?.id ?? null;
}

export function searchWorkspaces(query: string, items: readonly WorkspaceItem[]) {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();
  const tokens = normalize(query.trim()).split(/\s+/).filter(Boolean);
  return items.filter((item) =>
    tokens.every((token) => normalize(`${item.label} ${item.keywords}`).includes(token)),
  );
}
