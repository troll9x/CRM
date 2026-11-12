import type { ReactNode } from 'react';

export function SocialMessageBubble({
  direction,
  account,
  providerAt,
  body,
  children,
}: {
  direction: string;
  account: string;
  providerAt: string;
  body: string | null;
  children?: ReactNode;
}) {
  const outbound = direction === 'OUTBOUND_ECHO';
  const system = direction === 'SYSTEM';
  return (
    <article className={`social-bubble ${outbound ? 'outbound' : system ? 'system' : 'inbound'}`}>
      <small>
        {outbound ? account || 'Fanpage' : system ? 'Hệ thống' : 'Khách'} ·{' '}
        {new Date(providerAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
      </small>
      {body && <p>{body}</p>}
      {children}
    </article>
  );
}
