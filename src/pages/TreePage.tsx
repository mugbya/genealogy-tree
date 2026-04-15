import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useMembers, useCreateMember, useUpdateMember, useDeleteMember, useMemberRelations, useCreateMemberRelation, useDeleteMemberRelation, useEditableMemberIds } from '@/hooks/useMembers'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Switch } from '@/components/ui/switch'
import { GenealogyTree } from '@/components/TreeNode'
import { membersApi, relationTagsApi, configApi, type Member, type RelationTag, type CreateMemberInput } from '@/api/client'
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
  Download,
  Upload,
  Save,
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
  const { data: relationsData } = useMemberRelations()
  const { data: editableIdsData } = useEditableMemberIds()
  const editableMemberIds = editableIdsData?.data || []
  const createMember = useCreateMember()
  const updateMember = useUpdateMember()
  const deleteMember = useDeleteMember()
  const createMemberRelation = useCreateMemberRelation()
  const deleteMemberRelation = useDeleteMemberRelation()

  // 状态
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  // 搜索过滤器
  const [filterGender, setFilterGender] = useState<string>('')
  const [filterIsDeceased, setFilterIsDeceased] = useState<string>('')
  const [filterIsMatrilocal, setFilterIsMatrilocal] = useState<string>('')
  const [filterIsAdoptedSon, setFilterIsAdoptedSon] = useState<string>('')
  const [filterOccupation, setFilterOccupation] = useState<string>('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isCreateTagOpen, setIsCreateTagOpen] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagType, setNewTagType] = useState('special')
  const [newTagColor, setNewTagColor] = useState(DEFAULT_TAG_COLORS[0])
  const [activeTab, setActiveTab] = useState('list')
  // 族谱树起始成员选择
  const [treeRootMemberId, setTreeRootMemberId] = useState<number | null>(null)
  const treeRef = useRef<{ container: HTMLDivElement | null; exportSvgAsDataUrl: () => string }>(null)

  // 标签状态
  const [tags, setTags] = useState<RelationTag[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [isDeleteTagOpen, setIsDeleteTagOpen] = useState(false)
  const [tagToDelete, setTagToDelete] = useState<RelationTag | null>(null)

  // 配偶状态 - 支持多配偶，每个配偶有各自的标签
  const [selectedSpouseIds, setSelectedSpouseIds] = useState<number[]>([])
  const [spouseTagsBySpouseId, setSpouseTagsBySpouseId] = useState<Record<number, number[]>>({})

  // 编辑时记录原有的配偶IDs，用于比较变更
  const [originalSpouseIds, setOriginalSpouseIds] = useState<number[]>([])

  // 父母状态
  const [selectedFatherId, setSelectedFatherId] = useState<number | undefined>()
  const [selectedMotherId, setSelectedMotherId] = useState<number | undefined>()
  const [originalFatherId, setOriginalFatherId] = useState<number | undefined>()
  const [originalMotherId, setOriginalMotherId] = useState<number | undefined>()

  // 族谱配置状态
  const [familyName, setFamilyName] = useState('')
  const [familySurname, setFamilySurname] = useState('')
  const [familyOrigin, setFamilyOrigin] = useState('')
  const [familyMaxim, setFamilyMaxim] = useState('')
  const [familyGenerationWords, setFamilyGenerationWords] = useState('')
  const [familyConfigSaving, setFamilyConfigSaving] = useState(false)

  // 加载族谱配置
  useEffect(() => {
    loadFamilyConfig()
  }, [])

  // 切换到标签tab时加载标签
  useEffect(() => {
    if (activeTab === 'tags') {
      loadTags()
    }
  }, [activeTab])

  const loadFamilyConfig = async () => {
    try {
      const result = await configApi.getPublic()
      if (result.data) {
        setFamilyName(result.data.family_name || '')
        setFamilySurname(result.data.family_surname || '')
        setFamilyOrigin(result.data.family_origin || '')
        setFamilyMaxim(result.data.family_maxim || '')
        setFamilyGenerationWords(result.data.family_generation_words || '')
      }
    } catch (error) {
      console.error('Failed to load family config:', error)
    }
  }

  const saveFamilyConfig = async () => {
    setFamilyConfigSaving(true)
    try {
      await configApi.setBatch([
        { key: 'family_name', value: familyName },
        { key: 'family_surname', value: familySurname },
        { key: 'family_origin', value: familyOrigin },
        { key: 'family_maxim', value: familyMaxim },
        { key: 'family_generation_words', value: familyGenerationWords },
      ])
      alert('保存成功！')
    } catch (error) {
      console.error('Failed to save family config:', error)
      alert('保存失败')
    } finally {
      setFamilyConfigSaving(false)
    }
  }

  // 导入状态
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; updated: number; errors: string[] } | null>(null)
  const [isImportResultOpen, setIsImportResultOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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
    return members.filter(m => {
      // 关键词搜索
      if (searchKeyword.trim()) {
        const keyword = searchKeyword.toLowerCase()
        if (
          !m.name.toLowerCase().includes(keyword) &&
          !(m.birth_place && m.birth_place.toLowerCase().includes(keyword)) &&
          !(m.occupation && m.occupation.toLowerCase().includes(keyword))
        ) {
          return false
        }
      }

      // 性别过滤
      if (filterGender && m.gender !== filterGender) {
        return false
      }

      // 在离世过滤
      if (filterIsDeceased === 'deceased' && !m.is_deceased) return false
      if (filterIsDeceased === 'alive' && m.is_deceased) return false

      // 入赘过滤
      if (filterIsMatrilocal === 'yes' && !m.is_matrilocal) return false
      if (filterIsMatrilocal === 'no' && m.is_matrilocal) return false

      // 招夫养子过滤
      if (filterIsAdoptedSon === 'yes' && !m.is_adopted_son) return false
      if (filterIsAdoptedSon === 'no' && m.is_adopted_son) return false

      // 职业过滤
      if (filterOccupation.trim()) {
        if (!m.occupation || !m.occupation.toLowerCase().includes(filterOccupation.toLowerCase())) {
          return false
        }
      }

      return true
    })
  }, [members, searchKeyword, filterGender, filterIsDeceased, filterIsMatrilocal, filterIsAdoptedSon, filterOccupation])

  // 计算有子女的成员（用于族谱树起始成员选择）
  const membersWithChildren = useMemo(() => {
    const relations = relationsData?.data || []
    const parentChildRelations = relations.filter(r => r.relation_type === 'father' || r.relation_type === 'mother')
    const parentIds = new Set(parentChildRelations.map(r => r.to_member_id))
    return members.filter(m => parentIds.has(m.id))
  }, [members, relationsData])

  // 计算成员的亲缘关系（父亲、母亲、配偶）
  const memberRelations = useMemo(() => {
    const relations = relationsData?.data || []
    const memberMap = new Map(members.map(m => [m.id, m]))

    // parentChildRelations: from_member_id = child, to_member_id = parent
    const parentRelations = relations.filter(r => r.relation_type === 'father' || r.relation_type === 'mother')
    const spouseRelations = relations.filter(r => r.relation_type === 'spouse')

    const result = new Map<number, { father?: string; mother?: string; spouses: string[] }>()

    // 计算父亲和母亲
    members.forEach(member => {
      const parentRels = parentRelations.filter(r => r.from_member_id === member.id)
      let father: string | undefined
      let mother: string | undefined

      parentRels.forEach(rel => {
        const parent = memberMap.get(rel.to_member_id)
        if (parent) {
          if (rel.relation_type === 'father') {
            father = parent.name
          } else if (rel.relation_type === 'mother') {
            mother = parent.name
          }
        }
      })

      result.set(member.id, { father, mother, spouses: [] })
    })

    // 计算配偶
    members.forEach(member => {
      const spouseRels = spouseRelations.filter(
        r => r.from_member_id === member.id || r.to_member_id === member.id
      )
      const spouses: string[] = []

      spouseRels.forEach(rel => {
        const spouseId = rel.from_member_id === member.id ? rel.to_member_id : rel.from_member_id
        const spouse = memberMap.get(spouseId)
        if (spouse && !spouses.includes(spouse.name)) {
          spouses.push(spouse.name)
        }
      })

      const existing = result.get(member.id) || { father: undefined, mother: undefined, spouses: [] }
      existing.spouses = spouses
      result.set(member.id, existing)
    })

    return result
  }, [members, relationsData])

  // 加载标签
  const loadTags = async () => {
    const result = await relationTagsApi.list()
    if (result.data) {
      setTags(result.data)
    }
  }

  // 删除标签
  const handleDeleteTag = async () => {
    if (!tagToDelete) return
    try {
      await relationTagsApi.delete(tagToDelete.id)
      setTags(tags.filter(t => t.id !== tagToDelete.id))
      setIsDeleteTagOpen(false)
      setTagToDelete(null)
    } catch (err) {
      console.error('删除标签失败:', err)
    }
  }

  // 打开创建对话框
  const handleOpenCreate = async () => {
    await loadTags()
    setIsCreateOpen(true)
  }

  // 截图下载族谱树
  const handleScreenshot = async () => {
    if (!treeRef.current) return
    try {
      // 确定导出文件名：优先使用根成员姓名，其次使用家族名
      let exportName = familyName || '族谱树'
      if (treeRootMemberId) {
        const rootMember = members.find(m => m.id === treeRootMemberId)
        if (rootMember) {
          exportName = rootMember.name
        }
      }

      // 使用 SVG 方式导出完整族谱树
      const svgContent = treeRef.current.exportSvgAsDataUrl()
      if (!svgContent) return

      const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(svgBlob)

      const img = new Image()
      img.onload = () => {
        const svgMatch = svgContent.match(/width="(\d+)" height="(\d+)"/)
        const width = svgMatch ? parseInt(svgMatch[1]) : 2000
        const height = svgMatch ? parseInt(svgMatch[2]) : 2000

        const canvas = document.createElement('canvas')
        canvas.width = width * 2
        canvas.height = height * 2
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.scale(2, 2)
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, width, height)
          ctx.drawImage(img, 0, 0)

          const link = document.createElement('a')
          link.download = `${exportName}_${new Date().toISOString().slice(0, 10)}.png`
          link.href = canvas.toDataURL('image/png')
          link.click()
        }
        URL.revokeObjectURL(url)
      }
      img.src = url
    } catch (err) {
      console.error('截图失败:', err)
    }
  }

  // 打开编辑对话框
  const handleOpenEdit = async (member: Member) => {
    await loadTags()

    // 加载该成员现有的关系
    const relations = relationsData?.data || []

    // 加载配偶关系
    const existingSpouses = relations
      .filter(r => r.relation_type === 'spouse' && (r.from_member_id === member.id || r.to_member_id === member.id))
      .map(r => r.from_member_id === member.id ? r.to_member_id : r.from_member_id)

    setSelectedSpouseIds(existingSpouses)
    setOriginalSpouseIds(existingSpouses)

    // 加载父亲和母亲关系
    const fatherRel = relations.find(r => r.relation_type === 'father' && r.from_member_id === member.id)
    const motherRel = relations.find(r => r.relation_type === 'mother' && r.from_member_id === member.id)

    setSelectedFatherId(fatherRel?.to_member_id)
    setSelectedMotherId(motherRel?.to_member_id)
    setOriginalFatherId(fatherRel?.to_member_id)
    setOriginalMotherId(motherRel?.to_member_id)

    setSelectedMember(member)
    setEditForm({
      name: member.name,
      surname: member.surname,
      gender: member.gender,
      birth_date: member.birth_date,
      death_date: member.death_date,
      is_deceased: member.is_deceased,
      birth_place: member.birth_place,
      occupation: member.occupation,
      biography: member.biography,
      remarkable_deeds: member.remarkable_deeds,
      is_matrilocal: member.is_matrilocal,
      is_adopted_son: member.is_adopted_son,
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

    // 更新成员基本信息
    await updateMember.mutateAsync({ id: selectedMember.id, data })

    // 同步配偶关系
    const relations = relationsData?.data || []
    const memberId = selectedMember.id

    // 找出需要添加和删除的配偶
    const currentSpouseIds = selectedSpouseIds
    const originalSpouseIdsSet = new Set(originalSpouseIds)

    // 需要删除的配偶（原有名单中有，但现在没有的）
    const toRemove = originalSpouseIds.filter(id => !currentSpouseIds.includes(id))
    // 需要添加的配偶（当前有，但原有名单中没有的）
    const toAdd = currentSpouseIds.filter(id => !originalSpouseIdsSet.has(id))

    // 查找现有的配偶关系记录ID（用于删除）
    const existingSpouseRels = relations.filter(
      r => r.relation_type === 'spouse' && (r.from_member_id === memberId || r.to_member_id === memberId)
    )

    // 删除移除的配偶关系
    for (const spouseId of toRemove) {
      const rel = existingSpouseRels.find(
        r => (r.from_member_id === memberId && r.to_member_id === spouseId) ||
             (r.to_member_id === memberId && r.from_member_id === spouseId)
      )
      if (rel) {
        await deleteMemberRelation.mutateAsync(rel.id)
      }
    }

    // 添加新的配偶关系
    for (const spouseId of toAdd) {
      await createMemberRelation.mutateAsync({
        from_member_id: memberId,
        to_member_id: spouseId,
        relation_type: 'spouse',
      })
    }

    // 同步父亲关系
    const existingFatherRel = relations.find(r => r.relation_type === 'father' && r.from_member_id === memberId)
    if (selectedFatherId !== originalFatherId) {
      // 删除原有的父亲关系
      if (existingFatherRel) {
        await deleteMemberRelation.mutateAsync(existingFatherRel.id)
      }
      // 添加新的父亲关系
      if (selectedFatherId) {
        await createMemberRelation.mutateAsync({
          from_member_id: memberId,
          to_member_id: selectedFatherId,
          relation_type: 'father',
        })
      }
    }

    // 同步母亲关系
    const existingMotherRel = relations.find(r => r.relation_type === 'mother' && r.from_member_id === memberId)
    if (selectedMotherId !== originalMotherId) {
      // 删除原有的母亲关系
      if (existingMotherRel) {
        await deleteMemberRelation.mutateAsync(existingMotherRel.id)
      }
      // 添加新的母亲关系
      if (selectedMotherId) {
        await createMemberRelation.mutateAsync({
          from_member_id: memberId,
          to_member_id: selectedMotherId,
          relation_type: 'mother',
        })
      }
    }

    setIsEditOpen(false)
    setSelectedMember(null)
    setOriginalSpouseIds([])
    setOriginalFatherId(undefined)
    setOriginalMotherId(undefined)
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

  // 导入成员
  const handleImport = async (file: File) => {
    setIsImporting(true)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      // 手动进行 base64 编码
      const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
      let base64 = ''
      for (let i = 0; i < bytes.length; i += 3) {
        const byte1 = bytes[i]
        const byte2 = bytes[i + 1] ?? 0
        const byte3 = bytes[i + 2] ?? 0
        base64 += base64Chars[byte1 >> 2]
        base64 += base64Chars[((byte1 & 3) << 4) | (byte2 >> 4)]
        base64 += base64Chars[((byte2 & 15) << 2) | (byte3 >> 6)]
        base64 += base64Chars[byte3 & 63]
      }
      // 补齐 padding
      const padding = (3 - (bytes.length % 3)) % 3
      if (padding > 0) {
        base64 = base64.slice(0, -padding) + '=='.slice(0, padding)
      }

      const result = await membersApi.import(base64)
      if (result.error) {
        alert('导入失败: ' + result.error)
      } else if (result.data) {
        setImportResult(result.data)
        setIsImportResultOpen(true)
        refetch()
      }
    } catch (error) {
      alert('导入失败: ' + error)
    } finally {
      setIsImporting(false)
    }
  }

  // 下载模板
  const handleDownloadTemplate = () => {
    const template = `姓名,性别,出生日期,逝世日期,是否离世,籍贯,职业,父亲,母亲,配偶
贾演,男,,,,是,京城,官绅,,
贾代化,男,,,,是,京城,官绅,贾演,,
贾敬,男,,,,是,京城,道士,贾代化,,
贾珍,男,,,,是,京城,官绅,贾敬,,
贾珍配偶,女,,,,是,京城,,贾珍,,`

    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = '家族成员导入模板.csv'
    link.click()
    URL.revokeObjectURL(url)
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
        <TabsList className="shrink-0 bg-white">
          <TabsTrigger value="info" className="gap-2 text-base py-3 px-4">
            <BookOpen className="w-5 h-5" />
            族谱信息
          </TabsTrigger>
          <TabsTrigger value="list" className="gap-2 text-base py-3 px-4">
            <Users className="w-5 h-5" />
            家族成员列表
          </TabsTrigger>
          <TabsTrigger value="tree" className="gap-2 text-base py-3 px-4">
            <TreeDeciduous className="w-5 h-5" />
            族谱树
          </TabsTrigger>
          <TabsTrigger value="tags" className="gap-2 text-base py-3 px-4">
            <TagIcon className="w-5 h-5" />
            标签管理
          </TabsTrigger>
        </TabsList>

        {/* 族谱信息 */}
        <TabsContent value="info" className="flex-1 min-h-0 mt-4">
          <div className="space-y-6">
            {/* 第一行：姓氏 + 名称 */}
            <div className="grid grid-cols-2 gap-6">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
                      <span className="text-indigo-600 font-bold text-sm">姓</span>
                    </span>
                    家族姓氏
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Input
                    value={familySurname}
                    onChange={(e) => setFamilySurname(e.target.value)}
                    placeholder="如：贾、王、张"
                    className="h-10"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    族谱树会根据姓氏判断本家与外姓
                  </p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                      <span className="text-amber-600 font-bold text-sm">名</span>
                    </span>
                    家族名称
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Input
                    value={familyName}
                    onChange={(e) => setFamilyName(e.target.value)}
                    placeholder="如：红楼梦贾府"
                    className="h-10"
                  />
                </CardContent>
              </Card>
            </div>

            {/* 第二行：祖训 + 辈字列表 */}
            <div className="grid grid-cols-2 gap-6">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-rose-50 flex items-center justify-center">
                      <span className="text-rose-600 font-bold text-sm">训</span>
                    </span>
                    祖训
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <textarea
                    value={familyMaxim}
                    onChange={(e) => setFamilyMaxim(e.target.value)}
                    placeholder="记录家族的规矩、训诫文字，如：尊祖敬宗、孝顺父母、和睦乡邻"
                    className="w-full h-28 px-3 py-2 text-sm border border-zinc-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-zinc-400"
                  />
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center">
                      <span className="text-violet-600 font-bold text-sm">辈</span>
                    </span>
                    辈字列表
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <textarea
                    value={familyGenerationWords}
                    onChange={(e) => setFamilyGenerationWords(e.target.value)}
                    placeholder="家族成员取名用的字辈序列，如：仁,义,礼,智,信"
                    className="w-full h-28 px-3 py-2 text-sm border border-zinc-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-zinc-400"
                  />
                </CardContent>
              </Card>
            </div>

            {/* 第三行：家族来源 */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <span className="text-emerald-600 font-bold text-sm">源</span>
                  </span>
                  家族来源
                </CardTitle>
              </CardHeader>
              <CardContent>
                <textarea
                  value={familyOrigin}
                  onChange={(e) => setFamilyOrigin(e.target.value)}
                  placeholder="记录家族的起源或迁移历史，如：京城、江南金陵"
                  className="w-full h-20 px-3 py-2 text-sm border border-zinc-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-zinc-400"
                />
              </CardContent>
            </Card>

            {/* 第四行：保存按钮 + 说明 */}
            <div className="flex items-start gap-6">
              <Button
                onClick={saveFamilyConfig}
                disabled={familyConfigSaving}
                size="lg"
                className="gap-2 bg-indigo-600 hover:bg-indigo-700 shrink-0"
              >
                <Save className="w-4 h-4" />
                {familyConfigSaving ? '保存中...' : '保存修改'}
              </Button>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex-1">
                <h3 className="font-medium text-amber-800 mb-2">设置说明</h3>
                <ul className="text-sm text-amber-700 space-y-1">
                  <li>• <strong>家族姓氏</strong>：用于判断本家与外姓，是族谱树正确展示的关键</li>
                  <li>• <strong>同姓本家</strong>：如贾姓成员，将作为族谱树上的节点展示</li>
                  <li>• <strong>外姓配偶</strong>：如王氏，将显示在连接线上</li>
                </ul>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* 家族成员列表 */}
        <TabsContent value="list" className="flex-1 min-h-0 mt-4">
          <div className="h-full flex gap-4">
            {/* 左侧：成员列表 */}
            <Card className="w-[580px] shrink-0 border-0 shadow-sm flex flex-col">
              <CardHeader className="pb-3 shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    成员列表
                    <Badge variant="outline">{filteredMembers.length}</Badge>
                  </CardTitle>
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      onClick={handleOpenCreate}
                      className="gap-1 bg-gray-900 hover:bg-gray-800"
                    >
                      <Plus className="w-3 h-3" />
                      新增
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isImporting}
                      className="gap-1"
                    >
                      <Upload className="w-3 h-3" />
                      {isImporting ? '导入中...' : '导入'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDownloadTemplate}
                      className="gap-1"
                    >
                      <Download className="w-3 h-3" />
                      模板
                    </Button>
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        handleImport(file)
                        e.target.value = ''
                      }
                    }}
                  />
                </div>
                {/* 搜索和过滤器 */}
                <div className="mt-3 space-y-3">
                  {/* 关键词搜索 */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      placeholder="搜索成员姓名、出生地、职业..."
                      className="pl-9 h-10"
                    />
                  </div>
                  {/* 筛选条件 */}
                  <div className="flex flex-wrap gap-2">
                    {/* 性别 */}
                    <select
                      value={filterGender}
                      onChange={(e) => setFilterGender(e.target.value)}
                      className="h-9 px-3 text-sm border border-zinc-200 rounded-lg bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                    >
                      <option value="">性别</option>
                      <option value="male">男</option>
                      <option value="female">女</option>
                    </select>
                    {/* 在离世 */}
                    <select
                      value={filterIsDeceased}
                      onChange={(e) => setFilterIsDeceased(e.target.value)}
                      className="h-9 px-3 text-sm border border-zinc-200 rounded-lg bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                    >
                      <option value="">在离世</option>
                      <option value="alive">在世</option>
                      <option value="deceased">离世</option>
                    </select>
                    {/* 入赘 */}
                    <select
                      value={filterIsMatrilocal}
                      onChange={(e) => setFilterIsMatrilocal(e.target.value)}
                      className="h-9 px-3 text-sm border border-zinc-200 rounded-lg bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                    >
                      <option value="">入赘</option>
                      <option value="yes">是</option>
                      <option value="no">否</option>
                    </select>
                    {/* 招夫养子 */}
                    <select
                      value={filterIsAdoptedSon}
                      onChange={(e) => setFilterIsAdoptedSon(e.target.value)}
                      className="h-9 px-3 text-sm border border-zinc-200 rounded-lg bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                    >
                      <option value="">招夫养子</option>
                      <option value="yes">是</option>
                      <option value="no">否</option>
                    </select>
                    {/* 职业 */}
                    <Input
                      value={filterOccupation}
                      onChange={(e) => setFilterOccupation(e.target.value)}
                      placeholder="职业"
                      className="h-9 w-28 text-sm"
                    />
                    {/* 重置按钮 */}
                    {(filterGender || filterIsDeceased || filterIsMatrilocal || filterIsAdoptedSon || filterOccupation) && (
                      <button
                        onClick={() => {
                          setFilterGender('')
                          setFilterIsDeceased('')
                          setFilterIsMatrilocal('')
                          setFilterIsAdoptedSon('')
                          setFilterOccupation('')
                        }}
                        className="h-9 px-3 text-sm text-zinc-500 hover:text-zinc-700 border border-zinc-200 rounded-lg hover:bg-zinc-50"
                      >
                        重置
                      </button>
                    )}
                  </div>
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
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-gray-900 truncate text-sm">{member.name}</p>
                              <Badge
                                variant={member.gender === 'male' ? 'default' : 'danger'}
                                className="text-xs"
                              >
                                {member.gender === 'male' ? '男' : '女'}
                              </Badge>
                              {member.occupation && <span className="text-sm text-zinc-600"> · {member.occupation}</span>}
                              {member.is_deceased && (
                                <Badge variant="outline" className="text-xs text-zinc-500">
                                  已离世
                                </Badge>
                              )}
                              {/* 亲缘关系信息 - 全部在一行 */}
                              {(() => {
                                const rels = memberRelations.get(member.id)
                                const parts: string[] = []
                                if (rels?.father) parts.push(`父 ${rels.father}`)
                                if (rels?.mother) parts.push(`母 ${rels.mother}`)
                                if (rels?.spouses.length) parts.push(`配偶 ${rels.spouses.join(', ')}`)
                                return parts.length > 0 ? (
                                  <span className="text-sm text-indigo-600 truncate">
                                    {parts.join(' · ')}
                                  </span>
                                ) : null
                              })()}
                            </div>
                            <p className="text-sm text-zinc-500 truncate">
                              {member.birth_date || '无出生日期'}

                            </p>
                          </div>
                          {editableMemberIds.includes(member.id) && (
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
                          )}
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
                          setTreeRootMemberId(selectedMember.id)
                          setActiveTab('tree')
                        }}
                      >
                        <TreeDeciduous className="w-4 h-4" />
                        查看族谱树
                      </Button>
                      {editableMemberIds.includes(selectedMember.id) && (
                        <Button
                          className="flex-1 gap-2 bg-gray-900 hover:bg-gray-800"
                          onClick={() => handleOpenEdit(selectedMember)}
                        >
                          <Edit2 className="w-4 h-4" />
                          编辑信息
                        </Button>
                      )}
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
                    onClick={handleScreenshot}
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    截图下载
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
                  {/* 族谱树起始成员选择器 */}
                  <div className="mb-4 flex items-center gap-3 bg-white/80 backdrop-blur-sm rounded-lg px-4 py-2 shadow-sm">
                    <span className="text-sm text-gray-600">从以下成员开始展示：</span>
                    <select
                      value={treeRootMemberId ?? ''}
                      onChange={(e) => setTreeRootMemberId(e.target.value ? Number(e.target.value) : null)}
                      className="border border-gray-200 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">自动（从家族祖先开始）</option>
                      {membersWithChildren
                        .filter(m => {
                          // 如果设置了家族姓氏，只显示同姓的成员
                          if (familySurname) {
                            // 检查姓氏字段或名字首字是否匹配
                            const memberSurname = m.surname || (m.name.length > 0 ? m.name[0] : '')
                            return memberSurname === familySurname
                          }
                          return true
                        })
                        .map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name} {m.generation ? `(第${m.generation}代)` : ''} {m.is_deceased ? '†' : ''}
                          </option>
                        ))}
                    </select>
                    {treeRootMemberId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setTreeRootMemberId(null)}
                        className="text-xs"
                      >
                        重置
                      </Button>
                    )}
                  </div>
                  <GenealogyTree
                    ref={treeRef}
                    members={members}
                    relations={relationsData?.data || []}
                    familyName={familyName}
                    familySurname={familySurname}
                    rootMemberId={treeRootMemberId}
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
                            <button
                              onClick={() => {
                                setTagToDelete(tag)
                                setIsDeleteTagOpen(true)
                              }}
                              className="ml-1 p-1 rounded hover:bg-black/10 transition-colors"
                              style={{ color: tag.color }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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
        fatherId={selectedFatherId}
        motherId={selectedMotherId}
        onFatherChange={(id) => setSelectedFatherId(id)}
        onMotherChange={(id) => setSelectedMotherId(id)}
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

      {/* Delete Tag Confirmation Dialog */}
      <Dialog open={isDeleteTagOpen} onOpenChange={setIsDeleteTagOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                <Trash2 className="w-4 h-4 text-red-600" />
              </div>
              删除标签
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-zinc-600">
              确定要删除标签 "<span className="font-medium" style={{ color: tagToDelete?.color }}>{tagToDelete?.name}</span>" 吗？
            </p>
            <p className="text-sm text-zinc-500 mt-2">删除后，该标签将从所有使用该标签的成员中移除。</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDeleteTagOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleDeleteTag}
              className="gap-2 bg-red-600 hover:bg-red-700"
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Result Dialog */}
      <Dialog open={isImportResultOpen} onOpenChange={setIsImportResultOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                <Upload className="w-4 h-4 text-green-600" />
              </div>
              导入结果
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {importResult && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-green-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-green-600">{importResult.imported}</p>
                    <p className="text-sm text-green-600">新增</p>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg text-center">
                    <p className="text-2xl font-bold text-blue-600">{importResult.updated}</p>
                    <p className="text-sm text-blue-600">更新</p>
                  </div>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-red-600">错误列表：</p>
                    <div className="max-h-40 overflow-y-auto bg-red-50 rounded-lg p-2 space-y-1">
                      {importResult.errors.map((error, i) => (
                        <p key={i} className="text-xs text-red-600">{error}</p>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsImportResultOpen(false)} className="bg-gray-900 hover:bg-gray-800">
              确定
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
    surname: '',
    gender: 'male',
    birth_date: undefined,
    death_date: undefined,
    is_deceased: undefined,
    birth_place: '',
    occupation: '',
    biography: '',
    remarkable_deeds: '',
    is_matrilocal: undefined,
    is_adopted_son: undefined,
  })

  // 当 initialData 变化时更新 form
  React.useEffect(() => {
    if (initialData) {
      setForm({
        name: initialData.name || '',
        surname: initialData.surname || '',
        gender: initialData.gender || 'male',
        birth_date: initialData.birth_date,
        death_date: initialData.death_date,
        is_deceased: initialData.is_deceased,
        birth_place: initialData.birth_place || '',
        occupation: initialData.occupation || '',
        biography: initialData.biography || '',
        remarkable_deeds: initialData.remarkable_deeds || '',
        is_matrilocal: initialData.is_matrilocal,
        is_adopted_son: initialData.is_adopted_son,
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
      is_matrilocal: undefined,
      is_adopted_son: undefined,
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
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <span className="text-red-500">*</span>姓氏
              </label>
              <Input
                value={form.surname || ''}
                onChange={(e) => handleChange('surname', e.target.value || undefined)}
                placeholder="如：贾"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <span className="text-red-500">*</span>名字
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
              onCheckedChange={(checked) => {
                handleChange('is_deceased', checked)
                // 如果设置为"在世"，清空逝世日期
                if (!checked) {
                  handleChange('death_date', undefined)
                }
              }}
            />
            <span className="text-sm text-zinc-600">
              {form.is_deceased ? '已离世' : '在世'}
            </span>
            <span className="text-xs text-zinc-400">（可手动切换，也可在逝世日期中填写自动确定）</span>
          </div>

          {/* 入赘/招夫养子 Toggle */}
          <div className="flex items-center gap-4 p-3 bg-zinc-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_matrilocal || false}
                onCheckedChange={(checked) => handleChange('is_matrilocal', checked)}
              />
              <span className="text-sm text-zinc-600">入赘</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_adopted_son || false}
                onCheckedChange={(checked) => handleChange('is_adopted_son', checked)}
              />
              <span className="text-sm text-zinc-600">招夫养子</span>
            </div>
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
