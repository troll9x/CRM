import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Chính sách quyền riêng tư | Sơn CRM',
  description: 'Cách Sơn CRM xử lý dữ liệu khách hàng và Facebook Page được kết nối.',
};

export default function PrivacyPage() {
  return (
    <main className="policy-page">
      <article className="policy-card">
        <Link className="policy-home" href="/">
          Sơn CRM
        </Link>
        <p className="eyebrow">CẬP NHẬT 22/10/2026</p>
        <h1>Chính sách quyền riêng tư</h1>
        <p>
          Sơn CRM là đơn vị vận hành hệ thống tại <strong>crm.nguyenhongson.vn</strong>. Gửi câu hỏi
          hoặc yêu cầu liên quan đến dữ liệu tới{' '}
          <a href="mailto:sonnh.mkt@gmail.com">sonnh.mkt@gmail.com</a>.
        </p>

        <h2>Dữ liệu được xử lý</h2>
        <p>
          Khi người quản lý kết nối Facebook Page, CRM lưu ID và tên Page, trạng thái kết nối, quyền
          được cấp, thông tin đăng ký webhook và token truy cập được mã hóa. CRM có thể nhận hoặc
          nhập trong phạm vi Meta cho phép các hội thoại Messenger, tin nhắn, bình luận trên bài
          viết Page, ID người tương tác, thời điểm, nội dung và thông tin tệp/đường dẫn do Meta cung
          cấp. CRM lưu cả thao tác trả lời của nhân viên, trạng thái xử lý và ID phản hồi của Meta.
        </p>
        <p>
          Nhân viên có quyền có thể liên kết tương tác với hồ sơ khách, tạo ticket và báo giá. CRM
          cũng lưu tài khoản nhân viên, phân quyền và nhật ký thao tác cần thiết để vận hành và bảo
          vệ hệ thống. Dữ liệu của mỗi Page được gắn với Page và đơn vị sử dụng tương ứng.
        </p>

        <h2>Mục đích và chia sẻ</h2>
        <p>
          Dữ liệu được dùng để chăm sóc khách hàng, xem và trả lời tương tác, theo dõi công việc,
          lập báo giá và quản lý kết nối Page. Khi nhân viên gửi trả lời, nội dung được chuyển tới
          Meta để gửi qua Messenger hoặc đăng trả lời bình luận theo quyền mà Meta cấp. Sơn CRM
          không bán dữ liệu hội thoại cho bên thứ ba và không dùng quyền này để gửi marketing tự
          động. Meta xử lý dữ liệu trên nền tảng của họ theo chính sách riêng.
        </p>

        <h2>Ai được xem và cách bảo vệ</h2>
        <p>
          Chủ đơn vị và nhân viên được cấp quyền CRM mới có thể xem hoặc xử lý dữ liệu theo vai trò
          và từng Page. Quản trị viên có thể cấp hoặc thu hồi quyền nhân viên theo Page. Token được
          mã hóa khi lưu và không hiển thị cho nhân viên trong giao diện. Kết nối đến CRM dùng
          HTTPS; các thao tác quan trọng có nhật ký.
        </p>

        <h2>Thời gian lưu</h2>
        <p>
          Theo lựa chọn của đơn vị vận hành, CRM giữ lịch sử tin nhắn và bình luận lâu dài trong
          thời gian còn phục vụ khách hàng, để theo dõi các trao đổi và hỗ trợ khách tiếp tục. Hệ
          thống hiện không tự xóa lịch sử theo một số ngày cố định. Khi mục đích chăm sóc kết thúc
          hoặc có yêu cầu dữ liệu hợp lệ, Sơn CRM sẽ xem xét dữ liệu cần xóa, sửa hoặc giữ lại theo
          phạm vi yêu cầu và nghĩa vụ liên quan. Bản sao lưu phục vụ khôi phục có thể còn chứa dữ
          liệu sau khi bản đang hoạt động được xử lý; hiện chưa có lịch xóa bản sao lưu tự động được
          xác nhận.
        </p>

        <h2 id="data-requests">Yêu cầu xem, xuất, sửa hoặc xóa dữ liệu</h2>
        <p>
          Gửi yêu cầu tới <a href="mailto:sonnh.mkt@gmail.com">sonnh.mkt@gmail.com</a>, nêu Page
          hoặc cuộc hội thoại liên quan và cách liên hệ để xác minh quyền yêu cầu. Không gửi mật
          khẩu, mã OTP hoặc token. Sơn CRM sẽ xác minh người yêu cầu, xác định dữ liệu thuộc phạm vi
          quản lý của mình và phản hồi cách xử lý. Hiện chưa có công cụ tự phục vụ hoặc thao tác
          xóa/xuất tự động cho người nhắn tin. Ngắt một Page sẽ ngừng dùng token của Page đó trong
          CRM, nhưng không tự xóa lịch sử đã lưu và không xóa dữ liệu do Meta giữ. Xem thêm{' '}
          <Link href="/data-deletion">hướng dẫn yêu cầu xóa dữ liệu</Link>.
        </p>

        <h2>Thay đổi chính sách</h2>
        <p>
          Khi cách xử lý dữ liệu thay đổi, Sơn CRM sẽ cập nhật nội dung và ngày cập nhật tại trang
          này. Mọi câu hỏi có thể gửi tới email liên hệ ở trên.
        </p>
      </article>
    </main>
  );
}
