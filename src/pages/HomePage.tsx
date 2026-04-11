import { Link } from 'react-router-dom'
import { useHealthCheck, useMembers, useCreateMember } from '@/hooks/useMembers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Users,
  TreeDeciduous,
  Plus,
  ArrowRight,
  Heart,
  ChevronRight,
  Calendar,
  MoreHorizontal,
  Edit,
  Trash2,
  Tag,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Dropdown, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown'

export function HomePage() {
  const { data: healthData, isLoading: healthLoading } = useHealthCheck()
  const { data: membersData, isLoading: membersLoading } = useMembers()
  const createMember = useCreateMember()
  const [isAdding, setIsAdding] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    gender: 'male',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name) return
    setIsAdding(true)
    try {
      await createMember.mutateAsync(formData)
      setFormData({ name: '', gender: 'male' })
    } finally {
      setIsAdding(false)
    }
  }

  const memberCount = membersData?.data?.length || 0

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">欢迎回来</h1>
          <p className="text-muted-foreground mt-1">查看和管理您的家族谱系</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/tree">
            <Button variant="outline" className="gap-2">
              <TreeDeciduous className="w-4 h-4" />
              族谱树
            </Button>
          </Link>
          <Link to="/members">
            <Button className="gap-2 bg-gray-900 hover:bg-gray-800">
              <Users className="w-4 h-4" />
              管理成员
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        <Card className="border-0 shadow-sm card card-hover">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">家族成员</p>
                <div className="text-3xl font-bold text-gray-900 mt-2">
                  {membersLoading ? <Skeleton className="h-9 w-16" /> : memberCount}
                </div>
                <p className="text-sm text-muted-foreground mt-1">共 {memberCount} 人</p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
                <Users className="w-7 h-7 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm card card-hover">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">族谱树</p>
                <div className="text-3xl font-bold text-gray-900 mt-2">
                  {membersLoading ? <Skeleton className="h-9 w-20" /> : memberCount > 0 ? '已生成' : '待创建'}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {memberCount > 0 ? `${memberCount} 个节点` : '添加成员开始'}
                </p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center">
                <TreeDeciduous className="w-7 h-7 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm card card-hover">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">关系数量</p>
                <div className="text-3xl font-bold text-gray-900 mt-2">
                  {membersLoading ? <Skeleton className="h-9 w-12" /> : '0'}
                </div>
                <p className="text-sm text-muted-foreground mt-1">已建立</p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center">
                <ArrowRight className="w-7 h-7 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm card card-hover">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">系统状态</p>
                <div className="flex items-center gap-2 mt-2">
                  {healthLoading ? (
                    <Skeleton className="h-6 w-6 rounded-full" />
                  ) : (
                    <>
                      <span
                        className={cn(
                          "w-2.5 h-2.5 rounded-full",
                          healthData?.data ? "bg-green-500" : "bg-red-500"
                        )}
                      />
                      <p className="text-lg font-bold text-gray-900">
                        {healthData?.data ? '在线' : '离线'}
                      </p>
                    </>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {healthData?.data ? '服务正常' : '请检查连接'}
                </p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
                <Heart className="w-7 h-7 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Add Card */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
                <Plus className="w-4 h-4 text-indigo-600" />
              </div>
              快速添加成员
            </CardTitle>
            <Badge variant={createMember.isSuccess ? "success" : "outline"}>
              {createMember.isSuccess ? '添加成功' : '快捷入口'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="输入成员姓名..."
                className="h-11"
                disabled={isAdding}
              />
            </div>
            <Select
              value={formData.gender}
              onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
              options={[
                { value: 'male', label: '男' },
                { value: 'female', label: '女' },
              ]}
              className="w-full sm:w-28"
              disabled={isAdding}
            />
            <Button
              type="submit"
              disabled={isAdding || !formData.name}
              className="h-11 bg-gray-900 hover:bg-gray-800 gap-2"
            >
              <Plus className="w-4 h-4" />
              {isAdding ? '添加中...' : '添加'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Members List */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
                <Users className="w-4 h-4 text-indigo-600" />
              </div>
              家族成员
              <Badge variant="outline" className="ml-2">{memberCount}</Badge>
            </CardTitle>
            <Link
              to="/members"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
            >
              查看全部
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {membersLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-border">
                  <Skeleton variant="circular" className="w-14 h-14" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : membersData?.data && membersData.data.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
              {membersData.data.slice(0, 6).map((member) => (
                <div
                  key={member.id}
                  className="group flex items-center gap-4 p-4 rounded-xl border border-border hover:border-indigo-200 hover:bg-indigo-50/30 transition-all duration-200 cursor-pointer"
                >
                  <Avatar
                    size="lg"
                    fallback={member.name.charAt(0)}
                    gender={member.gender as "male" | "female"}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{member.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={member.gender === 'male' ? 'default' : 'danger'}>
                        {member.gender === 'male' ? '男' : '女'}
                      </Badge>
                      {member.generation && (
                        <span className="text-xs text-muted-foreground">
                          第 {member.generation} 代
                        </span>
                      )}
                    </div>
                    {member.birth_date && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {member.birth_date}
                      </div>
                    )}
                  </div>
                  <Dropdown
                    trigger={
                      <button className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                      </button>
                    }
                    align="right"
                  >
                    <DropdownItem icon={<Edit className="w-4 h-4" />}>
                      编辑信息
                    </DropdownItem>
                    <DropdownItem icon={<Users className="w-4 h-4" />}>
                      查看关系
                    </DropdownItem>
                    <DropdownSeparator />
                    <DropdownItem icon={<Trash2 className="w-4 h-4" />} danger>
                      删除成员
                    </DropdownItem>
                  </Dropdown>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
                <Users className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">暂无成员</h3>
              <p className="text-muted-foreground mb-4">添加第一位家族成员开始构建族谱</p>
              <Button className="gap-2 bg-gray-900 hover:bg-gray-800">
                <Plus className="w-4 h-4" />
                添加成员
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            to: '/tree',
            icon: TreeDeciduous,
            title: '族谱树',
            description: '可视化谱系图',
            color: 'indigo',
          },
          {
            to: '/members',
            icon: Users,
            title: '成员管理',
            description: '编辑成员信息',
            color: 'blue',
          },
          {
            to: '/relations',
            icon: ArrowRight,
            title: '关系管理',
            description: '管理家族关系',
            color: 'purple',
          },
          {
            to: '/tags',
            icon: Tag,
            title: '标签管理',
            description: '自定义标签',
            color: 'pink',
          },
        ].map((item) => {
          const Icon = item.icon
          const colors = {
            indigo: 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100',
            blue: 'bg-blue-50 text-blue-600 group-hover:bg-blue-100',
            purple: 'bg-purple-50 text-purple-600 group-hover:bg-purple-100',
            pink: 'bg-pink-50 text-pink-600 group-hover:bg-pink-100',
          }
          return (
            <Link key={item.to} to={item.to}>
              <div className="flex items-center gap-4 p-4 rounded-xl border border-border hover:border-gray-300 hover:bg-secondary/50 transition-all cursor-pointer group">
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center transition-colors", colors[item.color as keyof typeof colors])}>
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{item.title}</p>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
