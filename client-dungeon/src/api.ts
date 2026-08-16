interface ApiError {
  status: number
  error?: string
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    credentials: 'include',
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw { status: res.status, ...body } as ApiError
  return body as T
}

export const authApi = {
  login: (password: string) => fetchApi<{ ok: boolean }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => fetchApi<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  me: () => fetchApi<{ authenticated: true }>('/api/auth/me'),
}
