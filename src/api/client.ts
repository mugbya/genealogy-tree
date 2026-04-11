const API_BASE = 'http://localhost:8080'

interface ApiResponse<T> {
  data?: T
  error?: string
}

async function handleResponse<T>(res: Response): Promise<ApiResponse<T>> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    return { error: body.error || `HTTP ${res.status}` }
  }
  const body = await res.json()
  return { data: body.data }
}

async function getHeaders(): Promise<HeadersInit> {
  const token = localStorage.getItem('token')
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

export const api = {
  async get<T>(path: string): Promise<ApiResponse<T>> {
    const headers = await getHeaders()
    const res = await fetch(`${API_BASE}${path}`, { headers })
    return handleResponse<T>(res)
  },

  async post<T>(path: string, data?: unknown): Promise<ApiResponse<T>> {
    const headers = await getHeaders()
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: data ? JSON.stringify(data) : undefined,
    })
    return handleResponse<T>(res)
  },

  async put<T>(path: string, data?: unknown): Promise<ApiResponse<T>> {
    const headers = await getHeaders()
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'PUT',
      headers,
      body: data ? JSON.stringify(data) : undefined,
    })
    return handleResponse<T>(res)
  },

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    const headers = await getHeaders()
    const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE', headers })
    return handleResponse<T>(res)
  },
}

export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ token: string; user: User }>('/api/auth/login', { username, password }),
  register: (data: CreateUserInput) =>
    api.post<{ token: string; user: User }>('/api/auth/register', data),
  getCurrentUser: () => api.get<User>('/api/users/me'),
}

export const usersApi = {
  list: () => api.get<User[]>('/api/admin/users'),
  get: (id: number) => api.get<User>(`/api/users/${id}`),
  create: (data: CreateUserInput) => api.post<{ id: number }>('/api/auth/register', data),
  update: (id: number, data: UpdateUserInput) => api.put<User>(`/api/users/${id}`, data),
  delete: (id: number) => api.delete(`/api/users/${id}`),
}

export const healthApi = {
  check: () => api.get<{ status: string }>('/api/health'),
}

export const configApi = {
  list: () => api.get<Config[]>('/api/config'),
  get: (key: string) => api.get<Config>(`/api/config/${key}`),
  set: (key: string, value: string) => api.post('/api/config', { key, value }),
  delete: (key: string) => api.delete(`/api/config/${key}`),
  getPublic: () => api.get<PublicConfig>('/api/config/public'),
}

export const membersApi = {
  list: () => api.get<Member[]>('/api/members'),
  get: (id: number) => api.get<Member>(`/api/members/${id}`),
  create: (data: CreateMemberInput) => api.post<{ id: number }>('/api/members', data),
  update: (id: number, data: UpdateMemberInput) => api.put(`/api/members/${id}`, data),
  delete: (id: number) => api.delete(`/api/members/${id}`),
}

export const relationTagsApi = {
  list: () => api.get<RelationTag[]>('/api/relation-tags'),
  create: (data: CreateRelationTagInput) => api.post<{ id: number }>('/api/relation-tags', data),
  update: (id: number, data: UpdateRelationTagInput) => api.put(`/api/relation-tags/${id}`, data),
  delete: (id: number) => api.delete(`/api/relation-tags/${id}`),
}

export const memberRelationsApi = {
  list: () => api.get<MemberRelation[]>('/api/member-relations'),
  getByMember: (memberId: number) => api.get<MemberRelation[]>(`/api/members/${memberId}/relations`),
  create: (data: CreateMemberRelationInput) => api.post<{ id: number }>('/api/member-relations', data),
  delete: (id: number) => api.delete(`/api/member-relations/${id}`),
}

// 系统信息 API - 通过 HTTP API 获取（网页版使用）
export const systemApi = {
  getSystemInfo: () => api.get<SystemInfo>('/api/system/info'),
  getNetworkInterfaces: () => api.get<NetworkInterface[]>('/api/system/network-interfaces'),
}

export interface SystemInfo {
  version: string
  cpu_cores: CpuCore[]
  memory_usage: number
  total_memory: number
  used_memory: number
  disks: DiskInfo[]
  platform: string
}

export interface CpuCore {
  name: string
  usage: number
}

export interface DiskInfo {
  name: string
  mount_point: string
  total: number
  used: number
  usage: number
}

export interface NetworkInterface {
  name: string
  ip: string
  is_loopback: boolean
}

export interface Config {
  id: number
  key: string
  value: string
  updated_at: string
}

export interface PublicConfig {
  allow_create_family: boolean
  allow_public_access: boolean
  family_name: string
}

export interface Member {
  id: number
  name: string
  gender: string
  generation?: number
  birth_date?: string
  death_date?: string
  is_deceased?: boolean
  birth_place?: string
  occupation?: string
  photo_path?: string
  biography?: string
  remarkable_deeds?: string
  created_at: string
  updated_at: string
}

export interface CreateMemberInput {
  name: string
  gender: string
  birth_date?: string
  death_date?: string
  is_deceased?: boolean
  birth_place?: string
  occupation?: string
  photo_path?: string
  biography?: string
  remarkable_deeds?: string
}

export interface UpdateMemberInput {
  name?: string
  gender?: string
  generation?: number
  birth_date?: string
  death_date?: string
  is_deceased?: boolean
  birth_place?: string
  occupation?: string
  photo_path?: string
  biography?: string
  remarkable_deeds?: string
}

export interface RelationTag {
  id: number
  name: string
  tag_type: string
  color: string
  created_at: string
}

export interface CreateRelationTagInput {
  name: string
  tag_type: string
  color: string
}

export interface UpdateRelationTagInput {
  name?: string
  tag_type?: string
  color?: string
}

export interface MemberRelation {
  id: number
  from_member_id: number
  to_member_id: number
  relation_type: string
  tag_id?: number
  created_at: string
  from_member_name?: string
  from_member_gender?: string
  to_member_name?: string
  to_member_gender?: string
  tag_name?: string
  tag_color?: string
}

export interface CreateMemberRelationInput {
  from_member_id: number
  to_member_id: number
  relation_type: string
  tag_id?: number
}

export interface User {
  id: number
  username: string
  role: string
  member_id: number | null
  created_at: string
  member_name?: string
}

export interface CreateUserInput {
  username: string
  password: string
  role?: string
  member_id?: number | null
}

export interface UpdateUserInput {
  password?: string
  role?: string
  member_id?: number | null
}
