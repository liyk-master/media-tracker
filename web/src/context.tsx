import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface AuthCtx {
  token: string | null
  role: string
  username: string
  userId: number
  setToken: (t: string | null) => void
  setRole: (r: string) => void
  setUsername: (u: string) => void
  setUserId: (id: number) => void
  logout: () => void
}

const AuthContext = createContext<AuthCtx>({
  token: null,
  role: 'user',
  username: '',
  userId: 0,
  setToken: () => {},
  setRole: () => {},
  setUsername: () => {},
  setUserId: () => {},
  logout: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem('token'))
  const [role, setRoleState] = useState<string>(() => localStorage.getItem('role') || 'user')
  const [username, setUsernameState] = useState<string>(() => localStorage.getItem('username') || '')
  const [userId, setUserIdState] = useState<number>(() => Number(localStorage.getItem('userId')) || 0)

  const setToken = useCallback((t: string | null) => {
    setTokenState(t)
    if (t) {
      localStorage.setItem('token', t)
    } else {
      localStorage.removeItem('token')
    }
  }, [])

  const setRole = useCallback((r: string) => {
    setRoleState(r)
    localStorage.setItem('role', r)
  }, [])

  const setUsername = useCallback((u: string) => {
    setUsernameState(u)
    localStorage.setItem('username', u)
  }, [])

  const setUserId = useCallback((id: number) => {
    setUserIdState(id)
    localStorage.setItem('userId', String(id))
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setRole('user')
    setUsername('')
    setUserId(0)
    localStorage.removeItem('role')
    localStorage.removeItem('username')
    localStorage.removeItem('userId')
  }, [setToken, setRole, setUsername, setUserId])

  return (
    <AuthContext.Provider value={{ token, role, username, userId, setToken, setRole, setUsername, setUserId, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
