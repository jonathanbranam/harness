import { useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'

export function LoginPage() {
  const { login } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(password)
    } catch {
      setError('Invalid password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
      <form onSubmit={onSubmit} className="w-full max-w-xs space-y-4 p-6">
        <h1 className="text-xl font-semibold text-center">Introspect Harness</h1>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-md bg-gray-800 border border-gray-700 px-3 py-2 outline-none focus:border-indigo-500"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !password}
          className="w-full rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3 py-2 font-medium"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
