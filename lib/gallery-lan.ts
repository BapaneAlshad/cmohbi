export function normalizeLanStorageUrl(value: string): string | null {
  if (!value.trim()) return "";
  try {
    const url = new URL(value.trim());
    const labels = url.hostname.split(".");
    if (url.protocol !== "https:" || url.hostname.length > 253 ||
      Number(url.port) < 1024 || Number(url.port) > 65535 || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash || labels.length < 2 ||
      !/^[a-z]{2,63}$/.test(labels[labels.length - 1]) ||
      labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
    return url.origin;
  } catch {
    return null;
  }
}
