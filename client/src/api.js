const BASE = '/api';
const TOKEN_KEY = 'auth_token';

// Dipicu saat server menolak token (401) agar App bisa menampilkan layar masuk.
export const AUTH_UNAUTHORIZED_EVENT = 'auth:unauthorized';

let token = null;
try {
  token = localStorage.getItem(TOKEN_KEY) || null;
} catch {
  token = null;
}

export function getToken() {
  return token;
}

export function setToken(value) {
  token = value || null;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // localStorage bisa diblokir (mode privat) — sesi tetap berlaku sampai tab ditutup
  }
}

export function clearToken() {
  setToken(null);
}

async function request(url, options = {}, handleUnauthorized = true) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE}${url}`, { ...options, headers });
  } catch {
    throw new Error('Tidak dapat terhubung ke server');
  }

  if (res.status === 401 && handleUnauthorized) {
    const err = await res.json().catch(() => ({}));
    clearToken();
    window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
    throw new Error(err.error || 'Sesi berakhir, silakan masuk kembali');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const error = new Error(err.error || 'Terjadi kesalahan');
    // Kode khusus dari server, mis. 'email_unverified'
    if (err.code) error.code = err.code;
    throw error;
  }
  if (res.status === 204) return null;
  return res.json();
}

// --- Autentikasi ---

// handleUnauthorized=false: kegagalan login bukan "sesi kadaluarsa".
export const login = (email, password, remember = false) =>
  request(
    '/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password, remember }) },
    false
  );

export const register = ({ email, name, password }) =>
  request('/auth/register', { method: 'POST', body: JSON.stringify({ email, name, password }) }, false);

export const logout = () => request('/auth/logout', { method: 'POST' });

export const getMe = () => request('/auth/me');

export const changePassword = (currentPassword, newPassword) =>
  request('/auth/password', {
    method: 'PUT',
    body: JSON.stringify({ currentPassword, newPassword }),
  });

// Konfigurasi publik layar masuk (login Google, pendaftaran, pengiriman email)
export const getAuthConfig = () => request('/auth/config', {}, false);

export const forgotPassword = (email) =>
  request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }, false);

export const checkResetToken = (token) =>
  request(`/auth/reset-password/${encodeURIComponent(token)}`, {}, false);

export const resetPassword = (token, password) =>
  request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }, false);

export const verifyEmail = (token) =>
  request('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }, false);

export const resendVerification = () => request('/auth/resend-verification', { method: 'POST' });

export const exchangeGoogleCode = (code) =>
  request('/auth/google/exchange', { method: 'POST', body: JSON.stringify({ code }) }, false);

export const getTransactions = ({ month, from, to } = {}) => {
  const params = new URLSearchParams();
  if (month) params.set('month', month);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return request(qs ? `/transactions?${qs}` : '/transactions');
};

export const addTransaction = (data) =>
  request('/transactions', { method: 'POST', body: JSON.stringify(data) });

export const importTransactions = (transactions) =>
  request('/transactions/import', {
    method: 'POST',
    body: JSON.stringify({ transactions }),
  });

export const deleteTransaction = (id) =>
  request(`/transactions/${id}`, { method: 'DELETE' });

export const getSummary = () => request('/summary');

export const updateTransaction = (id, data) =>
  request(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const getCategories = () => request('/categories');

export const getCategoryDetails = () => request('/categories/detail');

export const updateCategory = (id, name) =>
  request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });

export const addCategory = (data) =>
  request('/categories', { method: 'POST', body: JSON.stringify(data) });

export const deleteCategory = (id) =>
  request(`/categories/${id}`, { method: 'DELETE' });

export const getBudget = () => request('/budget');

export const setBudget = (amount) =>
  request('/budget', { method: 'PUT', body: JSON.stringify({ amount }) });

export const setCategoryBudget = (category, amount) =>
  request('/category-budgets', { method: 'PUT', body: JSON.stringify({ category, amount }) });

export const deleteCategoryBudget = (category) =>
  request(`/category-budgets/${encodeURIComponent(category)}`, { method: 'DELETE' });

export const getAccounts = () => request('/accounts');

export const addAccount = (name, initialBalance, kind) =>
  request('/accounts', { method: 'POST', body: JSON.stringify({ name, initialBalance, kind }) });

export const deleteAccount = (id) => request(`/accounts/${id}`, { method: 'DELETE' });

export const getTransfers = () => request('/transfers');

export const addTransfer = (data) =>
  request('/transfers', { method: 'POST', body: JSON.stringify(data) });

export const updateTransfer = (id, data) =>
  request(`/transfers/${id}`, { method: 'PUT', body: JSON.stringify(data) });

export const deleteTransfer = (id) =>
  request(`/transfers/${id}`, { method: 'DELETE' });

export const getRecurring = () => request('/recurring');

export const addRecurring = (data) =>
  request('/recurring', { method: 'POST', body: JSON.stringify(data) });

export const toggleRecurring = (id, active) =>
  request(`/recurring/${id}`, { method: 'PUT', body: JSON.stringify({ active }) });

export const deleteRecurring = (id) =>
  request(`/recurring/${id}`, { method: 'DELETE' });

export const getBackup = () => request('/backup');

export const restoreBackup = (data) =>
  request('/restore', { method: 'POST', body: JSON.stringify(data) });

export const getSavingsGoal = () => request('/savings-goal');

export const setSavingsGoal = (amount) =>
  request('/savings-goal', { method: 'PUT', body: JSON.stringify({ amount }) });

export const getTrash = () => request('/trash');

export const restoreTrashItem = (entity, id) =>
  request(`/trash/${entity}/${id}/restore`, { method: 'POST' });

export const deleteTrashItem = (entity, id) =>
  request(`/trash/${entity}/${id}`, { method: 'DELETE' });

export const emptyTrash = () => request('/trash', { method: 'DELETE' });

export const getCategoryMonthlyReport = () => request('/reports/category-monthly');
