'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api, type Staff } from './api-client';

type ProductVariant = {
  id: string;
  sku: string;
  name: string;
  baseUnitName: string;
  sellingUnitName: string;
  status: 'ACTIVE' | 'INACTIVE';
};

type ProductSummary = {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
  variants: ProductVariant[];
};

type PriceTier = {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  variantName: string;
  baseUnitCode: string;
  baseUnitName: string;
  sellingUnitName: string;
  quantityFrom: number;
  priceVnd: string;
  version: number;
  updatedAt: string;
};

type PriceResolution = {
  variantId: string;
  quantity: string;
  quantityFrom: number;
  priceVnd: string | null;
  source: 'ADMIN' | null;
  status: 'RESOLVED' | 'PRICE_NOT_CONFIGURED';
};

function formatVnd(value: string) {
  try {
    return `${BigInt(value).toLocaleString('vi-VN')} ₫`;
  } catch {
    return `${value} ₫`;
  }
}

export function PricingWorkspace({
  staff,
  onLogout,
  loggingOut,
}: {
  staff: Staff;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [tiers, setTiers] = useState<PriceTier[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [visibleTiersByVariant, setVisibleTiersByVariant] = useState<Record<string, number>>({});
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState('6');
  const [resolution, setResolution] = useState<PriceResolution | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingTier, setSavingTier] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const pendingKeys = useRef(new Map<string, string>());

  const variants = useMemo(
    () =>
      products.flatMap((product) =>
        product.status === 'ACTIVE'
          ? product.variants
              .filter((variant) => variant.status === 'ACTIVE')
              .map((variant) => ({ ...variant, productName: product.name }))
          : [],
      ),
    [products],
  );
  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId);
  const selectedTiers = tiers.filter((tier) => tier.variantId === selectedVariantId);
  const maxVisibleTier = visibleTiersByVariant[selectedVariantId] ?? 20;
  const tierStarts = useMemo(
    () =>
      [1, ...Array.from({ length: Math.max(4, maxVisibleTier / 5) }, (_, index) => (index + 1) * 5)]
        .concat(selectedTiers.map(({ quantityFrom }) => quantityFrom))
        .filter((value, index, all) => all.indexOf(value) === index)
        .sort((left, right) => left - right),
    [maxVisibleTier, selectedTiers],
  );

  async function loadPricing(variantId?: string) {
    const [productResult, tierResult] = await Promise.all([
      api<{ items: ProductSummary[] }>('/products'),
      api<{ items: PriceTier[] }>('/price-tiers'),
    ]);
    setProducts(productResult.items);
    setTiers(tierResult.items);
    const nextVariantId = variantId ?? selectedVariantId ?? '';
    if (
      nextVariantId &&
      productResult.items.some((product) => product.variants.some((v) => v.id === nextVariantId))
    ) {
      setSelectedVariantId(nextVariantId);
    } else {
      const first = productResult.items
        .filter((product) => product.status === 'ACTIVE')
        .flatMap((product) => product.variants)
        .find((variant) => variant.status === 'ACTIVE');
      setSelectedVariantId(first?.id ?? '');
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ items: ProductSummary[] }>('/products'),
      api<{ items: PriceTier[] }>('/price-tiers'),
    ])
      .then(([productResult, tierResult]) => {
        if (!active) return;
        setProducts(productResult.items);
        setTiers(tierResult.items);
        const first = productResult.items
          .filter((product) => product.status === 'ACTIVE')
          .flatMap((product) => product.variants)
          .find((variant) => variant.status === 'ACTIVE');
        setSelectedVariantId(first?.id ?? '');
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Không tải được bảng giá.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function saveTier(quantityFrom: number) {
    if (!selectedVariantId) return;
    const current = tiers.find(
      (tier) => tier.variantId === selectedVariantId && tier.quantityFrom === quantityFrom,
    );
    const valueKey = `${selectedVariantId}:${quantityFrom}`;
    const raw = (draftValues[valueKey] ?? current?.priceVnd ?? '').trim();
    if (raw && !/^[1-9]\d{0,19}$/.test(raw)) {
      setError('Giá phải là số nguyên VND dương, không nhập dấu chấm hoặc dấu phẩy.');
      return;
    }
    if ((!raw && !current) || raw === (current?.priceVnd ?? '')) return;

    const requestValue = raw || null;
    const token = `${selectedVariantId}:${quantityFrom}:${current?.version ?? 0}:${requestValue ?? 'delete'}`;
    const idempotencyKey = pendingKeys.current.get(token) ?? crypto.randomUUID();
    pendingKeys.current.set(token, idempotencyKey);
    setSavingTier(quantityFrom);
    setError('');
    setMessage('');
    setResolution(null);
    try {
      await api('/price-tiers', {
        method: 'PUT',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          variantId: selectedVariantId,
          quantityFrom,
          expectedVersion: current?.version ?? 0,
          priceVnd: requestValue,
        }),
      });
      pendingKeys.current.delete(token);
      setDraftValues((previous) => {
        const next = { ...previous };
        delete next[valueKey];
        return next;
      });
      await loadPricing(selectedVariantId);
      setMessage(
        raw ? `Đã lưu giá admin cho bậc ${quantityFrom}.` : `Đã xóa giá admin bậc ${quantityFrom}.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không lưu được giá.');
    } finally {
      setSavingTier(null);
    }
  }

  async function resolvePrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!selectedVariantId || !/^(?=.*[1-9])\d{1,9}(?:\.\d{1,6})?$/.test(quantity)) {
      setError('Chọn SKU và nhập số lượng lớn hơn 0, tối đa 6 chữ số thập phân.');
      return;
    }
    try {
      const result = await api<PriceResolution>(
        `/price-tiers/resolve?variantId=${encodeURIComponent(selectedVariantId)}&quantity=${quantity}`,
      );
      setResolution(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không tính được bậc giá.');
    }
  }

  const currentTier = (quantityFrom: number) =>
    selectedTiers.find((tier) => tier.quantityFrom === quantityFrom);

  return (
    <section className="dashboard-content pricing-page">
      <header>
        <div>
          <p className="eyebrow">ĐỢT 05A · QUẢN TRỊ GIÁ</p>
          <h1>Giá theo sản phẩm</h1>
          <p className="muted">
            Nhập giá lẻ và các bậc giá admin theo đơn vị bán cố định của từng SKU. Quyền lưu giá
            được kiểm tra ở API.
          </p>
        </div>
        <div className="header-actions">
          <span className="user-pill">{staff.displayName}</span>
          <button className="ghost" onClick={onLogout} disabled={loggingOut}>
            {loggingOut ? 'Đang thoát…' : 'Đăng xuất'}
          </button>
        </div>
      </header>

      <div className="notice price-policy-note">
        <b>Quy tắc giá:</b> dưới 5 dùng giá lẻ; từ 5 trở lên áp dụng từng khoảng 5 đơn vị (5–&lt;10
        dùng bậc 5). Admin nhập giá lẻ và từng bậc; giá còn thiếu không tự tính.
      </div>
      {message && (
        <div className="success-message" role="status">
          {message}
        </div>
      )}
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading">Đang tải sản phẩm và giá đã lưu…</div>
      ) : variants.length === 0 ? (
        <div className="empty-state">Chưa có SKU đang bán để cấu hình giá.</div>
      ) : (
        <div className="pricing-layout">
          <section className="pricing-card">
            <div className="section-heading">
              <div>
                <h2>Giá theo SKU</h2>
                <p>Mỗi lần sửa một bậc; xóa nội dung ô rồi rời ô để bỏ giá override.</p>
              </div>
            </div>
            <label className="pricing-selector">
              Sản phẩm và SKU
              <select
                value={selectedVariantId}
                onChange={(event) => {
                  setSelectedVariantId(event.target.value);
                  setResolution(null);
                }}
              >
                {variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.productName} · {variant.name} · {variant.sku}
                  </option>
                ))}
              </select>
            </label>
            {selectedVariant && (
              <div className="price-tier-table">
                <div className="price-tier-header">
                  <span>Bậc / lượng áp dụng</span>
                  <span>Giá admin nhập (VND/{selectedVariant.sellingUnitName})</span>
                  <span>Nguồn</span>
                </div>
                {tierStarts.map((quantityFrom) => {
                  const saved = currentTier(quantityFrom);
                  return (
                    <div className="price-tier-row" key={quantityFrom}>
                      <div>
                        <b>{quantityFrom === 1 ? 'Giá lẻ' : `Bậc ${quantityFrom}`}</b>
                        <small>
                          {quantityFrom === 1
                            ? `< 5 ${selectedVariant.sellingUnitName}`
                            : `${quantityFrom}–<${quantityFrom + 5} ${selectedVariant.sellingUnitName}`}
                        </small>
                      </div>
                      <input
                        aria-label={`Giá admin bậc ${quantityFrom}`}
                        inputMode="numeric"
                        value={
                          draftValues[`${selectedVariantId}:${quantityFrom}`] ??
                          saved?.priceVnd ??
                          ''
                        }
                        onChange={(event) =>
                          setDraftValues((previous) => ({
                            ...previous,
                            [`${selectedVariantId}:${quantityFrom}`]: event.target.value,
                          }))
                        }
                        onBlur={() => void saveTier(quantityFrom)}
                        placeholder="Để trống nếu chưa nhập"
                        disabled={savingTier === quantityFrom}
                      />
                      <span className={saved?.priceVnd ? 'price-source-set' : 'price-source-empty'}>
                        {savingTier === quantityFrom
                          ? 'Đang lưu…'
                          : saved?.priceVnd
                            ? 'Admin'
                            : 'Chưa có giá'}
                      </span>
                    </div>
                  );
                })}
                <button
                  className="ghost pricing-add-tier"
                  onClick={() =>
                    setVisibleTiersByVariant((current) => ({
                      ...current,
                      [selectedVariantId]:
                        Math.max(
                          current[selectedVariantId] ?? 20,
                          ...selectedTiers.map((tier) => tier.quantityFrom),
                        ) + 5,
                    }))
                  }
                >
                  Thêm bậc{' '}
                  {Math.max(maxVisibleTier, ...selectedTiers.map((tier) => tier.quantityFrom)) + 5}
                </button>
              </div>
            )}
            <p className="pricing-footnote">
              Giá admin đang áp dụng chung theo SKU trong đơn vị kinh doanh. Giá chưa được dùng để
              tạo báo giá/đơn ở lát cắt này.
            </p>
          </section>

          <section className="pricing-card">
            <div className="section-heading">
              <div>
                <h2>Thử chọn bậc</h2>
                <p>Kết quả do backend trả về, chưa tạo báo giá.</p>
              </div>
            </div>
            <form className="price-resolver-form" onSubmit={resolvePrice}>
              <label>
                Số lượng theo {selectedVariant?.sellingUnitName ?? 'đơn vị bán'}
                <input
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </label>
              <button className="primary" disabled={!selectedVariantId}>
                Kiểm tra bậc
              </button>
            </form>
            {resolution && resolution.variantId === selectedVariantId && (
              <div
                className={`price-resolution ${resolution.status === 'RESOLVED' ? 'is-resolved' : ''}`}
                role="status"
              >
                <b>
                  {resolution.quantityFrom === 1
                    ? 'Giá lẻ · dưới 5'
                    : `Bậc ${resolution.quantityFrom} · từ ${resolution.quantityFrom} đến dưới ${resolution.quantityFrom + 5}`}
                </b>
                {resolution.status === 'RESOLVED' ? (
                  <strong>{formatVnd(resolution.priceVnd ?? '0')}</strong>
                ) : (
                  <span>Chưa có giá admin được cấu hình cho mức số lượng này.</span>
                )}
                {resolution.source === 'ADMIN' && <small>Nguồn giá: admin nhập.</small>}
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
