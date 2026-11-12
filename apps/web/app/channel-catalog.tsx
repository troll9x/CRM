'use client';

import { useRef, useState } from 'react';

const channels = [
  {
    id: 'FACEBOOK',
    name: 'Facebook',
    mark: 'f',
    description: 'Tin nhắn Messenger và bình luận Fanpage.',
    portal: 'https://developers.facebook.com/',
    account: 'Fanpage',
  },
  {
    id: 'ZALO',
    name: 'Zalo OA',
    mark: 'Z',
    description: 'Hội thoại từ Zalo Official Account.',
    portal: 'https://developers.zalo.me/',
    account: 'Official Account',
  },
  {
    id: 'SHOPEE',
    name: 'Shopee',
    mark: 'S',
    description: 'Quản lý dữ liệu đơn hàng từ gian hàng.',
    portal: 'https://open.shopee.com/',
    account: 'gian hàng Shopee',
  },
  {
    id: 'TIKTOK_SHOP',
    name: 'TikTok Shop',
    mark: '♪',
    description: 'Quản lý dữ liệu đơn hàng từ TikTok Shop.',
    portal: 'https://partner.tiktokshop.com/',
    account: 'gian hàng TikTok Shop',
  },
] as const;

type Props = {
  preflight: Array<{
    provider: string;
    canStartAuthorization: boolean;
    missingConfiguration: string[];
  }>;
  connections: Array<{ provider: string; status: string }>;
  busy: boolean;
  onConnect: (provider: 'FACEBOOK' | 'ZALO') => void;
};

export function ChannelCatalog({ preflight, connections, busy, onConnect }: Props) {
  const [setup, setSetup] = useState<(typeof channels)[number] | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <div className="channel-catalog">
        {channels.map((channel) => {
          const config = preflight.find((item) => item.provider === channel.id);
          const supported = channel.id === 'FACEBOOK' || channel.id === 'ZALO';
          const ready = supported && config?.canStartAuthorization;
          const count = connections.filter(
            (item) => item.provider === channel.id && item.status === 'CONNECTED',
          ).length;
          return (
            <article className="channel-provider-card" key={channel.id}>
              <div className="channel-provider-heading">
                <span
                  className={`channel-brand channel-brand-${channel.id.toLowerCase()}`}
                  aria-hidden="true"
                >
                  {channel.mark}
                </span>
                <h3>{channel.name}</h3>
              </div>
              <p>{channel.description}</p>
              <span className={`channel-provider-state ${count ? 'is-connected' : ''}`}>
                {count
                  ? `${count} tài khoản đã cấp quyền`
                  : ready
                    ? 'Sẵn sàng kết nối'
                    : config
                      ? 'Cần thiết lập dịch vụ'
                      : 'Đang tải trạng thái…'}
              </span>
              <button
                className={ready ? 'primary' : 'secondary'}
                disabled={busy || !config}
                aria-label={`${ready ? 'Kết nối' : 'Thiết lập'} ${channel.name}`}
                onClick={() => {
                  if (ready && (channel.id === 'FACEBOOK' || channel.id === 'ZALO'))
                    onConnect(channel.id);
                  else {
                    setSetup(channel);
                    dialog.current?.showModal();
                  }
                }}
              >
                {ready ? (count ? 'Thêm tài khoản' : 'Kết nối') : 'Thiết lập'}
                <span aria-hidden="true"> ↗</span>
              </button>
            </article>
          );
        })}
      </div>
      <dialog
        className="channel-setup-dialog"
        ref={dialog}
        onClose={() => setSetup(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
        aria-labelledby="channel-setup-title"
      >
        {setup && (
          <>
            <div className="channel-section-heading">
              <h2 id="channel-setup-title">Thiết lập {setup.name}</h2>
              <button
                className="secondary"
                autoFocus
                onClick={() => dialog.current?.close()}
                aria-label="Đóng hướng dẫn"
              >
                Đóng
              </button>
            </div>
            <p>
              Quản trị viên thiết lập ứng dụng một lần cho CRM. Sau khi dịch vụ được bật, người dùng
              kết nối {setup.account} qua trang cấp quyền của nền tảng.
            </p>
            <ol>
              <li>Đăng ký ứng dụng trên cổng nhà phát triển và xin quyền phù hợp.</li>
              <li>
                Lưu khóa ứng dụng trực tiếp trên máy chủ CRM, thiết lập địa chỉ callback và webhook
                theo tài liệu triển khai.
              </li>
              <li>
                {setup.id === 'SHOPEE' || setup.id === 'TIKTOK_SHOP'
                  ? 'Hoàn thiện bộ kết nối cấp quyền và nhập đơn, kiểm thử với gian hàng trước khi bật dịch vụ. Bản hiện tại chưa hỗ trợ cấp quyền hai sàn này.'
                  : 'Bật dịch vụ, cấp quyền tài khoản và kiểm tra nhận dữ liệu trong CRM.'}
              </li>
            </ol>
            <p className="muted">
              Không nhập mật khẩu tài khoản kênh hoặc khóa ứng dụng vào hộp thư CRM.
            </p>
            <a
              className="channel-portal-link"
              href={setup.portal}
              target="_blank"
              rel="noopener noreferrer"
            >
              Mở cổng nhà phát triển {setup.name} ↗
            </a>
          </>
        )}
      </dialog>
    </>
  );
}
