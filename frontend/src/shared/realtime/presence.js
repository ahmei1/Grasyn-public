import { createContext, useContext } from 'react'

export const PresenceContext = createContext([])

/** Members connected to the active workspace: { userId, name, projectIds, taskIds, since }. */
export function usePresence() {
  return useContext(PresenceContext)
}
