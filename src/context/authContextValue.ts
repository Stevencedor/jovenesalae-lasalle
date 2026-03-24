import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { Estudiante } from '../types/domain'

export interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Estudiante | null
  loading: boolean
  refreshProfile: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  updatePassword: (password: string) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
