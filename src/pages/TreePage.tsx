import React, { useState, useMemo } from 'react'
import { useMembers, useCreateMember, useUpdateMember, useDeleteMember } from '@/hooks/useMembers'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Switch } from '@/components/ui/switch'
import { GenealogyTree } from '@/components/TreeNode'
import { relationTagsApi, type Member, type RelationTag, type CreateMemberInput } from '@/api/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Plus,
  Search,
  User,
  Calendar,
  Briefcase,
  BookOpen,
  ZoomIn,
  ZoomOut,
  TreeDeciduous,
  Clock,
  Home,
  Award,
  Tag as TagIcon,
  Palette,
  Edit2,
  Trash2,
  Users,
  Heart,
  X,
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

export function TreePage() {
  // 成员相关
  const { data: membersData, isLoading, refetch } = useMembers()
  const createMember = useCreateMember()
  const updateMember = useUpdateMember()
  const deleteMember = useDeleteMember()

  // 状态
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [isZoomed, setIsZoomed] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isCreateTagOpen, setIsCreateTagOpen] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagType, setNewTagType] = useState('special')
  const [newTagColor, setNewTagColor] = useState(DEFAULT_TAG_COLORS[0])
  const [activeTab, setActiveTab] = useState('list')

  // 标签状态
  const [tags, setTags] = useState<RelationTag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])

  // 配偶状态 - 支持多配偶，每个配偶有各自的标签
  const [selectedSpouseIds, setSelectedSpouseIds] = useState<number[]>([])
  const [spouseTagsBySpouseId, setSpouseTagsBySpouseId] = useState<Record<number, number[]>>({})

  // 切换标签选择
  const toggleTag = (tagId: number) => {
    setSelectedTagIds(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    )
  }

  // 切换配偶选择
  const toggleSpouse = (spouseId: number) => {
    setSelectedSpouseIds(prev =>
      prev.includes(spouseId)
        ? prev.filter(id => id !== spouseId)
        : [...prev, spouseId]
    )
  }

  // 切换单个配偶的标签选择
  const toggleSpouseTag = (spouseId: number, tagId: number) => {
    setSpouseTagsBySpouseId(prev => {
      const spouseTags = prev[spouseId] || []
      return {
        ...prev,
        [spouseId]: spouseTags.includes(tagId)
          ? spouseTags.filter(id => id !== tagId)
          : [...spouseTags, tagId]
      }
    })
  }

  // 移除配偶及其标签
  const removeSpouse = (spouseId: number) => {
    setSelectedSpouseIds(prev => prev.filter(id => id !== spouseId))
    setSpouseTagsBySpouseId(prev => {
      const newState = { ...prev }
      delete newState[spouseId]
      return newState
    })
  }

  // 编辑表单
  const [editForm, setEditForm] = useState<Partial<CreateMemberInput>>({})

  const members = membersData?.data || []

  // 过滤成员
  const filteredMembers = useMemo(() => {
    if (!searchKeyword.trim()) return members
    const keyword = searchKeyword.toLowerCase()
    return members.filter(m =>
      m.name.toLowerCase().includes(keyword) ||
      (m.birth_place && m.birth_place.toLowerCase().includes(keyword)) ||
      (m.occupation && m.occupation.toLowerCase().includes(keyword))
    )
  }, [members, searchKeyword])

  // 加载标签
  const loadTags = async () => {
    const result = await relationTagsApi.list()
    if (result.data) {
      setTags(result.data)
    }
  }

  // 打开创建对话框
  const handleOpenCreate = async () => {
    await loadTags()
    setIsCreateOpen(true)
  }

  // 打开编辑对话框
  const handleOpenEdit = async (member: Member) => {
    await loadTags()
    setSelectedMember(member)
    setEditForm({
      name: member.name,
      gender: member.gender,
      birth_date: member.birth_date,
      death_date: member.death_date,
      birth_place: member.birth_place,
      occupation: member.occupation,
      biography: member.biography,
      remarkable_deeds: member.remarkable_deeds,
    })
    setIsEditOpen(true)
  }

  // 创建成员
  const handleCreateSubmit = async (data: CreateMemberInput) => {
    await createMember.mutateAsync(data)
    setIsCreateOpen(false)
    refetch()
  }

  // 更新成员
  const handleUpdateSubmit = async (data: CreateMemberInput) => {
    if (!selectedMember) return
    await updateMember.mutateAsync({ id: selectedMember.id, data })
    setIsEditOpen(false)
    setSelectedMember(null)
    refetch()
  }

  // 删除成员
  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除该成员吗？')) return
    await deleteMember.mutateAsync(id)
    if (selectedMember?.id === id) {
      setSelectedMember(null)
    }
    refetch()
  }

  // 创建标签
  const handleCreateTag = async () => {
    if (!newTagName.trim()) return
    await relationTagsApi.create({
      name: newTagName.trim(),
      tag_type: newTagType,
      color: newTagColor,
    })
    setNewTagName('')
    setIsCreateTagOpen(false)
    await loadTags()
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col animate-fade-in">
      {/* 页面标题 */}
      <div className="mb-4 shrink-0">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">族谱管理</h1>
        <p className="text-muted-foreground mt-1">管理家族成员信息</p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="shrink-0">
          <TabsTrigger value="list" className="gap-2">
            <Users className="w-4 h-4" />
            家族成员列表
          </TabsTrigger>
          <TabsTrigger value="tree" className="gap-2">
            <TreeDeciduous className="w-4 h-4" />
            族谱树
          </TabsTrigger>
          <TabsTrigger value="tags" className="gap-2">
            <TagIcon className="w-4 h-4" />
            标签管理
          </TabsTrigger>
        </TabsList>

        {/* 家族成员列表 */}
        <TabsContent value="list" className="flex-1 min-h-0 mt-4">
          <div className="h-full flex gap-4">
            {/* 左侧：成员列表 */}
            <Card className="w-96 shrink-0 border-0 shadow-sm flex flex-col">
              <CardHeader className="pb-3 shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    成员列表
                    <Badge variant="outline">{filteredMembers.length}</Badge>
                  </CardTitle>
                  <Button
                    size="sm"
                    onClick={handleOpenCreate}
                    className="gap-1 bg-gray-900 hover:bg-gray-800"
                  >
                    <Plus className="w-3 h-3" />
                    新增家族成员
                  </Button>
                </div>
                {/* 搜索 */}
                <div className="relative mt-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="搜索成员..."
                    className="pl-9 h-10"
                  />
                </div>
              </CardHeader>
              <CardContent className="flex-1 min-h-0 p-0">
                <div className="h-full overflow-y-auto">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-center">
                        <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mx-auto mb-3 animate-pulse">
                          <User className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground">加载中...</p>
                      </div>
                    </div>
                  ) : filteredMembers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                      <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center mb-4">
                        <Users className="w-8 h-8 text-zinc-400" />
                      </div>
                      <p className="text-sm text-zinc-500 mb-4">
                        {searchKeyword ? '未找到匹配的成员' : '暂无成员数据'}
                      </p>
                      {!searchKeyword && (
                        <Button
                          size="sm"
                          onClick={handleOpenCreate}
                          className="gap-2 bg-gray-900 hover:bg-gray-800"
                        >
                          <Plus className="w-4 h-4" />
                          添加成员
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-100">
                      {filteredMembers.map((member) => (
                        <div
                          key={member.id}
                          className={cn(
                            'flex items-center gap-3 p-3 hover:bg-zinc-50 cursor-pointer transition-colors group',
                            selectedMember?.id === member.id && 'bg-indigo-50'
                          )}
                          onClick={() => setSelectedMember(member)}
                        >
                          <Avatar
                            size="md"
                            fallback={member.name.charAt(0)}
                            gender={member.gender as "male" | "female"}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900 truncate">{member.name}</p>
                              <Badge
                                variant={member.gender === 'male' ? 'default' : 'danger'}
                                className="text-xs"
                              >
                                {member.gender === 'male' ? '男' : '女'}
                              </Badge>
                              {member.is_deceased && (
                                <Badge variant="outline" className="text-xs text-zinc-500">
                                  已离世
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-zinc-500 truncate">
                              {member.birth_date || '无出生日期'}
                              {member.occupation && ` · ${member.occupation}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-7 h-7"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleOpenEdit(member)
                              }}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-7 h-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(member.id)
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 右侧：成员详情 */}
            <Card className="flex-1 border-0 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold">成员详情</CardTitle>
              </CardHeader>
              <CardContent>
                {selectedMember ? (
                  <div className="space-y-6">
                    {/* Avatar and Name */}
                    <div className="flex items-center gap-4">
                      <Avatar
                        size="xl"
                        fallback={selectedMember.name.charAt(0)}
                        gender={selectedMember.gender as "male" | "female"}
                      />
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900">{selectedMember.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={selectedMember.gender === 'male' ? 'default' : 'danger'}>
                            {selectedMember.gender === 'male' ? '男' : '女'}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* Info Grid */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50">
                        <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                          <Calendar className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">出生日期</p>
                          <p className="font-medium text-gray-900">{selectedMember.birth_date || '未知'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50">
                        <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                          <Home className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">籍贯</p>
                          <p className="font-medium text-gray-900 truncate">{selectedMember.birth_place || '未知'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50">
                        <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                          <Briefcase className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">职业</p>
                          <p className="font-medium text-gray-900 truncate">{selectedMember.occupation || '未知'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50">
                        <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                          <Clock className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">状态</p>
                          <p className="font-medium text-gray-900">
                            {selectedMember.is_deceased ? (
                              <span className="text-zinc-500">已离世</span>
                            ) : (
                              <span className="text-green-600">在世</span>
                            )}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Biography */}
                    {selectedMember.biography && (
                      <div className="p-4 rounded-xl bg-zinc-50">
                        <div className="flex items-center gap-2 mb-2">
                          <BookOpen className="w-4 h-4 text-muted-foreground" />
                          <p className="text-sm font-medium text-muted-foreground">生平简介</p>
                        </div>
                        <p className="text-gray-700 leading-relaxed">{selectedMember.biography}</p>
                      </div>
                    )}

                    {/* Remarkable Deeds */}
                    {selectedMember.remarkable_deeds && (
                      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                        <div className="flex items-center gap-2 mb-2">
                          <Award className="w-4 h-4 text-amber-600" />
                          <p className="text-sm font-medium text-amber-800">突出事迹</p>
                        </div>
                        <p className="text-amber-900 leading-relaxed">{selectedMember.remarkable_deeds}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-4 border-t border-zinc-200">
                      <Button
                        variant="outline"
                        className="flex-1 gap-2"
                        onClick={() => {
                          setActiveTab('tree')
                        }}
                      >
                        <TreeDeciduous className="w-4 h-4" />
                        查看族谱树
                      </Button>
                      <Button
                        className="flex-1 gap-2 bg-gray-900 hover:bg-gray-800"
                        onClick={() => handleOpenEdit(selectedMember)}
                      >
                        <Edit2 className="w-4 h-4" />
                        编辑信息
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-center">
                    <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center mb-4">
                      <User className="w-8 h-8 text-zinc-400" />
                    </div>
                    <p className="text-sm text-zinc-500">点击左侧成员查看详情</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 族谱树 */}
        <TabsContent value="tree" className="flex-1 min-h-0 mt-4">
          <Card className="h-full border-0 shadow-sm flex flex-col">
            <CardHeader className="pb-3 shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <TreeDeciduous className="w-5 h-5" />
                  族谱树可视化
                </CardTitle>
                <div className="flex items-center gap-2">
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
            </CardHeader>
            <CardContent className="flex-1 min-h-0 p-0">
              {members.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
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
                <div className={cn(
                  "h-full overflow-auto bg-gradient-to-br from-zinc-50 to-zinc-100/50 p-4",
                )}>
                  <GenealogyTree
                    members={members}
                    relations={[]}
                    onNodeClick={(member) => {
                      setSelectedMember(member)
                      setActiveTab('list')
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 标签管理 */}
        <TabsContent value="tags" className="flex-1 min-h-0 mt-4">
          <Card className="h-full border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <TagIcon className="w-5 h-5" />
                  标签管理
                  <Badge variant="outline">{tags.length}</Badge>
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await loadTags()
                    setIsCreateTagOpen(true)
                  }}
                  className="gap-1"
                >
                  <Plus className="w-3 h-3" />
                  创建标签
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* 按分类显示标签 */}
              <div className="space-y-6">
                {TAG_TYPES.map(tagType => {
                  const typeTags = tags.filter(t => t.tag_type === tagType.value)
                  if (typeTags.length === 0) return null
                  return (
                    <div key={tagType.value} className="space-y-3">
                      <p className="text-sm font-semibold text-zinc-700">{tagType.label}</p>
                      <div className="flex flex-wrap gap-3">
                        {typeTags.map(tag => (
                          <div
                            key={tag.id}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl transition-colors"
                            style={{
                              backgroundColor: tag.color + '15',
                              borderWidth: '1px',
                              borderColor: tag.color + '40',
                            }}
                          >
                            <span
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: tag.color }}
                            />
                            <span
                              className="font-medium"
                              style={{ color: tag.color }}
                            >
                              {tag.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
                {tags.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center mb-4">
                      <TagIcon className="w-8 h-8 text-zinc-400" />
                    </div>
                    <p className="text-sm text-zinc-500 mb-4">暂无标签</p>
                    <Button
                      onClick={async () => {
                        await loadTags()
                        setIsCreateTagOpen(true)
                      }}
                      className="gap-2 bg-gray-900 hover:bg-gray-800"
                    >
                      <Plus className="w-4 h-4" />
                      创建第一个标签
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Member Dialog */}
      <MemberFormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSubmit={handleCreateSubmit}
        isLoading={createMember.isPending}
        title="添加成员"
        tags={tags}
        selectedTagIds={selectedTagIds}
        onToggleTag={toggleTag}
        members={members}
        fatherId={undefined}
        motherId={undefined}
        onFatherChange={() => {}}
        onMotherChange={() => {}}
        selectedSpouseIds={selectedSpouseIds}
        onToggleSpouse={toggleSpouse}
        spouseTagsBySpouseId={spouseTagsBySpouseId}
        onToggleSpouseTag={toggleSpouseTag}
        onRemoveSpouse={removeSpouse}
        onCreateTag={() => setIsCreateTagOpen(true)}
      />

      {/* Edit Member Dialog */}
      <MemberFormDialog
        open={isEditOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsEditOpen(false)
            setSelectedMember(null)
          }
        }}
        onSubmit={(data) => handleUpdateSubmit(data)}
        isLoading={updateMember.isPending}
        title="编辑成员"
        initialData={editForm}
        tags={tags}
        selectedTagIds={selectedTagIds}
        onToggleTag={toggleTag}
        members={members}
        fatherId={undefined}
        motherId={undefined}
        onFatherChange={() => {}}
        onMotherChange={() => {}}
        selectedSpouseIds={selectedSpouseIds}
        onToggleSpouse={toggleSpouse}
        spouseTagsBySpouseId={spouseTagsBySpouseId}
        onToggleSpouseTag={toggleSpouseTag}
        onRemoveSpouse={removeSpouse}
        onCreateTag={() => setIsCreateTagOpen(true)}
      />

      {/* Create Tag Dialog */}
      <Dialog open={isCreateTagOpen} onOpenChange={setIsCreateTagOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                <TagIcon className="w-4 h-4 text-indigo-600" />
              </div>
              创建新标签
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">标签名称</label>
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="如：革命烈士、抗日老兵"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">标签类型</label>
              <Select
                value={newTagType}
                onChange={(e) => setNewTagType(e.target.value)}
                options={TAG_TYPES.map(t => ({ value: t.value, label: t.label }))}
                className="h-11"
              />
            </div>
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

// 成员表单组件
interface MemberFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: CreateMemberInput) => void
  isLoading: boolean
  title: string
  initialData?: Partial<CreateMemberInput>
  tags: RelationTag[]
  selectedTagIds: number[]
  onToggleTag: (tagId: number) => void
  members: Member[]
  fatherId?: number
  motherId?: number
  onFatherChange: (id?: number) => void
  onMotherChange: (id?: number) => void
  selectedSpouseIds: number[]
  onToggleSpouse: (spouseId: number) => void
  spouseTagsBySpouseId: Record<number, number[]>
  onToggleSpouseTag: (spouseId: number, tagId: number) => void
  onRemoveSpouse: (spouseId: number) => void
  onCreateTag: () => void
}

function MemberFormDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  title,
  initialData,
  tags,
  selectedTagIds,
  onToggleTag,
  members,
  fatherId,
  motherId,
  onFatherChange,
  onMotherChange,
  selectedSpouseIds,
  onToggleSpouse,
  spouseTagsBySpouseId,
  onToggleSpouseTag,
  onRemoveSpouse,
  onCreateTag,
}: MemberFormDialogProps) {
  const [form, setForm] = useState<CreateMemberInput>({
    name: '',
    gender: 'male',
    birth_date: undefined,
    death_date: undefined,
    is_deceased: undefined,
    birth_place: '',
    occupation: '',
    biography: '',
    remarkable_deeds: '',
  })

  // 当 initialData 变化时更新 form
  React.useEffect(() => {
    if (initialData) {
      setForm({
        name: initialData.name || '',
        gender: initialData.gender || 'male',
        birth_date: initialData.birth_date,
        death_date: initialData.death_date,
        is_deceased: initialData.is_deceased,
        birth_place: initialData.birth_place || '',
        occupation: initialData.occupation || '',
        biography: initialData.biography || '',
        remarkable_deeds: initialData.remarkable_deeds || '',
      })
    }
  }, [initialData])

  const handleSubmit = () => {
    if (!form.name.trim()) return
    onSubmit(form)
    // 重置表单
    setForm({
      name: '',
      gender: 'male',
      birth_date: undefined,
      death_date: undefined,
      is_deceased: undefined,
      birth_place: '',
      occupation: '',
      biography: '',
      remarkable_deeds: '',
    })
  }

  const handleChange = (field: keyof CreateMemberInput, value: string | number | boolean | undefined) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  // 按分类分组标签
  const tagsByType = TAG_TYPES.reduce((acc, type) => {
    acc[type.value] = tags.filter(t => t.tag_type === type.value)
    return acc
  }, {} as Record<string, RelationTag[]>)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <User className="w-4 h-4 text-indigo-600" />
            </div>
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto py-4 space-y-6">
          {/* Name & Gender */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <span className="text-red-500">*</span>姓名
              </label>
              <Input
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="请输入成员姓名"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">性别</label>
              <Select
                value={form.gender}
                onChange={(e) => handleChange('gender', e.target.value)}
                options={[
                  { value: 'male', label: '男' },
                  { value: 'female', label: '女' },
                ]}
                className="h-11"
              />
            </div>
          </div>

          {/* Birth Date & Death Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                出生日期
              </label>
              <Input
                type="text"
                value={form.birth_date || ''}
                onChange={(e) => handleChange('birth_date', e.target.value || undefined)}
                placeholder="YYYY-MM-DD"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                逝世日期
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={form.death_date || ''}
                  onChange={(e) => {
                    const value = e.target.value || undefined
                    handleChange('death_date', value)
                    // 逝世日期与 is_deceased 联动
                    handleChange('is_deceased', !!value)
                  }}
                  placeholder="YYYY-MM-DD（选填）"
                  className="h-11 flex-1"
                />
              </div>
            </div>
          </div>

          {/* Is Deceased Toggle */}
          <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-lg">
            <Switch
              checked={form.is_deceased || false}
              disabled={true}
            />
            <span className="text-sm text-zinc-600">
              {form.is_deceased ? '已离世' : '在世'}
            </span>
            <span className="text-xs text-zinc-400">（根据逝世日期自动确定）</span>
          </div>

          {/* Birth Place */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1">
              <Home className="w-3.5 h-3.5" />
              籍贯/出生地
            </label>
            <Input
              value={form.birth_place}
              onChange={(e) => handleChange('birth_place', e.target.value)}
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
              value={form.occupation}
              onChange={(e) => handleChange('occupation', e.target.value)}
              placeholder="如：农民、教师、医生"
              className="h-11"
            />
          </div>

          {/* Parent Relations */}
          <div className="space-y-3">
            <label className="text-sm font-medium flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              父母关系
            </label>
            <div className="grid grid-cols-2 gap-4">
              <Select
                value={fatherId?.toString() || ''}
                onChange={(e) => onFatherChange(e.target.value ? parseInt(e.target.value) : undefined)}
                options={[
                  { value: '', label: '选择父亲（可选）' },
                  ...members
                    .filter(m => m.gender === 'male')
                    .map(m => ({ value: m.id.toString(), label: m.name }))
                ]}
                className="h-11"
              />
              <Select
                value={motherId?.toString() || ''}
                onChange={(e) => onMotherChange(e.target.value ? parseInt(e.target.value) : undefined)}
                options={[
                  { value: '', label: '选择母亲（可选）' },
                  ...members
                    .filter(m => m.gender === 'female')
                    .map(m => ({ value: m.id.toString(), label: m.name }))
                ]}
                className="h-11"
              />
            </div>
          </div>

          {/* Spouse Relations */}
          <div className="space-y-3">
            <label className="text-sm font-medium flex items-center gap-1">
              <Heart className="w-3.5 h-3.5" />
              配偶关系
            </label>

            {/* 已选择的配偶列表 */}
            {selectedSpouseIds.length > 0 && (
              <div className="space-y-3">
                {selectedSpouseIds.map(spouseId => {
                  const spouse = members.find(m => m.id === spouseId)
                  if (!spouse) return null
                  const spouseTags = spouseTagsBySpouseId[spouseId] || []
                  return (
                    <div key={spouseId} className="p-3 bg-zinc-50 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar
                            size="sm"
                            fallback={spouse.name.charAt(0)}
                            gender={spouse.gender as "male" | "female"}
                          />
                          <span className="font-medium text-sm">{spouse.name}</span>
                          <Badge variant={spouse.gender === 'male' ? 'default' : 'danger'} className="text-xs">
                            {spouse.gender === 'male' ? '男' : '女'}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRemoveSpouse(spouseId)}
                          className="text-zinc-400 hover:text-red-500"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      {/* 配偶标签选择 */}
                      {tagsByType['spouse'] && tagsByType['spouse'].length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {tagsByType['spouse'].map(tag => (
                            <button
                              key={tag.id}
                              type="button"
                              onClick={() => onToggleSpouseTag(spouseId, tag.id)}
                              className={cn(
                                'px-2.5 py-1 rounded-full text-xs font-medium transition-all',
                                spouseTags.includes(tag.id)
                                  ? 'ring-2 ring-offset-1'
                                  : 'opacity-60 hover:opacity-100'
                              )}
                              style={{
                                backgroundColor: tag.color + '20',
                                color: tag.color,
                              }}
                            >
                              {tag.name}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={onCreateTag}
                          className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 py-1"
                        >
                          <Plus className="w-3 h-3" />
                          创建配偶关系标签
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* 添加配偶下拉 */}
            <Select
              value={''}
              onChange={(e) => {
                const id = parseInt(e.target.value)
                if (id && !selectedSpouseIds.includes(id)) {
                  onToggleSpouse(id)
                }
              }}
              options={[
                { value: '', label: selectedSpouseIds.length > 0 ? '添加更多配偶' : '选择配偶（可选）' },
                ...members
                  .filter(m => m.id !== fatherId && m.id !== motherId && m.gender !== form.gender && !selectedSpouseIds.includes(m.id))
                  .map(m => ({ value: m.id.toString(), label: `${m.name} (${m.gender === 'male' ? '男' : '女'})` }))
              ]}
              className="h-11"
            />
          </div>

          {/* 个人标签 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium flex items-center gap-1">
                <TagIcon className="w-3.5 h-3.5" />
                个人标签
              </label>
              <button
                type="button"
                onClick={onCreateTag}
                className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                创建新标签
              </button>
            </div>
            <div className="space-y-3">
              {TAG_TYPES.filter(t => ['parent_child', 'sibling', 'special'].includes(t.value)).map(tagType => {
                const typeTags = tagsByType[tagType.value]
                if (!typeTags || typeTags.length === 0) return null
                return (
                  <div key={tagType.value} className="space-y-1.5">
                    <p className="text-xs text-zinc-500">{tagType.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {typeTags.map(tag => (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => onToggleTag(tag.id)}
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
              {tags.filter(t => ['parent_child', 'sibling', 'special'].includes(t.tag_type)).length === 0 && (
                <p className="text-sm text-zinc-400 py-2">暂无个人标签，点击"创建新标签"添加</p>
              )}
            </div>
          </div>

          {/* Biography */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5" />
              生平简介
            </label>
            <textarea
              value={form.biography}
              onChange={(e) => handleChange('biography', e.target.value)}
              placeholder="请输入成员的生平简介..."
              className="w-full min-h-[80px] px-3 py-2 rounded-lg border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none text-sm"
            />
          </div>

          {/* Remarkable Deeds */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1">
              <Award className="w-3.5 h-3.5" />
              突出事迹
            </label>
            <textarea
              value={form.remarkable_deeds}
              onChange={(e) => handleChange('remarkable_deeds', e.target.value)}
              placeholder="记录成员的突出成就、贡献或英雄事迹..."
              className="w-full min-h-[80px] px-3 py-2 rounded-lg border border-zinc-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none text-sm"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !form.name}
            className="gap-2 bg-gray-900 hover:bg-gray-800"
          >
            {isLoading ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
