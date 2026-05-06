// 通过自定义 User-Agent 检测是否为桌面端（WebView）
const isDesktop = typeof window !== 'undefined' &&
  navigator.userAgent.includes('GenealogyDesktop')

// 动态 API_BASE（桌面端从后端获取端口，浏览器端使用相对路径）
let cachedApiBase: string | null = null

async function getApiBase(): Promise<string> {
  // 非桌面端使用相对路径
  if (!isDesktop) return ''

  // 如果已经获取过端口，直接返回缓存值
  if (cachedApiBase) return cachedApiBase

  // 尝试多个可能的端口
  const ports = [8089, 8080]

  for (const port of ports) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 2000)

      const res = await fetch(`http://localhost:${port}/api/system/http-port`, {
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (res.ok) {
        const json = await res.json()
        cachedApiBase = `http://localhost:${json.data ?? port}`
        console.log('[API] Connected to HTTP server on port:', port)
        return cachedApiBase
      }
    } catch (e) {
      console.warn(`[API] Failed to connect on port ${port}:`, e)
    }
  }

  // 所有端口都失败，使用默认端口
  console.error('[API] Could not connect to HTTP server, using fallback port 8089')
  cachedApiBase = 'http://localhost:8089'
  return cachedApiBase
}

interface ApiResponse<T> {
  data?: T
  error?: string
}

async function handleResponse<T>(res: Response): Promise<ApiResponse<T>> {
  const body = await res.json().catch(() => ({}))

  // 检查业务层面的 success 字段（即使 HTTP 状态码是 200）
  if (body.success === false) {
    console.error('API Business Error:', body.error)
    return { error: body.error || '请求失败' }
  }

  if (!res.ok) {
    console.error('API HTTP Error Response:', res.status, body)
    return { error: body.error || body.message || `HTTP ${res.status}` }
  }

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
    const base = await getApiBase()
    const res = await fetch(`${base}${path}`, { headers })
    return handleResponse<T>(res)
  },

  async post<T>(path: string, data?: unknown): Promise<ApiResponse<T>> {
    const headers = await getHeaders()
    const base = await getApiBase()
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers,
      body: data ? JSON.stringify(data) : undefined,
    })
    return handleResponse<T>(res)
  },

  async put<T>(path: string, data?: unknown): Promise<ApiResponse<T>> {
    const headers = await getHeaders()
    const base = await getApiBase()
    const res = await fetch(`${base}${path}`, {
      method: 'PUT',
      headers,
      body: data ? JSON.stringify(data) : undefined,
    })
    return handleResponse<T>(res)
  },

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    const headers = await getHeaders()
    const base = await getApiBase()
    const res = await fetch(`${base}${path}`, { method: 'DELETE', headers })
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
  set: (key: string, value: string) => {
    return api.post('/api/config', { key, value })
  },
  setBatch: (configs: { key: string; value: string }[]) => api.post('/api/config/batch', configs),
  delete: (key: string) => api.delete(`/api/config/${key}`),
  getPublic: () => api.get<PublicConfig>('/api/config/public'),
}

export const membersApi = {
  list: () => api.get<Member[]>('/api/members'),
  get: (id: number) => api.get<Member>(`/api/members/${id}`),
  create: (data: CreateMemberInput) => api.post<{ id: number }>('/api/members', data),
  update: (id: number, data: UpdateMemberInput) => api.put(`/api/members/${id}`, data),
  delete: (id: number) => api.delete(`/api/members/${id}`),
  import: (fileContent: string) => api.post<ImportResult>('/api/members/import', { file_content: fileContent }),
  getEditableIds: () => api.get<number[]>('/api/members/editable-ids'),
}

export interface ImportResult {
  imported: number
  updated: number
  errors: string[]
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

// License API
export const licenseApi = {
  getInfo: () => api.get<LicenseInfo>('/api/license/info'),
  activate: (licenseKey: string) => api.post<LicenseStatus>('/api/license/activate', { license_key: licenseKey }),
  verify: () => api.post<LicenseStatus>('/api/license/verify'),
  checkFeature: (feature: string) => api.post<FeatureCheckResult>('/api/license/check-feature', { feature }),
}

export interface FeatureCheckResult {
  feature: string
  allowed: boolean
  is_valid: boolean
  expires_at?: string
  is_trial_expired?: boolean
}

export interface LicenseInfo {
  license_key?: string
  license_type?: string
  activated_at?: string
  expires_at?: string
  is_valid: boolean
  is_trial?: boolean
  remaining_days?: number | null
}

export interface LicenseStatus {
  valid: boolean
  license_type?: string
  expires_at?: string
  activated_at?: string
  error?: string
}

// 系统信息 API - 通过 HTTP API 获取
export const systemApi = {
  getSystemInfo: () => api.get<SystemInfo>('/api/system/info'),
  getNetworkInterfaces: () => api.get<NetworkInterface[]>('/api/system/network-interfaces'),
  getDatabasePath: () => api.get<DatabasePathInfo>('/api/system/database-path'),
  getHttpPort: () => api.get<string>('/api/system/http-port'),
  getDownloadPath: () => api.get<string>('/api/system/download-path'),
  getVersion: () => api.get<string>('/api/system/version'),
}

export interface DatabasePathInfo {
  path: string
  os_type: string  // macos, linux, windows
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
  family_surname: string
  family_origin: string
  family_maxim: string
  family_generation_words: string
}

export interface Member {
  id: number
  name: string
  surname?: string
  gender: string
  generation?: string
  generation_word?: string  // 字辈
  weight?: number
  birth_date?: string
  death_date?: string
  is_deceased?: boolean
  birth_place?: string
  occupation?: string
  photo_path?: string
  biography?: string
  remarkable_deeds?: string
  is_matrilocal?: boolean  // 是否入赘
  is_adopted_son?: boolean  // 是否招夫养子
  created_at: string
  updated_at: string
}

export interface CreateMemberInput {
  name: string
  surname?: string
  gender: string
  generation?: string
  generation_word?: string  // 字辈
  weight?: number
  birth_date?: string
  death_date?: string
  is_deceased?: boolean
  birth_place?: string
  occupation?: string
  photo_path?: string
  biography?: string
  remarkable_deeds?: string
  is_matrilocal?: boolean
  is_adopted_son?: boolean
}

export interface UpdateMemberInput {
  name?: string
  surname?: string
  gender?: string
  generation?: string
  generation_word?: string  // 字辈
  weight?: number
  birth_date?: string
  death_date?: string
  is_deceased?: boolean
  birth_place?: string
  occupation?: string
  photo_path?: string
  biography?: string
  remarkable_deeds?: string
  is_matrilocal?: boolean
  is_adopted_son?: boolean
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

// 微信扫码登录 API
export interface WechatQrcodeResponse {
  scene: string
  qrcode_url: string
  expire_seconds: number
}

export interface WechatLoginStatusResponse {
  status: 'pending' | 'scanned' | 'confirmed' | 'expired'
  nickname?: string
  avatar?: string
}

export interface WechatLoginConfirmResponse {
  status: string
  token: string
  user: {
    openid: string
    nickname: string
  }
}

export const wechatApi = {
  generateQrcode: (redirectUri?: string) =>
    api.get<WechatQrcodeResponse>('/api/auth/wechat/qrcode' + (redirectUri ? `?redirect_uri=${encodeURIComponent(redirectUri)}` : '')),
  checkStatus: (scene: string) =>
    api.get<WechatLoginStatusResponse>(`/api/auth/wechat/status/${scene}`),
  confirmLogin: (scene: string, openid?: string, nickname?: string) =>
    api.post<WechatLoginConfirmResponse>('/api/auth/wechat/confirm', { scene, openid, nickname }),
}

// 安全 API
export interface LoginHistoryItem {
  id: number
  user_id: number
  username: string
  ip_address?: string
  user_agent?: string
  login_status: string
  fail_reason?: string
  created_at: string
}

export interface ChangePasswordInput {
  old_password: string
  new_password: string
}

export const securityApi = {
  getLoginHistory: () => api.get<LoginHistoryItem[]>('/api/auth/login-history'),
  changePassword: (userId: number, data: ChangePasswordInput) =>
    api.put('/api/users/' + userId + '/password', data),
  revokeAllTokens: () => api.post<{ success: boolean; message?: string }>('/api/auth/revoke-all'),
}
