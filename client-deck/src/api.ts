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

export const imagesApi = {
  // Not routed through fetchApi: a multipart upload must not set
  // Content-Type itself (the browser fills in the multipart boundary).
  upload: async (file: File): Promise<{ id: string; url: string }> => {
    const form = new FormData()
    form.set('file', file)
    const res = await fetch('/api/images', { method: 'POST', body: form, credentials: 'include' })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw { status: res.status, ...body } as ApiError
    return body as { id: string; url: string }
  },
}
