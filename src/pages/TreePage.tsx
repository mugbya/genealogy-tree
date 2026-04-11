import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useMembers, useCreateMember } from '@/hooks/useMembers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { GenealogyTree } from '@/components/TreeNode'
import { relationTagsApi, type Member, type RelationTag } from '@/api/client'
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
  Heart,
  Clock,
  Home,
  Award,
  Tag,
  Palette,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// 标签类型分类
const TAG_TYPES = [
  { value: 'spouse', label: '配偶关系' },
  { value: 'parent_child', label: '父母子女关系' },
  { value: 'sibling', label: '兄弟姐妹关系' },
  { value: 'special', label: '特殊标签' },
]

// 默认标签颜色
const DEFAULT_TAG_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
  '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
]

// 导航配置
const navItems = [
  { path: '/tree', label: '族谱', icon: TreeDeciduous },
]

export function TreePage() {
  const location = useLocation()
  const { data: membersData, isLoading } = useMembers()
  const createMember = useCreateMember()
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isZoomed, setIsZoomed] = useState(false)
  const [activeTab, setActiveTab] = useState<'basic' | 'bio' | 'relations'>('basic')

  // 标签相关状态
  const [tags, setTags] = useState<RelationTag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [isCreateTagOpen, setIsCreateTagOpen] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagType, setNewTagType] = useState('special')
  const [newTagColor, setNewTagColor] = useState(DEFAULT_TAG_COLORS[0])

  // 表单数据
  const [formData, setFormData] = useState({
    name: '',
    gender: 'male',
    birth_date: undefined as string | undefined,
    death_date: undefined as string | undefined,
    birth_place: '',
    occupation: '',
    biography: '',
    remarkable_deeds: '',
    father_id: undefined as number | undefined,
    mother_id: undefined as number | undefined,
  })

  const members = membersData?.data || []

  // 加载标签
  const loadTags = async () => {
    const result = await relationTagsApi.list()
    if (result.data) {
      setTags(result.data)
    }
  }

  // 打开创建对话框时加载标签
  const handleOpenCreate = async () => {
    await loadTags()
    setIsCreateOpen(true)
  }

  // 创建新标签
  const handleCreateTag = async () => {
    if (!newTagName.trim()) return
    const result = await relationTagsApi.create({
      name: newTagName.trim(),
      tag_type: newTagType,
      color: newTagColor,
    })
    if (result.data) {
      await loadTags()
      setNewTagName('')
      setNewTagType('special')
      setNewTagColor(DEFAULT_TAG_COLORS[0])
      setIsCreateTagOpen(false)
    }
  }

  // 切换标签选择
  const toggleTag = (tagId: number) => {
    setSelectedTagIds(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    )
  }

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      gender: 'male',
      birth_date: undefined,
      death_date: undefined,
      birth_place: '',
      occupation: '',
      biography: '',
      remarkable_deeds: '',
      father_id: undefined,
      mother_id: undefined,
    })
    setSelectedTagIds([])
    setActiveTab('basic')
  }

  const handleCreateSubmit = async () => {
    if (!formData.name) return
    await createMember.mutateAsync({
      name: formData.name,
      gender: formData.gender,
      birth_date: formData.birth_date || undefined,
      death_date: formData.death_date || undefined,
      birth_place: formData.birth_place || undefined,
      occupation: formData.occupation || undefined,
      biography: formData.biography || undefined,
      remarkable_deeds: formData.remarkable_deeds || undefined,
    })
    resetForm()
    setIsCreateOpen(false)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 顶部导航 */}
      <div className="flex items-center gap-1 p-1 bg-white/80 backdrop-blur-xl border border-zinc-200/60 rounded-xl shadow-sm w-fit">
        {navItems.map((item, index) => {
          const Icon = item.icon
          const isFirst = index === 0
          const isLast = index === navItems.length - 1
          const isActive = location.pathname === item.path
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all rounded-lg',
                isActive
                  ? 'bg-zinc-900 text-white shadow-sm'
                  : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100',
                isFirst && 'rounded-l-lg',
                isLast && 'rounded-r-lg'
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
            onClick={handleOpenCreate}
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
                  onClick={handleOpenCreate}
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

      {/* Create Dialog - Multi-tab */}
      <Dialog open={isCreateOpen} onOpenChange={(open) => {
        if (!open) resetForm()
        setIsCreateOpen(open)
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                <Plus className="w-4 h-4 text-indigo-600" />
              </div>
              添加新成员
            </DialogTitle>
          </DialogHeader>

          {/* Tab Navigation */}
          <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('basic')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                activeTab === 'basic'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-600 hover:text-zinc-900'
              )}
            >
              <User className="w-4 h-4" />
              基本信息
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bio')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                activeTab === 'bio'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-600 hover:text-zinc-900'
              )}
            >
              <BookOpen className="w-4 h-4" />
              生平简介
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('relations')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                activeTab === 'relations'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-600 hover:text-zinc-900'
              )}
            >
              <Heart className="w-4 h-4" />
              家族关系
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            {/* Basic Info Tab */}
            {activeTab === 'basic' && (
              <>
                {/* Name & Gender */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-1">
                      <span className="text-red-500">*</span>姓名
                    </label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="请输入成员姓名"
                      className="h-11"
                    />
                  </div>
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
                </div>

                {/* Birth & Death Dates */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      出生日期
                    </label>
                    <Input
                      type="text"
                      value={formData.birth_date || ''}
                      onChange={(e) => setFormData({ ...formData, birth_date: e.target.value || undefined })}
                      placeholder="YYYY-MM-DD"
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      逝世日期
                    </label>
                    <Input
                      type="text"
                      value={formData.death_date || ''}
                      onChange={(e) => setFormData({ ...formData, death_date: e.target.value || undefined })}
                      placeholder="YYYY-MM-DD"
                      className="h-11"
                    />
                  </div>
                </div>

                {/* Birth Place */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1">
                    <Home className="w-3.5 h-3.5" />
                    籍贯/出生地
                  </label>
                  <Input
                    value={formData.birth_place}
                    onChange={(e) => setFormData({ ...formData, birth_place: e.target.value })}
                    placeholder="如：浙江省杭州市"
                    className="h-11"
                  />
                </div>

                {/* Occupation */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1">
                    <Briefcase className="w-3.5 h-3.5" />
                    职业
                  </label>
                  <Input
                    value={formData.occupation}
                    onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                    placeholder="如：农民、教师、医生"
                    className="h-11"
                  />
                </div>

                {/* Tags */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5" />
                      标签
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCreateTagOpen(true)}
                      className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      创建新标签
                    </button>
                  </div>

                  {/* 分类显示标签 */}
                  {TAG_TYPES.map(tagType => {
                    const typeTags = tags.filter(t => t.tag_type === tagType.value)
                    if (typeTags.length === 0) return null
                    return (
                      <div key={tagType.value} className="space-y-1.5">
                        <p className="text-xs text-zinc-500">{tagType.label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {typeTags.map(tag => (
                            <button
                              key={tag.id}
                              type="button"
                              onClick={() => toggleTag(tag.id)}
                              className={cn(
                                'px-2.5 py-1 rounded-full text-xs font-medium transition-all',
                                selectedTagIds.includes(tag.id)
                                  ? 'ring-2 ring-offset-1'
                                  : 'opacity-70 hover:opacity-100'
                              )}
                              style={{
                                backgroundColor: tag.color + '20',
                                color: tag.color,
                                borderColor: tag.color,
                              }}
                            >
                              {tag.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}

                  {tags.length === 0 && (
                    <p className="text-sm text-zinc-400 py-2">
                      暂无标签，点击"创建新标签"添加
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Biography Tab */}
            {activeTab === 'bio' && (
              <>
                {/* Biography */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5" />
                    生平简介
                  </label>
                  <textarea
                    value={formData.biography}
                    onChange={(e) => setFormData({ ...formData, biography: e.target.value })}
                    placeholder="请输入成员的生平简介..."
                    className="w-full min-h-[120px] px-3 py-2 rounded-lg border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none text-sm"
                  />
                </div>

                {/* Remarkable Deeds */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1">
                    <Award className="w-3.5 h-3.5" />
                    突出事迹
                  </label>
                  <textarea
                    value={formData.remarkable_deeds}
                    onChange={(e) => setFormData({ ...formData, remarkable_deeds: e.target.value })}
                    placeholder="记录成员的突出成就、贡献或英雄事迹..."
                    className="w-full min-h-[120px] px-3 py-2 rounded-lg border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none text-sm"
                  />
                </div>
              </>
            )}

            {/* Relations Tab */}
            {activeTab === 'relations' && (
              <>
                <p className="text-sm text-zinc-500 mb-2">
                  选择已存在的家族成员作为此人的父母关系
                </p>

                {/* Father Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">父亲</label>
                  <Select
                    value={formData.father_id?.toString() || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      father_id: e.target.value ? parseInt(e.target.value) : undefined
                    })}
                    options={[
                      { value: '', label: '请选择父亲（可选）' },
                      ...members
                        .filter(m => m.gender === 'male')
                        .map(m => ({ value: m.id.toString(), label: `${m.name} (第${m.generation || '?'}代)` }))
                    ]}
                    className="h-11"
                  />
                </div>

                {/* Mother Selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">母亲</label>
                  <Select
                    value={formData.mother_id?.toString() || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      mother_id: e.target.value ? parseInt(e.target.value) : undefined
                    })}
                    options={[
                      { value: '', label: '请选择母亲（可选）' },
                      ...members
                        .filter(m => m.gender === 'female')
                        .map(m => ({ value: m.id.toString(), label: `${m.name} (第${m.generation || '?'}代)` }))
                    ]}
                    className="h-11"
                  />
                </div>

                {/* Info Box */}
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <p className="text-sm text-amber-800">
                    <strong>提示：</strong>添加完成员后，可以在成员详情页中继续添加配偶、子女等其他关系。
                  </p>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => {
              resetForm()
              setIsCreateOpen(false)
            }}>
              取消
            </Button>
            <Button
              onClick={handleCreateSubmit}
              disabled={createMember.isPending || !formData.name}
              className="gap-2 bg-gray-900 hover:bg-gray-800"
            >
              {createMember.isPending ? '添加中...' : '添加成员'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Tag Dialog */}
      <Dialog open={isCreateTagOpen} onOpenChange={setIsCreateTagOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                <Tag className="w-4 h-4 text-indigo-600" />
              </div>
              创建新标签
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Tag Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium">标签名称</label>
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="如：革命烈士、抗日老兵"
                className="h-11"
              />
            </div>

            {/* Tag Type */}
            <div className="space-y-2">
              <label className="text-sm font-medium">标签类型</label>
              <Select
                value={newTagType}
                onChange={(e) => setNewTagType(e.target.value)}
                options={TAG_TYPES.map(t => ({ value: t.value, label: t.label }))}
                className="h-11"
              />
            </div>

            {/* Tag Color */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <Palette className="w-3.5 h-3.5" />
                标签颜色
              </label>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_TAG_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewTagColor(color)}
                    className={cn(
                      'w-8 h-8 rounded-lg transition-all',
                      newTagColor === color ? 'ring-2 ring-offset-2 ring-zinc-400 scale-110' : 'hover:scale-105'
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <label className="text-sm font-medium">预览</label>
              <div className="flex items-center justify-center py-3 bg-zinc-50 rounded-lg">
                {newTagName ? (
                  <span
                    className="px-3 py-1.5 rounded-full text-sm font-medium"
                    style={{
                      backgroundColor: newTagColor + '20',
                      color: newTagColor,
                    }}
                  >
                    {newTagName}
                  </span>
                ) : (
                  <span className="text-sm text-zinc-400">输入标签名称预览效果</span>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsCreateTagOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleCreateTag}
              disabled={!newTagName.trim()}
              className="gap-2 bg-gray-900 hover:bg-gray-800"
            >
              创建标签
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
