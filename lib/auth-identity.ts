export const AUTH_EMAIL_DOMAIN = "auth.ngapaya.local";
export const USERNAME_PATTERN = /^[a-z][a-z0-9._-]{2,31}$/;
export const PIN_PATTERN = /^\d{6}$/;

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function authEmailFromUsername(username: string) {
  return `${normalizeUsername(username)}@${AUTH_EMAIL_DOMAIN}`;
}

export function isValidUsername(username: string) {
  return USERNAME_PATTERN.test(normalizeUsername(username));
}

export function isValidPin(pin: string) {
  return PIN_PATTERN.test(pin);
}
