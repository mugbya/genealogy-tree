import { useState } from 'react'
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser, useCurrentUser } from '@/hooks/useUsers'
import { useMembers } from '@/hooks/useMembers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Edit, Trash2, Users, Shield, User as UserIcon } from 'lucide-react'

interface UserFormData {
  username: string
  password: string
  role: string
  member_id: number | null
}

const initialFormData: UserFormData = {
  username: '',
  password: '',
  role: 'user',
  member_id: null,
}

export function UsersPage() {
  const { data: usersData, isLoading } = useUsers()
  const { data: membersData } = useMembers()
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const deleteUser = useDeleteUser()
  useCurrentUser()

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<number | null>(null)
  const [formData, setFormData] = useState<UserFormData>(initialFormData)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleAdd = async () => {
    if (!formData.username || !formData.password) return
    setIsSubmitting(true)
    try {
      await createUser.mutateAsync(formData)
      setIsAddDialogOpen(false)
      setFormData(initialFormData)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEdit = async () => {
    if (!selectedUser || !formData.username) return
    setIsSubmitting(true)
    try {
      const updateData: Parameters<typeof updateUser.mutateAsync>[0]['data'] = {
        role: formData.role,
        member_id: formData.member_id,
      }
      if (formData.password) {
        updateData.password = formData.password
      }
      await updateUser.mutateAsync({ id: selectedUser, data: updateData })
      setIsEditDialogOpen(false)
      setFormData(initialFormData)
      setSelectedUser(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedUser) return
    setIsSubmitting(true)
    try {
      await deleteUser.mutateAsync(selectedUser)
      setIsDeleteDialogOpen(false)
      setSelectedUser(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  const openEditDialog = (user: { id: number; username: string; role: string; member_id: number | null }) => {
    setSelectedUser(user.id)
    setFormData({
      username: user.username,
      password: '',
      role: user.role,
      member_id: user.member_id,
    })
    setIsEditDialogOpen(true)
  }

  const openDeleteDialog = (id: number) => {
    setSelectedUser(id)
    setIsDeleteDialogOpen(true)
  }

  const memberOptions = [
    { value: '', label: '不关联' },
    ...(membersData?.data?.map((m) => ({ value: String(m.id), label: m.name })) || []),
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">用户管理</h1>
          <p className="text-muted-foreground mt-1">管理系统用户账号和权限</p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2 bg-gray-900 hover:bg-gray-800">
          <Plus className="w-4 h-4" />
          添加用户
        </Button>
      </div>

      {/* Users Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
              <Users className="w-4 h-4 text-indigo-600" />
            </div>
            用户列表
            <Badge variant="outline" className="ml-2">
              {usersData?.data?.length || 0}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : usersData?.data && usersData.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户名</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>关联家族成员</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersData.data.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-medium">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium">{user.username}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'admin' ? 'default' : 'outline'} className="gap-1">
                        {user.role === 'admin' ? (
                          <>
                            <Shield className="w-3 h-3" />
                            管理员
                          </>
                        ) : (
                          <>
                            <UserIcon className="w-3 h-3" />
                            普通用户
                          </>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>{user.member_name || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString('zh-CN')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(user)}
                          className="gap-1"
                        >
                          <Edit className="w-4 h-4" />
                          编辑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDeleteDialog(user.id)}
                          className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          删除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-16">
              <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
                <Users className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">暂无用户</h3>
              <p className="text-muted-foreground mb-4">添加第一位用户开始管理</p>
              <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2 bg-gray-900 hover:bg-gray-800">
                <Plus className="w-4 h-4" />
                添加用户
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加用户</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">用户名</label>
              <Input
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="输入用户名"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">密码</label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="输入密码"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">角色</label>
              <Select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                options={[
                  { value: 'user', label: '普通用户' },
                  { value: 'admin', label: '管理员' },
                ]}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">关联家族成员</label>
              <Select
                value={formData.member_id === null ? '' : String(formData.member_id)}
                onChange={(e) =>
                  setFormData({ ...formData, member_id: e.target.value ? Number(e.target.value) : null })
                }
                options={memberOptions}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleAdd}
              disabled={isSubmitting || !formData.username || !formData.password}
              className="bg-gray-900 hover:bg-gray-800"
            >
              {isSubmitting ? '添加中...' : '添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑用户</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">用户名</label>
              <Input value={formData.username} disabled />
              <p className="text-xs text-muted-foreground">用户名无法修改</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">新密码</label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="留空则不修改"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">角色</label>
              <Select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                options={[
                  { value: 'user', label: '普通用户' },
                  { value: 'admin', label: '管理员' },
                ]}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">关联家族成员</label>
              <Select
                value={formData.member_id === null ? '' : String(formData.member_id)}
                onChange={(e) =>
                  setFormData({ ...formData, member_id: e.target.value ? Number(e.target.value) : null })
                }
                options={memberOptions}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleEdit}
              disabled={isSubmitting}
              className="bg-gray-900 hover:bg-gray-800"
            >
              {isSubmitting ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-muted-foreground">确定要删除此用户吗？此操作无法撤销。</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleDelete}
              disabled={isSubmitting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isSubmitting ? '删除中...' : '删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
