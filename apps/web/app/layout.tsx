import type { Metadata } from 'next';
import './globals.css';
import './commercial.css';

export const metadata: Metadata = {
  title: 'Sơn CRM',
  description: 'Quản lý khách hàng, bán hàng và vận hành cửa hàng bán sỉ, bán lẻ.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
