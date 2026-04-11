import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMembers, useCreateMember } from '@/hooks/useMembers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { GenealogyTree } from '@/components/TreeNode'
import type { Member } from '@/api/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Plus,
  X,
  User,
  Calendar,
  MapPin,
  Briefcase,
  BookOpen,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  TreeDeciduous,
  Users,
  Link2,
  Tag,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// 导航配置
const navItems = [
  { path: '/tree', label: '族谱', icon: TreeDeciduous },
  { path: '/members', label: '成员', icon: Users },
  { path: '/relations', label: '关系', icon: Link2 },
  { path: '/tags', label: '标签', icon: Tag },
]

export function TreePage() {
  const { data: membersData, isLoading } = useMembers()
  const createMember = useCreateMember()
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isZoomed, setIsZoomed] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    gender: 'male',
    generation: '',
  })

  const members = membersData?.data || []

  const handleCreateSubmit = async () => {
    if (!formData.name) return
    await createMember.mutateAsync({
      name: formData.name,
      gender: formData.gender,
      generation: formData.generation ? parseInt(formData.generation) : undefined,
    })
    setFormData({ name: '', gender: 'male', generation: '' })
    setIsCreateOpen(false)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 顶部导航 */}
      <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-xl w-fit">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              )}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          )
        })}
      </div>

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">族谱树</h1>
          <p className="text-muted-foreground mt-1">可视化家族谱系图</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsZoomed(!isZoomed)}
            className="gap-2"
          >
            {isZoomed ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
          </Button>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="gap-2 bg-gray-900 hover:bg-gray-800"
          >
            <Plus className="w-4 h-4" />
            添加成员
          </Button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Tree View */}
        <Card className={cn("border-0 shadow-sm xl:col-span-2", selectedMember && "xl:col-span-2")}>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-96">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4 animate-pulse">
                    <User className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground">加载中...</p>
                </div>
              </div>
            ) : members.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-96 text-center px-4">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center mb-6">
                  <TreeDeciduous className="w-12 h-12 text-indigo-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">暂无族谱数据</h3>
                <p className="text-muted-foreground mb-6 max-w-sm">
                  添加家族成员开始构建您的族谱树，系统将自动生成可视化谱系图
                </p>
                <Button
                  onClick={() => setIsCreateOpen(true)}
                  className="gap-2 bg-gray-900 hover:bg-gray-800"
                >
                  <Plus className="w-4 h-4" />
                  添加第一位成员
                </Button>
              </div>
            ) : (
              <div className={cn("h-[500px] xl:h-[600px] overflow-auto bg-gradient-to-br from-gray-50 to-gray-100/50 p-4", isZoomed && "h-[600px] xl:h-[700px]")}>
                <GenealogyTree
                  members={members}
                  relations={[]}
                  onNodeClick={setSelectedMember}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Member Detail Panel */}
        {selectedMember && (
          <Card className="border-0 shadow-sm animate-slide-in">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold">成员详情</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedMember(null)}
                  className="text-muted-foreground hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Avatar and Name */}
              <div className="flex items-center gap-4">
                <Avatar
                  size="xl"
                  fallback={selectedMember.name.charAt(0)}
                  gender={selectedMember.gender as "male" | "female"}
                />
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{selectedMember.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={selectedMember.gender === 'male' ? 'default' : 'danger'}>
                      {selectedMember.gender === 'male' ? '男' : '女'}
                    </Badge>
                    {selectedMember.generation && (
                      <Badge variant="outline">
                        第 {selectedMember.generation} 代
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">出生日期</p>
                    <p className="font-medium text-gray-900">{selectedMember.birth_date || '未知'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">籍贯</p>
                    <p className="font-medium text-gray-900 truncate">{selectedMember.birth_place || '未知'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Briefcase className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">职业</p>
                    <p className="font-medium text-gray-900 truncate">{selectedMember.occupation || '未知'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <User className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">代系</p>
                    <p className="font-medium text-gray-900">
                      {selectedMember.generation ? `第 ${selectedMember.generation} 代` : '未知'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Biography */}
              {selectedMember.biography && (
                <div className="p-4 rounded-xl bg-secondary/50">
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-medium text-muted-foreground">生平简介</p>
                  </div>
                  <p className="text-gray-700 leading-relaxed">{selectedMember.biography}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t border-border">
                <Button variant="outline" className="flex-1 gap-2">
                  <ChevronRight className="w-4 h-4" />
                  查看关系
                </Button>
                <Button className="flex-1 gap-2 bg-gray-900 hover:bg-gray-800">
                  编辑信息
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                <Plus className="w-4 h-4 text-indigo-600" />
              </div>
              添加新成员
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">姓名</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="请输入成员姓名"
                className="h-11"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">性别</label>
                <Select
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  options={[
                    { value: 'male', label: '男' },
                    { value: 'female', label: '女' },
                  ]}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">代系</label>
                <Input
                  type="number"
                  value={formData.generation}
                  onChange={(e) => setFormData({ ...formData, generation: e.target.value })}
                  placeholder="如：1"
                  className="h-11"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleCreateSubmit}
              disabled={createMember.isPending || !formData.name}
              className="gap-2 bg-gray-900 hover:bg-gray-800"
            >
              {createMember.isPending ? '添加中...' : '添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
