// 通过自定义 User-Agent 检测是否为桌面端（WebView）
const isDesktop = typeof window !== 'undefined' &&
  navigator.userAgent.includes('GenealogyDesktop')

// 动态 API_BASE（桌面端通过 invoke 获取端口，浏览器端使用相对路径）
let cachedApiBase: string | null = null

async function getApiBase(): Promise<string> {
  // 非桌面端使用相对路径
  if (!isDesktop) return ''

  // 如果已经获取过端口，直接返回缓存值
  if (cachedApiBase) return cachedApiBase

  // 桌面端：通过 invoke 获取 HTTP 端口（只在启动时调用一次）
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const httpPort = await invoke<string>('get_http_port')
    cachedApiBase = `http://localhost:${httpPort || 8089}`
    console.log('[API] Got HTTP port via invoke:', cachedApiBase)
  } catch (e) {
    // 详细错误日志，帮助调试
    const tauriInternals = (window as any).__TAURI_INTERNALS__
    console.error('[API] Failed to get HTTP port:', e)
    console.error('[API] window.__TAURI_INTERNALS__:', tauriInternals)
    console.error('[API] window.__TAURI__:', (window as any).__TAURI__)
    cachedApiBase = 'http://localhost:8089'
  }

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
  // 检查功能授权 - 支持单个 feature 或多个 features 数组
  checkFeature: (feature: string | string[]) => {
    const data = Array.isArray(feature)
      ? { features: feature }
      : { feature }
    return api.post<FeatureCheckResult>('/api/license/check-feature', data)
  },
}

// Export API - 调用后端API导出文件（后端会进行授权校验）
export interface ExportVolumeRequest {
  start_generation?: number
  end_generation?: number
}

export const exportApi = {
  // 导出HTML（全部成员）
  exportHtml: async (): Promise<{ success: boolean; error?: string }> => {
    const base = await getApiBase()
    const token = localStorage.getItem('token')

    try {
      const response = await fetch(`${base}/api/export/html`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Export failed:', response.status, errorText)
        return { success: false, error: `导出失败: ${response.status}` }
      }

      // 获取文件名从 Content-Disposition header（支持 RFC 5987 filename* 编码）
      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = '族谱.html'
      if (contentDisposition) {
        // 先尝试匹配 filename*=UTF-8''xxx 格式（RFC 5987）
        const filenameStarMatch = contentDisposition.match(/filename\*=UTF-8''([^;\n]+)/i)
        if (filenameStarMatch) {
          // URL decode the filename
          filename = decodeURIComponent(filenameStarMatch[1])
        } else {
          // 回退到普通 filename="xxx" 格式
          const match = contentDisposition.match(/filename="?([^";\n]+)"?/i)
          if (match) filename = match[1]
        }
      }

      // 下载文件
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      return { success: true }
    } catch (error) {
      console.error('Export error:', error)
      return { success: false, error: `导出失败: ${error}` }
    }
  },

  // 导出HTML（分册）
  exportHtmlVolume: async (volume: ExportVolumeRequest): Promise<{ success: boolean; error?: string }> => {
    const base = await getApiBase()
    const token = localStorage.getItem('token')

    try {
      const response = await fetch(`${base}/api/export/html`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ volume }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Export failed:', response.status, errorText)
        return { success: false, error: `导出失败: ${response.status}` }
      }

      // 获取文件名（支持 RFC 5987 filename* 编码）
      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = '族谱.html'
      if (contentDisposition) {
        // 先尝试匹配 filename*=UTF-8''xxx 格式（RFC 5987）
        const filenameStarMatch = contentDisposition.match(/filename\*=UTF-8''([^;\n]+)/i)
        if (filenameStarMatch) {
          // URL decode the filename
          filename = decodeURIComponent(filenameStarMatch[1])
        } else {
          // 回退到普通 filename="xxx" 格式
          const match = contentDisposition.match(/filename="?([^";\n]+)"?/i)
          if (match) filename = match[1]
        }
      }

      // 下载文件
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      return { success: true }
    } catch (error) {
      console.error('Export error:', error)
      return { success: false, error: `导出失败: ${error}` }
    }
  },
}

export interface FeatureCheckResultItem {
  feature: string
  allowed?: boolean
  is_valid?: boolean
  expires_at?: string
  is_trial_expired?: boolean
  error?: string
}

export interface FeatureCheckResult {
  // 新格式：数组返回
  results?: FeatureCheckResultItem[]
  // 旧格式：单个返回（兼容）
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
