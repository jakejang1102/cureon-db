const TOKEN_KEY = "team_app_token";
export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}
async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json().catch(() => ({})) : null;
  if (res.status === 401) {
    if (token) setToken(null);
    throw new Error(data?.error || "인증이 필요합니다.");
  }
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(data?.error || `요청 실패 (${res.status})`);
  return data;
}
export const auth = {
  login: (email, password) =>
    request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (email, password, name) =>
    request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),
  me: () => request("/api/auth/me"),
};
export const tasksApi = {
  list: () => request("/api/tasks"),
  create: (body) =>
    request("/api/tasks", { method: "POST", body: JSON.stringify(body) }),
  update: (id, body) =>
    request(`/api/tasks/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  remove: (id) => request(`/api/tasks/${id}`, { method: "DELETE" }),
  addLog: (taskId, body) =>
    request(`/api/tasks/${taskId}/logs`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateLog: (taskId, logId, body) =>
    request(`/api/tasks/${taskId}/logs/${logId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  removeLog: (taskId, logId) =>
    request(`/api/tasks/${taskId}/logs/${logId}`, { method: "DELETE" }),

  // ── 신규: 수정 이력 API ──
  getHistory: (taskId) => request(`/api/tasks/${taskId}/history`),
  getAllHistory: (since, until) => {
    const params = new URLSearchParams();
    if (since) params.set("since", since);
    if (until) params.set("until", until);
    const qs = params.toString();
    return request(`/api/history${qs ? `?${qs}` : ""}`);
  },
};
