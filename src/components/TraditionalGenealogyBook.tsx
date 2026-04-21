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

interface MemberEntry {
  member: Member
  generation: number  // 第几代
  rels: any
}

// 每页显示的条目数
const ENTRIES_PER_PAGE = 8

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

  // 获取配置的字辈
  const generationWords = useMemo(() => {
    if (!familyGenerationWords) return []
    return familyGenerationWords.split(',').map(w => w.trim()).filter(Boolean)
  }, [familyGenerationWords])

  // 判断是否是本家族成员（同姓）
  const isOwnFamily = (member: Member) => {
    if (!familySurname) return true
    if (!member.surname) return true
    return member.surname === familySurname
  }

  // 构建成员关系映射
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

  // 构建牒记式条目列表（按世系排序）
  const diejiEntries = useMemo(() => {
    const ownMembers = members.filter(m => isOwnFamily(m))
    const relMap = memberRelations

    // 找到所有根成员（没有父亲或母亲的）
    const rootCandidates = ownMembers.filter(member => {
      const rels = relMap.get(member.id)
      return !rels?.father && !rels?.mother
    })

    // 按weight降序排序
    rootCandidates.sort((a, b) => ((b.weight ?? 0) - (a.weight ?? 0)))

    const entries: MemberEntry[] = []

    // 递归收集成员及其所有后代，generation从1开始
    const collectDescendants = (memberId: number, generation: number) => {
      const member = members.find(m => m.id === memberId)
      if (!member) return

      const rels = relMap.get(memberId)
      entries.push({ member, generation, rels })

      // 处理子嗣（只处理本家族的）
      const ownMemberIds = new Set(ownMembers.map(m => m.id))
      const children = rels?.children?.filter(c => ownMemberIds.has(c.id)) || []
      children.sort((a, b) => {
        const ma = members.find(m => m.id === a.id)
        const mb = members.find(m => m.id === b.id)
        return ((mb?.weight ?? 0) - (ma?.weight ?? 0))
      })

      for (const child of children) {
        collectDescendants(child.id, generation + 1)
      }
    }

    // 从每个根成员开始收集，第一代为1
    for (const root of rootCandidates) {
      collectDescendants(root.id, 1)
    }

    return entries
  }, [members, relations, isOwnFamily, memberRelations])

  // 分页计算
  const totalPages = Math.ceil(diejiEntries.length / ENTRIES_PER_PAGE) || 1
  const paginatedEntries = useMemo(() => {
    const start = (currentPage - 1) * ENTRIES_PER_PAGE
    return diejiEntries.slice(start, start + ENTRIES_PER_PAGE)
  }, [diejiEntries, currentPage])

  // 获取辈字标签
  const getGenerationLabel = (member: Member) => {
    if (member.generation && generationWords.includes(member.generation)) {
      return member.generation
    }
    if (member.generation) {
      return member.generation
    }
    return ''
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
    const chineseNums = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾']
    if (num === 0) return '零'
    if (num <= 10) return chineseNums[num]
    if (num < 100) {
      const tens = Math.floor(num / 10)
      const ones = num % 10
      return chineseNums[tens] + '拾' + (ones > 0 ? chineseNums[ones] : '')
    }
    return num.toString()
  }

  return (
    <div className="h-full flex flex-col bg-zinc-100">
      {/* 工具栏 */}
      <div className="shrink-0 flex items-center justify-between p-4 border-b bg-white">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">传统祖谱</h2>
          <p className="text-sm text-zinc-500">牒记式族谱，文字表述世代关系</p>
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

      {/* 祖谱内容 */}
      <div className="flex-1 overflow-auto p-4">
        <div
          className="dieji-book bg-amber-50 w-[210mm] min-h-[297mm] mx-auto shadow-xl border border-amber-300 relative overflow-hidden"
          style={{ padding: '12mm 18mm' }}
        >
          {/* 装饰边框 */}
          <div className="absolute inset-1 border-2 border-amber-400 pointer-events-none" />
          <div className="absolute inset-[6mm] border border-amber-300 pointer-events-none" />

          {/* 标题 */}
          <div className="text-center mb-4 pt-2">
            <h1 className="text-3xl font-bold text-zinc-800 tracking-widest">
              {familyName || '某某家族'}
              <span className="text-xl ml-2">牒</span>
            </h1>
            <div className="h-px bg-amber-400 mt-1 mx-auto w-40" />
            <p className="text-xs text-zinc-600 mt-1 tracking-wider">{familyOrigin || '源远流长'}</p>
          </div>

          {/* 牒记式内容 - 每位成员一个条目块 */}
          <div className="space-y-3">
            {paginatedEntries.map((entry) => {
              const { member, generation, rels } = entry
              const genLabel = getGenerationLabel(member)
              const spouses = rels?.spouses || []
              const children = rels?.children || []

              return (
                <div
                  key={member.id}
                  className="dieji-entry border border-amber-200 p-3 bg-white/50 hover:bg-amber-100/30"
                >
                  {/* 序号和名字行 */}
                  <div className="flex items-baseline mb-1">
                    <span className="text-amber-600 text-xs mr-2">第{toChineseNum(generation)}代</span>
                    {genLabel && (
                      <span className="inline-block px-1 py-0.5 bg-amber-100 text-amber-800 text-xs border border-amber-300 mr-2">
                        {genLabel}
                      </span>
                    )}
                    <span className="font-bold text-zinc-800 text-lg">{member.name}</span>
                    <span className="text-zinc-500 text-xs ml-2">
                      {member.gender === 'male' ? '男' : '女'}
                    </span>
                    {member.is_deceased && (
                      <span className="text-zinc-400 text-xs ml-2">（殁）</span>
                    )}
                  </div>

                  {/* 详细信息 */}
                  <div className="text-xs text-zinc-600 pl-8 space-y-0.5">
                    {/* 生卒日期 */}
                    <div>
                      <span className="text-zinc-400">生：</span>
                      {member.birth_date || '不详'}
                      {member.death_date && (
                        <>
                          <span className="text-zinc-400 ml-4">卒：</span>
                          {member.death_date}
                        </>
                      )}
                    </div>

                    {/* 配偶 */}
                    {spouses.length > 0 && (
                      <div>
                        <span className="text-zinc-400">配：</span>
                        {spouses.map((s: { name: string; tag?: string }, i: number) => (
                          <span key={i}>
                            {s.tag && <span className="text-amber-600">{s.tag}</span>}
                            {s.name}
                            {i < spouses.length - 1 ? '、' : ''}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* 子女 */}
                    {children.length > 0 && (
                      <div>
                        <span className="text-zinc-400">子：</span>
                        {children.map((c: { name: string }, i: number) => (
                          <span key={i}>{c.name}{i < children.length - 1 ? '、' : ''}</span>
                        ))}
                      </div>
                    )}

                    {/* 籍贯 */}
                    {member.birth_place && (
                      <div>
                        <span className="text-zinc-400">籍贯：</span>
                        {member.birth_place}
                      </div>
                    )}

                    {/* 职业 */}
                    {member.occupation && (
                      <div>
                        <span className="text-zinc-400">职业：</span>
                        {member.occupation}
                      </div>
                    )}

                    {/* 生平简介 */}
                    {member.biography && (
                      <div className="text-zinc-500 italic">
                        {member.biography}
                      </div>
                    )}

                    {/* 突出事迹 */}
                    {member.remarkable_deeds && (
                      <div className="text-amber-700">
                        <span className="text-zinc-400">功绩：</span>
                        {member.remarkable_deeds}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 空白填充 */}
          {paginatedEntries.length < ENTRIES_PER_PAGE &&
            Array.from({ length: ENTRIES_PER_PAGE - paginatedEntries.length }).map((_, idx) => (
              <div key={`empty-${idx}`} className="dieji-entry border border-dashed border-amber-100 p-3 h-24">
                <div className="text-zinc-100 text-center pt-8">—</div>
              </div>
            ))
          }

          {/* 结尾 */}
          <div className="absolute bottom-10 left-0 right-0 text-center">
            <p className="text-xs text-zinc-500 tracking-wider">
              {familyMaxim || '传承家族文化  弘扬优良家风'}
            </p>
            <p className="text-[10px] text-zinc-400 mt-0.5">
              共录 {diejiEntries.length} 名族人
            </p>
          </div>

          {/* 页码 */}
          <div className="absolute bottom-6 right-8 text-xs text-zinc-400">
            第{toChineseNum(currentPage)}页
          </div>

          {/* 装饰角 */}
          <div className="absolute top-3 left-3 w-6 h-6 border-t border-l border-amber-400" />
          <div className="absolute top-3 right-3 w-6 h-6 border-t border-r border-amber-400" />
          <div className="absolute bottom-3 left-3 w-6 h-6 border-b border-l border-amber-400" />
          <div className="absolute bottom-3 right-3 w-6 h-6 border-b border-r border-amber-400" />
        </div>
      </div>

      {/* 打印样式 */}
      <style>{`
        @page {
          size: A4;
          margin: 0;
        }
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
          .dieji-entry {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  )
}