(function () {
  const productSelect = document.querySelector('#pricing-product');
  const quantityInput = document.querySelector('#pricing-quantity');
  const tierList = document.querySelector('#price-tier-list');
  const bandLabel = document.querySelector('#pricing-band');
  const amountLabel = document.querySelector('#pricing-amount');
  const sourceLabel = document.querySelector('#pricing-source');
  const result = document.querySelector('.price-result');
  if (!productSelect || !quantityInput || !tierList) return;

  const enteredPrices = new Map();
  const money = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  });

  function productKey() {
    return productSelect.value;
  }

  function renderTiers() {
    const key = productKey();
    const values = enteredPrices.get(key) || new Map();
    tierList.replaceChildren();

    for (const start of [5, 10, 15, 20]) {
      const row = document.createElement('label');
      row.className = 'price-tier';
      const tier = document.createElement('span');
      tier.innerHTML = `<strong>Bậc ${start}</strong><small>${start}–${start + 4} đơn vị</small>`;
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.inputMode = 'numeric';
      input.placeholder = 'Admin nhập giá (VND)';
      input.setAttribute('aria-label', `Giá admin nhập cho bậc ${start}`);
      input.value = values.has(start) ? String(values.get(start)) : '';
      const hint = document.createElement('span');
      hint.className = 'dim-price';
      hint.textContent = values.has(start) ? 'Admin đã nhập' : 'Tự tính (chưa chốt)';
      input.addEventListener('input', () => {
        const typed = input.value.trim();
        if (!enteredPrices.has(key)) enteredPrices.set(key, new Map());
        const currentValues = enteredPrices.get(key);
        if (typed === '') currentValues.delete(start);
        else {
          const amount = Number(typed);
          if (Number.isSafeInteger(amount) && amount >= 0) currentValues.set(start, amount);
          else currentValues.delete(start);
        }
        hint.textContent = currentValues.has(start) ? 'Admin đã nhập' : 'Tự tính (chưa chốt)';
        updatePreview();
      });
      row.append(tier, input, hint);
      tierList.append(row);
    }
    updatePreview();
  }

  function updatePreview() {
    const quantity = Number(quantityInput.value);
    result.classList.remove('is-overridden');
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      bandLabel.textContent = 'Nhập số lượng nguyên lớn hơn 0';
      amountLabel.textContent = 'Chưa thể chọn giá';
      sourceLabel.textContent = 'Prototype chỉ nhận số lượng nguyên';
      return;
    }

    if (quantity < 5) {
      const option = productSelect.selectedOptions[0];
      bandLabel.textContent = `Giá lẻ · áp dụng cho 1–4 ${option.dataset.unit}`;
      amountLabel.textContent = money.format(Number(option.dataset.retail));
      amountLabel.style.color = '#3f6f9e';
      sourceLabel.textContent = 'Giá lẻ mẫu minh họa, không phải giá sản phẩm thật';
      return;
    }

    const tier = Math.floor(quantity / 5) * 5;
    const key = productKey();
    const override = (enteredPrices.get(key) || new Map()).get(tier);
    bandLabel.textContent = `Bậc ${tier} · áp dụng cho ${tier}–${tier + 4} đơn vị`;
    if (override !== undefined) {
      amountLabel.textContent = money.format(override);
      amountLabel.style.color = '';
      sourceLabel.textContent = 'Dùng giá admin nhập (mô phỏng trong bộ nhớ trình duyệt)';
      result.classList.add('is-overridden');
    } else {
      amountLabel.textContent = 'Chưa có công thức giá tự tính';
      amountLabel.style.color = '';
      sourceLabel.textContent = `Ô bậc ${tier} đang trống — cần chốt OPEN-03`;
    }
  }

  productSelect.addEventListener('change', renderTiers);
  quantityInput.addEventListener('input', updatePreview);
  renderTiers();
})();
