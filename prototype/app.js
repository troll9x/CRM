(function () {
  const views = [...document.querySelectorAll('.view')];
  const navItems = [...document.querySelectorAll('.nav-item')];
  const title = document.querySelector('#page-title');
  const toast = document.querySelector('.toast');
  let toastTimer;

  const money = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  });

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
  }

  function showView(id) {
    const next = document.getElementById(id);
    if (!next) return;
    views.forEach((view) => view.classList.toggle('is-active', view === next));
    navItems.forEach((item) => item.classList.toggle('is-active', item.dataset.view === id));
    title.textContent = next.dataset.title;
    document.body.classList.remove('nav-open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.addEventListener('click', (event) => {
    const nav = event.target.closest('[data-view]');
    const go = event.target.closest('[data-go]');
    const feedback = event.target.closest('[data-feedback]');
    if (nav) showView(nav.dataset.view);
    if (go) showView(go.dataset.go);
    if (feedback) showToast(feedback.dataset.feedback);
  });

  document
    .querySelector('.menu-button')
    .addEventListener('click', () => document.body.classList.toggle('nav-open'));

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      const search = document.querySelector('#global-search');
      search.focus();
      search.select();
    }
    if (event.key === 'Escape') document.body.classList.remove('nav-open');
  });

  document.querySelector('#global-search').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      const query = event.currentTarget.value.trim();
      showView('customers');
      const filter = document.querySelector('[data-table="customer-table"]');
      filter.value = query;
      filter.dispatchEvent(new Event('input'));
      showToast(
        query
          ? `Đang lọc dữ liệu mẫu theo “${query}”.`
          : 'Nhập tên, số điện thoại, SKU hoặc mã đơn.',
      );
    }
  });

  document.querySelectorAll('.table-filter').forEach((input) => {
    input.addEventListener('input', () => {
      const query = input.value.trim().toLocaleLowerCase('vi');
      document.querySelectorAll(`#${input.dataset.table} tbody tr`).forEach((row) => {
        row.hidden = query && !row.textContent.toLocaleLowerCase('vi').includes(query);
      });
    });
  });

  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const row = chip.parentElement;
      row.querySelectorAll('.chip').forEach((item) => item.classList.remove('is-selected'));
      chip.classList.add('is-selected');
      showToast(`Bộ lọc “${chip.textContent.trim()}” chỉ minh họa trong prototype.`);
    });
  });

  const productSearch = document.querySelector('#product-search');
  const productResults = document.querySelector('#product-results');
  productSearch.addEventListener('focus', () => productResults.classList.add('is-visible'));
  productSearch.addEventListener('input', () => {
    const query = productSearch.value.trim().toLocaleLowerCase('vi');
    productResults.classList.add('is-visible');
    productResults.querySelectorAll('button').forEach((button) => {
      button.hidden = query && !button.textContent.toLocaleLowerCase('vi').includes(query);
    });
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.product-finder')) productResults.classList.remove('is-visible');
  });

  productResults.querySelectorAll('[data-product]').forEach((button) => {
    button.addEventListener('click', () => {
      productSearch.value = button.dataset.product;
      productResults.classList.remove('is-visible');
      if (button.dataset.product === 'TS-DEN-M') {
        if (!document.querySelector('[data-line="TS-DEN-M"]'))
          addLine('TS-DEN-M', 'Áo thun cotton đen — M', 80000, 10);
        else showToast('SKU này đã có trong đơn mẫu.');
      } else if (!document.querySelector('[data-line="SM-TRANG-L"]')) {
        addLine('SM-TRANG-L', 'Sơ mi trắng — L', 145000, 1);
      } else showToast('SKU này đã có trong đơn mẫu.');
    });
  });

  function addLine(sku, name, price, quantity) {
    const row = document.createElement('tr');
    row.dataset.line = sku;
    row.innerHTML = `<td><strong>${name}</strong><small>${sku}</small></td><td><select class="unit"><option value="1">Cái</option><option value="12">Hộp (12 cái)</option></select></td><td><input class="quantity" type="number" min="1" value="${quantity}" /></td><td class="unit-price">${money.format(price)}</td><td class="line-total">${money.format(price * quantity)}</td><td><button class="remove-line" aria-label="Xóa dòng">×</button></td>`;
    row.dataset.price = String(price);
    document.querySelector('#order-lines').append(row);
    attachLine(row);
    recalculate();
    showToast(`Đã thêm ${name} vào đơn mẫu.`);
  }

  function attachLine(row) {
    const displayedPrice = Number(row.querySelector('.unit-price').textContent.replace(/\D/g, ''));
    if (!row.dataset.price) row.dataset.price = String(displayedPrice);
    row
      .querySelectorAll('.quantity, .unit')
      .forEach((input) => input.addEventListener('input', recalculate));
    row.querySelector('.remove-line').addEventListener('click', () => {
      row.remove();
      recalculate();
      showToast('Đã xóa dòng khỏi đơn mẫu.');
    });
  }

  function recalculate() {
    let subtotal = 0;
    document.querySelectorAll('#order-lines tr').forEach((row) => {
      const price = Number(row.dataset.price);
      const quantity = Math.max(0, Number(row.querySelector('.quantity').value) || 0);
      const conversion = Number(row.querySelector('.unit').value);
      const total = price * quantity * conversion;
      subtotal += total;
      row.querySelector('.line-total').textContent = money.format(total);
    });
    const shipping = Math.max(0, Number(document.querySelector('#shipping-fee').value) || 0);
    document.querySelector('#subtotal').textContent = money.format(subtotal);
    document.querySelector('#grand-total').textContent = money.format(subtotal + shipping);
  }

  document.querySelectorAll('#order-lines tr').forEach(attachLine);
  document.querySelector('#shipping-fee').addEventListener('input', recalculate);
  document.querySelector('#order-customer').addEventListener('change', (event) => {
    showToast(
      event.target.value.includes('Khách lẻ')
        ? 'Prototype: khách lẻ sẽ dùng giá mặc định; backend thật phải tính lại.'
        : 'Prototype: đã chọn bảng giá sỉ mẫu.',
    );
  });
  recalculate();
})();
