import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Yêu cầu xóa dữ liệu | Sơn CRM',
  description: 'Cách gửi yêu cầu xóa dữ liệu được lưu trong Sơn CRM.',
};

export default function DataDeletionPage() {
  return (
    <main className="policy-page">
      <article className="policy-card">
        <Link className="policy-home" href="/">
          Sơn CRM
        </Link>
        <p className="eyebrow">CẬP NHẬT 22/10/2026</p>
        <h1>Yêu cầu xóa dữ liệu</h1>
        <p>
          Nếu muốn Sơn CRM xem xét xóa dữ liệu liên quan đến bạn hoặc Facebook Page bạn quản lý, hãy
          gửi email tới <a href="mailto:sonnh.mkt@gmail.com">sonnh.mkt@gmail.com</a>. Nêu Page, cuộc
          hội thoại hoặc bình luận liên quan và cách liên hệ để xác minh quyền yêu cầu. Không gửi
          mật khẩu, mã OTP hoặc token qua email.
        </p>
        <p>
          Sơn CRM sẽ xác minh người yêu cầu, xác định dữ liệu trong CRM và thông báo cách xử lý phù
          hợp. Một số thông tin có thể cần giữ để giải quyết công việc hoặc nghĩa vụ liên quan. Dữ
          liệu trong bản sao lưu có thể còn tồn tại sau khi bản đang hoạt động được xử lý; hiện chưa
          có cơ chế xóa tự động theo yêu cầu. Việc xóa tại Sơn CRM không xóa dữ liệu trên Facebook
          hoặc Messenger.
        </p>
        <p>
          Quy trình này được xử lý thủ công qua email. Xem{' '}
          <Link href="/privacy">chính sách quyền riêng tư</Link> để biết loại dữ liệu và mục đích sử
          dụng.
        </p>
      </article>
    </main>
  );
}
