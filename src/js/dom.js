export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function displayText(value, fallback = '—') {
  const text = String(value ?? '').trim();
  return escapeHtml(text || fallback);
}
