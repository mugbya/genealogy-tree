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

export const api = {
  async get<T>(path: string): Promise<ApiResponse<T>> {
    const res = await fetch(`${API_BASE}${path}`)
    return handleResponse<T>(res)
  },

  async post<T>(path: string, data?: unknown): Promise<ApiResponse<T>> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined,
    })
    return handleResponse<T>(res)
  },

  async put<T>(path: string, data?: unknown): Promise<ApiResponse<T>> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined,
    })
    return handleResponse<T>(res)
  },

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE' })
    return handleResponse<T>(res)
  },
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
  birth_place?: string
  occupation?: string
  photo_path?: string
  biography?: string
  created_at: string
  updated_at: string
}

export interface CreateMemberInput {
  name: string
  gender: string
  generation?: number
  birth_date?: string
  death_date?: string
  birth_place?: string
  occupation?: string
  photo_path?: string
  biography?: string
}

export interface UpdateMemberInput {
  name?: string
  gender?: string
  generation?: number
  birth_date?: string
  death_date?: string
  birth_place?: string
  occupation?: string
  photo_path?: string
  biography?: string
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
