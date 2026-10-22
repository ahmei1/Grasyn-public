import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { io } from 'socket.io-client'
import { api } from '../api/client'
import { keys } from '../api/keys'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'
const SOCKET_URL = API_URL.replace(/\/api\/?$/, '')

function scopeFromPath(pathname, workspaceId) {
  const project = pathname.match(/^\/app\/projects\/(c[a-z0-9]{24})(?:\/|$)/)
  const task = pathname.match(/^\/app\/tasks\/(c[a-z0-9]{24})(?:\/|$)/)
  return {
    workspaceId,
    ...(project ? { projectId: project[1] } : {}),
    ...(task ? { taskId: task[1] } : {}),
  }
}

/**
 * Keeps the open workspace in sync. Task, project, and notification
 * changes arrive over the socket and refresh the screens that show them.
 * The 30 second notification poll stays as a fallback when the socket is down.
 *
 * Returns who is in the workspace right now and what they have open.
 */
export function useWorkspaceRealtime(workspaceId) {
  const queryClient = useQueryClient()
  const { pathname } = useLocation()
  const socketRef = useRef(null)
  const scopeRef = useRef(null)
  const [presence, setPresence] = useState({ workspaceId: null, members: [] })

  useEffect(() => {
    scopeRef.current = scopeFromPath(pathname, workspaceId)
    if (socketRef.current?.connected) {
      socketRef.current.emit('join', scopeRef.current)
    }
  }, [pathname, workspaceId])

  useEffect(() => {
    if (!workspaceId) return undefined
    let cancelled = false
    let refreshed = false
    const socket = io(SOCKET_URL, { withCredentials: true })
    socketRef.current = socket

    const join = () => socket.emit('join', scopeRef.current)

    socket.on('connect', () => {
      refreshed = false
      join()
    })

    socket.on('activity', (data) => {
      if (!data || data.workspaceId !== workspaceId) return
      queryClient.invalidateQueries({ queryKey: keys.dashboard(workspaceId) })
      queryClient.invalidateQueries({ queryKey: keys.projects(workspaceId) })
      queryClient.invalidateQueries({
        queryKey: ['workspace-tasks', workspaceId],
      })
      queryClient.invalidateQueries({ queryKey: ['activity'] })
      if (data.projectId) {
        queryClient.invalidateQueries({ queryKey: keys.project(data.projectId) })
        queryClient.invalidateQueries({
          queryKey: keys.projectTasks(data.projectId),
        })
      }
      if (data.taskId) {
        queryClient.invalidateQueries({ queryKey: keys.task(data.taskId) })
        queryClient.invalidateQueries({ queryKey: keys.comments(data.taskId) })
      }
      // Webhooks can touch any repository, so every code view refreshes.
      if (data.type?.startsWith('code.') || data.type?.startsWith('github.')) {
        queryClient.invalidateQueries({ queryKey: keys.github(workspaceId) })
        queryClient.invalidateQueries({ queryKey: ['code'] })
      }
      if (data.type?.startsWith('meeting.')) {
        if (data.projectId) {
          queryClient.invalidateQueries({
            queryKey: keys.meetings(data.projectId),
          })
        }
        if (data.meetingId) {
          queryClient.invalidateQueries({
            queryKey: keys.meeting(data.meetingId),
          })
        }
      }
    })

    // Only sent to people with the project open.
    socket.on('message', (data) => {
      if (!data || data.workspaceId !== workspaceId || !data.projectId) return
      queryClient.invalidateQueries({ queryKey: keys.messages(data.projectId) })
    })

    socket.on('presence', (data) => {
      if (!data || data.workspaceId !== workspaceId) return
      setPresence({ workspaceId, members: data.members ?? [] })
    })

    // A dropped socket means the list can no longer be trusted.
    socket.on('disconnect', () => {
      setPresence({ workspaceId: null, members: [] })
    })

    socket.on('notification', (data) => {
      if (!data || data.workspaceId !== workspaceId) return
      queryClient.invalidateQueries({
        queryKey: keys.notifications(workspaceId),
      })
    })

    socket.on('connect_error', () => {
      if (cancelled || refreshed) return
      refreshed = true
      api
        .get('/auth/me')
        .then(() => {
          if (!cancelled) socket.connect()
        })
        .catch(() => {})
    })

    return () => {
      cancelled = true
      socket.removeAllListeners()
      socket.disconnect()
      if (socketRef.current === socket) socketRef.current = null
    }
  }, [queryClient, workspaceId])

  return presence.workspaceId === workspaceId ? presence.members : []
}
