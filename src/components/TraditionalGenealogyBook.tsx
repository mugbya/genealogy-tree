import { useMemo, useState } from 'react'
import { Printer, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Member, MemberRelation } from '@/api/client'

interface TraditionalGenealogyBookProps {
  familyName: string
  familySurname: string
  familyOrigin: string
  familyMaxim: string
  familyGenerationWords: string
  members: Member[]
  relations: MemberRelation[]
}

interface FamilyUnit {
  father?: { id: number; name: string; generation?: string; gender?: string; birth_date?: string; death_date?: string; biography?: string; remarkable_deeds?: string }
  mother?: { id: number; name: string; tag?: string }
  children: { id: number; name: string; generation?: string; gender?: string; birth_date?: string; death_date?: string; is_deceased?: boolean }[]
  generation: number
}

const ENTRIES_PER_PAGE = 6

export function TraditionalGenealogyBook({
  familyName,
  familySurname,
  familyOrigin,
  familyMaxim,
  familyGenerationWords,
  members,
  relations,
}: TraditionalGenealogyBookProps) {
  const [currentPage, setCurrentPage] = useState(1)

  const generationWords = useMemo(() => {
    if (!familyGenerationWords) return []
    return familyGenerationWords.split(',').map(w => w.trim()).filter(Boolean)
  }, [familyGenerationWords])

  const isOwnFamily = (member: Member) => {
    if (!familySurname) return true
    if (!member.surname) return true
    return member.surname === familySurname
  }

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

  // 按家庭分组
  const familyUnits = useMemo(() => {
    const ownMembers = members.filter(m => isOwnFamily(m))
    const relMap = memberRelations
    const ownMemberIds = new Set(ownMembers.map(m => m.id))
    const memberMap = new Map(members.map(m => [m.id, m]))

    // 找到所有独立家庭（男性为户主）
    const maleMembers = ownMembers.filter(m => m.gender === 'male')
    const processed = new Set<number>()
    const units: FamilyUnit[] = []

    // 递归获取子女
    const getChildren = (memberId: number): { id: number; name: string }[] => {
      const rels = relMap.get(memberId)
      if (!rels) return []
      const ownChildren = rels.children.filter(c => ownMemberIds.has(c.id))
      return ownChildren.sort((a, b) => {
        const ma = memberMap.get(a.id)
        const mb = memberMap.get(b.id)
        return ((mb?.weight ?? 0) - (ma?.weight ?? 0))
      })
    }

    // 判断代数：从祖先到现在有多少代
    const getGeneration = (memberId: number): number => {
      const member = memberMap.get(memberId)
      // 如果成员有generation字段，直接使用
      if (member?.generation) {
        const genNum = parseInt(member.generation, 10)
        if (!isNaN(genNum) && genNum > 0) return genNum
      }

      // 否则通过祖先链计算
      const getAncestors = (mid: number, depth: number): number => {
        const r = relMap.get(mid)
        if (!r?.father) return depth
        return getAncestors(r.father.id, depth + 1)
      }

      return getAncestors(memberId, 1)
    }

    // 按代数分组男性成员
    const byGeneration = new Map<number, typeof maleMembers>()
    maleMembers.forEach(m => {
      const gen = getGeneration(m.id)
      if (!byGeneration.has(gen)) byGeneration.set(gen, [])
      byGeneration.get(gen)!.push(m)
    })

    // 按代数排序，从最早开始
    const sortedGens = Array.from(byGeneration.keys()).sort((a, b) => a - b)

    sortedGens.forEach(gen => {
      const genMembers = byGeneration.get(gen) || []
      // 按weight排序
      genMembers.sort((a, b) => ((b.weight ?? 0) - (a.weight ?? 0)))

      genMembers.forEach(male => {
        if (processed.has(male.id)) return

        const rels = relMap.get(male.id)
        if (!rels) return

        const children = getChildren(male.id)
        const firstSpouse = rels.spouses[0]

        const unit: FamilyUnit = {
          father: {
            id: male.id,
            name: male.name,
            generation: male.generation ?? undefined,
            gender: male.gender,
            birth_date: male.birth_date ?? undefined,
            death_date: male.death_date ?? undefined,
            biography: male.biography ?? undefined,
            remarkable_deeds: male.remarkable_deeds ?? undefined
          },
          children: children.map(c => {
            const cm = memberMap.get(c.id)!
            return {
              id: c.id,
              name: c.name,
              generation: cm.generation ?? undefined,
              gender: cm.gender,
              birth_date: cm.birth_date ?? undefined,
              death_date: cm.death_date ?? undefined,
              is_deceased: cm.is_deceased
            }
          }),
          generation: gen
        }

        if (firstSpouse) {
          const spouseMember = memberMap.get(firstSpouse.id)
          if (spouseMember) {
            unit.mother = {
              id: spouseMember.id,
              name: spouseMember.name,
              tag: firstSpouse.tag ?? undefined
            }
          }
        }

        // 标记所有子女已处理
        children.forEach(c => processed.add(c.id))
        processed.add(male.id)

        units.push(unit)
      })
    })

    return units
  }, [members, relations, isOwnFamily, memberRelations])

  const totalPages = Math.ceil(familyUnits.length / ENTRIES_PER_PAGE) || 1
  const paginatedUnits = useMemo(() => {
    const start = (currentPage - 1) * ENTRIES_PER_PAGE
    return familyUnits.slice(start, start + ENTRIES_PER_PAGE)
  }, [familyUnits, currentPage])

  const getGenerationLabel = (gen?: string) => {
    if (!gen) return ''
    if (generationWords.includes(gen)) return gen
    return gen
  }

  const prevPage = () => {
    if (currentPage > 1) setCurrentPage(p => p - 1)
  }

  const nextPage = () => {
    if (currentPage < totalPages) setCurrentPage(p => p + 1)
  }

  const handlePrint = () => {
    window.print()
  }

  const toChineseNum = (num: number): string => {
    if (num <= 10) return ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾'][num]
    if (num < 100) {
      const tens = Math.floor(num / 10)
      const ones = num % 10
      return (tens > 1 ? ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'][tens] + '拾' : '拾') + (ones > 0 ? ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'][ones] : '')
    }
    return num.toString()
  }

  return (
    <div className="h-full flex flex-col bg-zinc-100">
      <div className="shrink-0 flex items-center justify-between p-4 border-b bg-white">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">传统祖谱</h2>
          <p className="text-sm text-zinc-500">牒记式族谱，按家庭分列</p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex items-center gap-2 mr-4">
            <Button variant="outline" size="sm" onClick={prevPage} disabled={currentPage <= 1} className="gap-1">
              <ChevronLeft className="w-4 h-4" />上一页
            </Button>
            <span className="text-sm text-zinc-600">第 {currentPage} / {totalPages} 页</span>
            <Button variant="outline" size="sm" onClick={nextPage} disabled={currentPage >= totalPages} className="gap-1">
              下一页<ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <Button onClick={handlePrint} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Printer className="w-4 h-4" />打印祖谱
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div
          className="dieji-book bg-amber-50 w-[210mm] min-h-[297mm] mx-auto shadow-xl border border-amber-300 relative overflow-hidden"
          style={{ padding: '12mm 18mm' }}
        >
          <div className="absolute inset-1 border-2 border-amber-400 pointer-events-none" />
          <div className="absolute inset-[6mm] border border-amber-300 pointer-events-none" />

          {/* 标题 */}
          <div className="text-center mb-4 pt-2">
            <h1 className="text-3xl font-bold text-zinc-800 tracking-widest">
              {familyName || '某某家族'}<span className="text-xl ml-2">牒</span>
            </h1>
            <div className="h-px bg-amber-400 mt-1 mx-auto w-40" />
            <p className="text-xs text-zinc-600 mt-1 tracking-wider">{familyOrigin || '源远流长'}</p>
          </div>

          {/* 家庭单元列表 */}
          <div className="space-y-4">
            {paginatedUnits.map((unit, idx) => {
              const genLabel = getGenerationLabel(unit.father?.generation)

              return (
                <div
                  key={unit.father?.id || idx}
                  className="family-unit border border-amber-200 bg-white/60 p-3"
                >
                  {/* 第几代 */}
                  <div className="text-amber-600 text-xs mb-2 font-bold">
                    第{toChineseNum(unit.generation)}代
                  </div>

                  {/* 父母行 */}
                  <div className="flex items-baseline gap-2 mb-2">
                    {genLabel && (
                      <span className="inline-block px-1 py-0.5 bg-amber-100 text-amber-800 text-xs border border-amber-300">
                        {genLabel}
                      </span>
                    )}
                    <span className="font-bold text-zinc-800 text-base">{unit.father?.name}</span>
                    <span className="text-zinc-500 text-xs">
                      {unit.father?.gender === 'male' ? '男' : '女'}
                    </span>
                    {unit.father?.death_date && (
                      <span className="text-zinc-400 text-xs">（殁）</span>
                    )}
                    {unit.mother && (
                      <>
                        <span className="text-zinc-400">配</span>
                        {unit.mother.tag && (
                          <span className="text-amber-600 text-xs">{unit.mother.tag}</span>
                        )}
                        <span className="text-zinc-700">{unit.mother.name}</span>
                      </>
                    )}
                  </div>

                  {/* 父母详细信息 */}
                  <div className="text-xs text-zinc-600 pl-8 mb-2 space-y-0.5">
                    {unit.father?.birth_date && (
                      <div>生：{unit.father.birth_date} {unit.father.death_date ? `～ ${unit.father.death_date}` : ''}</div>
                    )}
                    {unit.father?.biography && (
                      <div className="text-zinc-500 italic">{unit.father.biography}</div>
                    )}
                    {unit.father?.remarkable_deeds && (
                      <div className="text-amber-700">功：{unit.father.remarkable_deeds}</div>
                    )}
                  </div>

                  {/* 子女行 */}
                  {unit.children.length > 0 && (
                    <div className="pl-8 text-sm">
                      <span className="text-zinc-500 text-xs">子：</span>
                      {unit.children.map((child, i) => (
                        <span key={child.id} className="text-zinc-700">
                          {child.name}
                          {child.gender === 'male' ? '' : ''}
                          {child.is_deceased && <span className="text-zinc-400">*</span>}
                          {i < unit.children.length - 1 ? '、' : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* 空白填充 */}
            {paginatedUnits.length < ENTRIES_PER_PAGE &&
              Array.from({ length: ENTRIES_PER_PAGE - paginatedUnits.length }).map((_, idx) => (
                <div key={`empty-${idx}`} className="family-unit border border-dashed border-amber-100 p-3 h-32">
                  <div className="text-zinc-100 text-center pt-12">—</div>
                </div>
              ))
            }
          </div>

          {/* 结尾 */}
          <div className="absolute bottom-10 left-0 right-0 text-center">
            <p className="text-xs text-zinc-500 tracking-wider">{familyMaxim || '传承家族文化  弘扬优良家风'}</p>
            <p className="text-[10px] text-zinc-400 mt-0.5">共录 {familyUnits.length} 房</p>
          </div>

          <div className="absolute bottom-6 right-8 text-xs text-zinc-400">
            第{toChineseNum(currentPage)}页
          </div>

          <div className="absolute top-3 left-3 w-6 h-6 border-t border-l border-amber-400" />
          <div className="absolute top-3 right-3 w-6 h-6 border-t border-r border-amber-400" />
          <div className="absolute bottom-3 left-3 w-6 h-6 border-b border-l border-amber-400" />
          <div className="absolute bottom-3 right-3 w-6 h-6 border-b border-r border-amber-400" />
        </div>
      </div>

      <style>{`
        @page { size: A4; margin: 0; }
        @media print {
          body { margin: 0; padding: 0; }
          .dieji-book {
            width: 100% !important;
            min-height: auto !important;
            box-shadow: none !important;
            border: none !important;
            padding: 8mm 12mm !important;
            background: white !important;
          }
          .family-unit { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  )
}