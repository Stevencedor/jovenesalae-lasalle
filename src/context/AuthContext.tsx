import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { AuthContext, type AuthContextValue } from './authContextValue'
import type { Estudiante } from '../types/domain'

async function getProfile(email: string): Promise<Estudiante | null> {
  const { data, error } = await supabase
    .from('estudiantes')
    .select(
      'id,cedula,nombre,email,semestre,grupo,rol,hermano_mayor,status',
    )
    .eq('email', email)
    .eq('status', 'Activo')
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Estudiante | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  const refreshProfile = useCallback(async (nextUser: User | null) => {
    try {
      if (!nextUser || !nextUser.email) {
        setProfile(null)
        return
      }

      const nextProfile = await getProfile(nextUser.email)
      setProfile((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(nextProfile)) {
          return prev
        }
        return nextProfile
      })
    } catch (err) {
      console.error('Error fetching profile in AuthContext:', err)
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return
    }

    let active = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) {
        return
      }

      setSession(data.session)
      setUser(data.session?.user ?? null)
      await refreshProfile(data.session?.user ?? null)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
      setUser(currentSession?.user ?? null)
      
      refreshProfile(currentSession?.user ?? null).finally(() => {
        setLoading(false)
      })
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [refreshProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      throw new Error(
        'Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el archivo .env',
      )
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      throw error
    }
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()

    if (error) {
      throw error
    }
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    if (!isSupabaseConfigured) {
      throw new Error('Configura Supabase en .env')
    }
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      loading,
      signIn,
      signOut,
      updatePassword,
    }),
    [loading, profile, session, signIn, signOut, updatePassword, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
