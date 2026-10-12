export function normalizeCustomerName(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLocaleLowerCase('vi-VN')
    .replace(/\s+/g, ' ');
}

export function normalizeEmail(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

export function normalizePhone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || !/^\+?[0-9\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    if (digits.startsWith('84')) {
      const nationalLength = digits.length - 2;
      if (nationalLength < 8 || nationalLength > 10 || digits[2] === '0') return null;
      return `+${digits}`;
    }
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.startsWith('0')) {
    return digits.length >= 9 && digits.length <= 11 ? `+84${digits.slice(1)}` : null;
  }
  if (digits.startsWith('84')) {
    const nationalLength = digits.length - 2;
    return nationalLength >= 8 && nationalLength <= 10 && digits[2] !== '0' ? `+${digits}` : null;
  }
  return null;
}
