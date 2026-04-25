import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'
import type { Member, MemberRelation } from '@/api/client'
import { ChevronLeft, ChevronRight, Search, Users, Calendar, Home, Briefcase, Printer } from 'lucide-react'

interface MemberDirectoryProps {
  familySurname: string
  familyGenerationWords: string
  members: Member[]
  relations: MemberRelation[]
  onViewDetail?: (member: Member) => void
}

const PAGE_SIZE = 20

export function MemberDirectory({
  familySurname,
  familyGenerationWords,
  members,
  relations,
  onViewDetail,
}: MemberDirectoryProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [filterGender, setFilterGender] = useState<string>('')

  const generationWords = useMemo(() => {
    if (!familyGenerationWords) return []
    return familyGenerationWords.split(',').map(w => w.trim()).filter(Boolean)
  }, [familyGenerationWords])

  const isOwnFamily = (member: Member) => {
    if (!familySurname) return true
    if (!member.surname) return true
    return member.surname === familySurname
  }

  // 构建成员关系
  const memberRelations = useMemo(() => {
    const memberMap = new Map(members.map(m => [m.id, m]))
    const result = new Map<number, {
      father?: { id: number; name: string }
      mother?: { id: number; name: string }
      spouses: { id: number; name: string; tag?: string }[]
      children: { id: number; name: string }[]
    }>()

    members.forEach(member => {
      result.set(member.id, { father: undefined, mother: undefined, spouses: [], children: [] })
    })

    const parentRelations = relations.filter(r => r.relation_type === 'father' || r.relation_type === 'mother')
    const spouseRelations = relations.filter(r => r.relation_type === 'spouse')

    parentRelations.forEach(rel => {
      const entry = result.get(rel.from_member_id)
      if (!entry) return

      if (rel.relation_type === 'father') {
        const parent = memberMap.get(rel.to_member_id)
        if (parent) entry.father = { id: parent.id, name: parent.name }
      } else if (rel.relation_type === 'mother') {
        const parent = memberMap.get(rel.to_member_id)
        if (parent) entry.mother = { id: parent.id, name: parent.name }
      }
    })

    spouseRelations.forEach(rel => {
      if (rel.from_member_id === rel.to_member_id) return

      let memberId: number
      let spouseId: number

      if (rel.from_member_id < rel.to_member_id) {
        memberId = rel.from_member_id
        spouseId = rel.to_member_id
      } else {
        memberId = rel.to_member_id
        spouseId = rel.from_member_id
      }

      const member = memberMap.get(memberId)
      const spouse = memberMap.get(spouseId)
      if (!member || !spouse) return

      const memberEntry = result.get(memberId)
      if (!memberEntry) return

      if (!memberEntry.spouses.find(s => s.id === spouseId)) {
        memberEntry.spouses.push({
          id: spouseId,
          name: spouse.name,
          tag: rel.tag_name
        })
      }
    })

    parentRelations.forEach(rel => {
      if (rel.relation_type === 'father' || rel.relation_type === 'mother') {
        const entry = result.get(rel.to_member_id)
        if (!entry) return
        const child = memberMap.get(rel.from_member_id)
        if (child && !entry.children.find(c => c.id === child.id)) {
          entry.children.push({ id: child.id, name: child.name })
        }
      }
    })

    return result
  }, [members, relations])

  // 按代数分组
  const membersByGeneration = useMemo(() => {
    const ownMembers = members.filter(m => isOwnFamily(m))
    const memberMap = new Map(members.map(m => [m.id, m]))
    const relMap = memberRelations

    const getGeneration = (memberId: number): number => {
      const member = memberMap.get(memberId)
      if (member?.generation) {
        const genNum = parseInt(member.generation, 10)
        if (!isNaN(genNum) && genNum > 0) return genNum
      }

      const getAncestors = (mid: number, depth: number): number => {
        const r = relMap.get(mid)
        if (!r?.father) return depth
        return getAncestors(r.father.id, depth + 1)
      }

      return getAncestors(memberId, 1)
    }

    const byGen = new Map<number, typeof ownMembers>()
    ownMembers.forEach(m => {
      const gen = getGeneration(m.id)
      if (!byGen.has(gen)) byGen.set(gen, [])
      byGen.get(gen)!.push(m)
    })

    const sortedGens = Array.from(byGen.keys()).sort((a, b) => a - b)
    return sortedGens.map(gen => ({
      generation: gen,
      label: generationWords[gen - 1] || `第${gen}代`,
      members: byGen.get(gen)!.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    }))
  }, [members, relations, isOwnFamily, memberRelations, generationWords])

  // 过滤和搜索
  const filteredMembers = useMemo(() => {
    let result = members.filter(m => isOwnFamily(m))

    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase()
      result = result.filter(m =>
        m.name.toLowerCase().includes(keyword) ||
        m.surname?.toLowerCase().includes(keyword) ||
        m.occupation?.toLowerCase().includes(keyword) ||
        m.birth_place?.toLowerCase().includes(keyword)
      )
    }

    if (filterGender) {
      result = result.filter(m => m.gender === filterGender)
    }

    // 按 weight 排序
    return result.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
  }, [members, searchKeyword, filterGender, isOwnFamily])

  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE))

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-amber-50 to-orange-50">
      {/* 顶部工具栏 */}
      <div className="shrink-0 p-4 bg-white border-b">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <Input
                placeholder="搜索成员姓名、职业、籍贯..."
                value={searchKeyword}
                onChange={(e) => {
                  setSearchKeyword(e.target.value)
                  setCurrentPage(1)
                }}
                className="pl-9"
              />
            </div>
            <select
              value={filterGender}
              onChange={(e) => {
                setFilterGender(e.target.value)
                setCurrentPage(1)
              }}
              className="h-10 px-3 rounded-md border border-input bg-white text-sm"
            >
              <option value="">全部性别</option>
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-600">
              共 {filteredMembers.length} 人
            </span>
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1">
              <Printer className="w-4 h-4" />
              打印
            </Button>
          </div>
        </div>
      </div>

      {/* 成员列表 */}
      <div className="flex-1 overflow-auto p-4">
        {/* 按代数分组显示 */}
        <div className="space-y-6">
          {membersByGeneration.map(({ generation, label, members: genMembers }) => {
            const filteredGenMembers = genMembers.filter(m =>
              filteredMembers.some(fm => fm.id === m.id)
            )
            if (filteredGenMembers.length === 0) return null

            return (
              <div key={generation}>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-400">
                    {label}
                  </Badge>
                  <span className="text-sm text-amber-600">{filteredGenMembers.length} 人</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredGenMembers.map(member => {
                    const rels = memberRelations.get(member.id)
                    const spouseInfo = rels?.spouses || []
                    const childrenCount = rels?.children?.length || 0

                    return (
                      <Card
                        key={member.id}
                        className="cursor-pointer hover:shadow-lg hover:border-amber-400 transition-all bg-gradient-to-br from-white to-amber-50 border-amber-200"
                        onClick={() => onViewDetail?.(member)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            {/* 照片 */}
                            <div className="w-16 h-16 rounded-full border-2 border-amber-300 bg-gradient-to-br from-amber-100 to-orange-100 overflow-hidden flex-shrink-0">
                              <Avatar
                                src={member.photo_path ? `/api/photos/${member.photo_path.split('/').pop()}` : undefined}
                                fallback={member.name}
                                size="lg"
                                gender={member.gender as "male" | "female"}
                              />
                            </div>

                            {/* 信息 */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-amber-900 truncate">{member.name}</h3>
                                {member.is_deceased && (
                                  <span className="text-xs text-zinc-400">（故）</span>
                                )}
                              </div>

                              <div className="mt-1 space-y-1">
                                {member.birth_date && (
                                  <div className="flex items-center gap-1 text-xs text-zinc-600">
                                    <Calendar className="w-3 h-3" />
                                    <span>{member.birth_date}{member.death_date ? ` ～ ${member.death_date}` : ''}</span>
                                  </div>
                                )}
                                {member.occupation && (
                                  <div className="flex items-center gap-1 text-xs text-zinc-600">
                                    <Briefcase className="w-3 h-3" />
                                    <span className="truncate">{member.occupation}</span>
                                  </div>
                                )}
                                {member.birth_place && (
                                  <div className="flex items-center gap-1 text-xs text-zinc-600">
                                    <Home className="w-3 h-3" />
                                    <span className="truncate">{member.birth_place}</span>
                                  </div>
                                )}
                              </div>

                              {/* 关系信息 */}
                              <div className="mt-2 flex items-center gap-2 text-xs">
                                {spouseInfo.length > 0 && (
                                  <span className="text-amber-600">
                                    配 {spouseInfo.map(s => s.name).join('、')}
                                  </span>
                                )}
                                {childrenCount > 0 && (
                                  <span className="text-amber-600">
                                    子女 {childrenCount} 人
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {filteredMembers.length === 0 && (
            <div className="text-center py-12 text-amber-600">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>暂无符合条件的成员</p>
            </div>
          )}
        </div>
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="shrink-0 flex items-center justify-between p-4 bg-white border-t">
          <span className="text-sm text-zinc-600">
            第 {currentPage} / {totalPages} 页，共 {filteredMembers.length} 人
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="gap-1"
            >
              下一页
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          button { display: none !important; }
          .border-b { border: none !important; }
          .bg-white { background: white !important; }
        }
      `}</style>
    </div>
  )
}