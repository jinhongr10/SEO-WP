type ClassValue = string | number | false | null | undefined | ClassValue[] | { [key: string]: unknown };

export const cn = (...values: ClassValue[]): string => {
  const classes: string[] = [];

  const visit = (value: ClassValue) => {
    if (!value) return;
    if (typeof value === 'string' || typeof value === 'number') {
      classes.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    Object.entries(value).forEach(([key, active]) => {
      if (active) classes.push(key);
    });
  };

  values.forEach(visit);
  return classes.join(' ');
};
