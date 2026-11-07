let csrfToken = '';
export function setCsrfToken(value: string) { csrfToken = value; }
export function csrfHeaders(): Record<string, string> { return csrfToken ? { 'X-CSRF-Token': csrfToken } : {}; }
