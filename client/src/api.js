const BASE = '/api';

async function request(url, options = {}) {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Terjadi kesalahan');
  }
  return res.json();
}

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
