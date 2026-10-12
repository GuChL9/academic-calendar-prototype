export const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
export const formatDisplayDate = date => date.replaceAll('-', ' / ');
export const formatDisplayRange = ({ start, end }) => `${formatDisplayDate(start)} — ${formatDisplayDate(end)}`;
export const shortDate = date => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
