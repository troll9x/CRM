import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sơn CRM',
  description: 'CRM nội bộ cho cửa hàng bán sỉ và bán lẻ',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
