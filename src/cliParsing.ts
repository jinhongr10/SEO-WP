export const parseCliIdList = (value?: string): number[] | undefined => {
  if (value === undefined) return undefined;
  if (!value.trim()) {
    throw new Error('At least one ID is required');
  }
  const ids: number[] = [];
  for (const part of value.split(',')) {
    const text = part.trim();
    if (!/^\d+$/.test(text)) {
      throw new Error(`Invalid ID: ${text || '(empty)'}`);
    }
    const id = Number(text);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error(`Invalid ID: ${text}`);
    }
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
};

export const parseCliInteger = (
  value: unknown,
  options: { label: string; min?: number; max?: number },
): number | undefined => {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  if (!text) {
    throw new Error(`Invalid ${options.label}: expected integer`);
  }
  if (!/^\d+$/.test(text)) {
    throw new Error(`Invalid ${options.label}: expected integer`);
  }
  const parsed = Number(text);
  const min = options.min ?? Number.MIN_SAFE_INTEGER;
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    const range = options.max === undefined ? `>= ${min}` : `${min}-${max}`;
    throw new Error(`Invalid ${options.label}: expected integer ${range}`);
  }
  return parsed;
};

export const parseCliRequiredInteger = (
  value: unknown,
  options: { label: string; min?: number; max?: number },
): number => {
  const parsed = parseCliInteger(value, options);
  if (parsed === undefined) {
    throw new Error(`Invalid ${options.label}: expected integer`);
  }
  return parsed;
};

export const parseCliIntegerArray = (
  value: unknown,
  options: { label: string; min?: number; max?: number; requireNonEmpty?: boolean },
): number[] => {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${options.label}: expected array`);
  }
  if (options.requireNonEmpty && value.length === 0) {
    throw new Error(`Invalid ${options.label}: expected non-empty array`);
  }

  const parsed: number[] = [];
  value.forEach((item, index) => {
    const id = parseCliRequiredInteger(item, {
      label: `${options.label}[${index}]`,
      min: options.min,
      max: options.max,
    });
    if (!parsed.includes(id)) {
      parsed.push(id);
    }
  });
  return parsed;
};

export const parseCliBoolean = (
  value: unknown,
  options: { label: string },
): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (!text) {
    throw new Error(`Invalid ${options.label}: expected boolean`);
  }
  if (['1', 'true', 'yes', 'y', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(text)) return false;
  throw new Error(`Invalid ${options.label}: expected boolean`);
};
