export function readStorageValue(key: string): string | null {
  try {
    const value = localStorage.getItem(key);
    return value?.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function writeStorageValue(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore storage errors */
  }
}

export function removeStorageValue(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore storage errors */
  }
}
