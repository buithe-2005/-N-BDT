// Lớp gọi API: tự gắn token, chuẩn hóa lỗi.
const TOKEN_KEY = 'stridex.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(status, message, data) { super(message); this.status = status; this.data = data || {}; }
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.');
  }
  let data = {};
  try { data = await res.json(); } catch { /* không có nội dung */ }
  if (!res.ok) throw new ApiError(res.status, data.error || 'Đã xảy ra lỗi. Vui lòng thử lại.', data);
  return data;
}
