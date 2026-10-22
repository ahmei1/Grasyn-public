import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../../shared/api/client'
import { useAuth } from '../auth/AuthContext'

const STORAGE_KEY = 'grasyn:active-workspace'
const WorkspaceContext = createContext(null)

function readStoredId() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStoredId(id) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Private mode can block localStorage. The session still works.
  }
}

function pickActiveId(workspaces, preferredId) {
  if (preferredId && workspaces.some((workspace) => workspace.id === preferredId)) {
    return preferredId
  }
  return workspaces[0]?.id ?? null
}

/**
 * Remembers which team (workspace) you are looking at.
 *
 * AuthContext answers "who am I?".
 * WorkspaceContext answers "which team am I in?".
 *
 * Almost every later page needs that team id to talk to the API.
 */
export function WorkspaceProvider({ children }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [workspaces, setWorkspaces] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)

  const loadWorkspaces = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const data = await api.get('/workspaces')
      const list = data.workspaces ?? []
      const nextId = pickActiveId(list, readStoredId())
      setWorkspaces(list)
      setActiveId(nextId)
      writeStoredId(nextId)
      setStatus('ready')
    } catch (loadError) {
      setWorkspaces([])
      setActiveId(null)
      setError(loadError)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    if (authLoading) return

    if (!isAuthenticated) {
      setWorkspaces([])
      setActiveId(null)
      setError(null)
      setStatus('idle')
      return
    }

    let active = true
    setStatus('loading')
    setError(null)

    api
      .get('/workspaces')
      .then((data) => {
        if (!active) return
        const list = data.workspaces ?? []
        const nextId = pickActiveId(list, readStoredId())
        setWorkspaces(list)
        setActiveId(nextId)
        writeStoredId(nextId)
        setStatus('ready')
      })
      .catch((loadError) => {
        if (!active) return
        setWorkspaces([])
        setActiveId(null)
        setError(loadError)
        setStatus('error')
      })

    return () => {
      active = false
    }
  }, [authLoading, isAuthenticated])

  const value = useMemo(() => {
    const activeWorkspace =
      workspaces.find((workspace) => workspace.id === activeId) ?? null

    return {
      workspaces,
      activeWorkspace,
      isLoading: status === 'loading' || (isAuthenticated && status === 'idle'),
      isReady: status === 'ready',
      error,

      setActiveWorkspace(id) {
        setActiveId(id)
        writeStoredId(id)
      },

      async createWorkspace(name) {
        const data = await api.post('/workspaces', { name })
        const created = { ...data.workspace, role: 'OWNER' }
        setWorkspaces((current) =>
          current.some((workspace) => workspace.id === created.id)
            ? current
            : [...current, created],
        )
        setActiveId(created.id)
        writeStoredId(created.id)
        setStatus('ready')
        setError(null)
        return created
      },

      /** Swaps in a workspace returned by the API, keeping the caller's role. */
      replaceWorkspace(updated) {
        setWorkspaces((current) =>
          current.map((workspace) =>
            workspace.id === updated.id
              ? { ...workspace, ...updated, role: workspace.role }
              : workspace,
          ),
        )
      },

      reload: loadWorkspaces,
    }
  }, [workspaces, activeId, status, error, isAuthenticated, loadWorkspaces])

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  }
  return context
}
