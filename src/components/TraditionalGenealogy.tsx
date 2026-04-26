import { useMemo, useRef, useState, useEffect } from 'react'
import { Printer, ChevronRight, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Member, MemberRelation } from '@/api/client'

interface TraditionalGenealogyProps {
  familyName: string
  familySurname: string
  familyOrigin: string
  familyMaxim: string
  familyGenerationWords: string
  members: Member[]
  relations: MemberRelation[]
}

// 家庭成员节点
interface FamilyNode {
  member: Member
  spouse?: string
  spouseTag?: string
  children: FamilyNode[]
}

export function TraditionalGenealogy({
  familyName,
  familySurname,
  familyOrigin,
  familyMaxim,
  familyGenerationWords,
  members,
  relations,
}: TraditionalGenealogyProps) {
  const printRef = useRef<HTMLDivElement>(null)

  // 展开状态管理
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

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

  // 构建家族树
  const buildFamilyTree = useMemo(() => {
    const ownMembers = members.filter(m => isOwnFamily(m))
    const ownMemberIds = new Set(ownMembers.map(m => m.id))
    const relMap = memberRelations

    const buildNode = (memberId: number): FamilyNode | null => {
      const member = members.find(m => m.id === memberId)
      if (!member) return null

      const rels = relMap.get(memberId)
      if (!rels) return null

      const firstSpouse = rels.spouses && rels.spouses.length > 0 ? rels.spouses[0] : undefined

      const children = rels.children
        .filter(child => ownMemberIds.has(child.id))
        .map(child => {
          const childNode = buildNode(child.id)
          return childNode
        })
        .filter((node): node is FamilyNode => node !== null)
        .sort((a, b) => ((a.member.weight ?? 0) - (b.member.weight ?? 0)))

      return {
        member,
        spouse: firstSpouse?.name,
        spouseTag: firstSpouse?.tag,
        children
      }
    }

    const rootMembers = ownMembers.filter(member => {
      const rels = relMap.get(member.id)
      return !rels?.father && !rels?.mother
    })

    rootMembers.sort((a, b) => ((b.weight ?? 0) - (a.weight ?? 0)))

    const forest = rootMembers
      .map(member => buildNode(member.id))
      .filter((node): node is FamilyNode => node !== null)

    return forest
  }, [members, relations, isOwnFamily, memberRelations])

  // 初始化展开状态（全部展开）- 使用 useRef 跟踪是否已初始化
  const initExpanded = useRef(false)
  useEffect(() => {
    if (initExpanded.current) return
    initExpanded.current = true

    const allIds = new Set<number>()
    const collectIds = (nodes: FamilyNode[]) => {
      nodes.forEach(node => {
        allIds.add(node.member.id)
        if (node.children.length > 0) {
          collectIds(node.children)
        }
      })
    }
    collectIds(buildFamilyTree)
    setExpandedIds(allIds)
  }, [buildFamilyTree])

  // 切换展开/收缩
  const toggleExpand = (memberId: number) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(memberId)) {
        newSet.delete(memberId)
      } else {
        newSet.add(memberId)
      }
      return newSet
    })
  }

  // 获取字辈标签
  const getGenerationLabel = (member: Member) => {
    if (member.generation && generationWords.includes(member.generation)) {
      return member.generation
    }
    if (member.generation) {
      return member.generation
    }
    return ''
  }

  // 递归渲染家庭节点
  const renderFamilyNode = (node: FamilyNode, depth: number = 0) => {
    const genLabel = getGenerationLabel(node.member)
    const isExpanded = expandedIds.has(node.member.id)
    const hasChildren = node.children.length > 0

    return (
      <div key={node.member.id} className="family-node">
        {/* 主成员行 */}
        <div
          className="flex items-center gap-1 py-1 hover:bg-amber-100/50 cursor-pointer rounded px-1"
          onClick={() => hasChildren && toggleExpand(node.member.id)}
        >
          {/* 展开/收缩按钮 */}
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
            )
          ) : (
            <span className="w-4 shrink-0" />
          )}

          {genLabel && (
            <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-800 text-xs font-bold border border-amber-300">
              {genLabel}
            </span>
          )}
          <span className="font-bold text-zinc-800">
            {node.member.name}
          </span>
          <span className="text-zinc-500 text-xs">
            {node.member.gender === 'male' ? '男' : '女'}
            {node.member.is_deceased && '(殁)'}
          </span>
          {node.member.birth_date && (
            <span className="text-zinc-400 text-xs">
              {node.member.birth_date}
            </span>
          )}
          {node.spouse && (
            <span className="text-zinc-500 text-xs">
              配{node.spouse}
            </span>
          )}
          {node.member.remarkable_deeds && (
            <span className="text-amber-600 text-[10px]">
              ★{node.member.remarkable_deeds.substring(0, 15)}
            </span>
          )}
        </div>

        {/* 递归渲染子女 */}
        {hasChildren && isExpanded && (
          <div className="children-section pl-4 ml-2 border-l border-amber-200">
            {node.children.map(child => renderFamilyNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  // 展开/收缩全部
  const expandAll = () => {
    const allIds = new Set<number>()
    const collectIds = (nodes: FamilyNode[]) => {
      nodes.forEach(node => {
        allIds.add(node.member.id)
        if (node.children.length > 0) {
          collectIds(node.children)
        }
      })
    }
    collectIds(buildFamilyTree)
    setExpandedIds(allIds)
  }

  const collapseAll = () => {
    setExpandedIds(new Set())
  }

  const totalCount = members.length

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="h-full flex flex-col bg-zinc-100">
      {/* 工具栏 */}
      <div className="shrink-0 flex items-center justify-between p-4 border-b bg-white">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">祖谱导航</h2>
          <p className="text-sm text-zinc-500">家族导航，展开收缩查看</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={expandAll} className="gap-1">
            全部展开
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll} className="gap-1">
            全部收缩
          </Button>
          <Button onClick={handlePrint} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Printer className="w-4 h-4" />
            打印祖谱
          </Button>
        </div>
      </div>

      {/* 未配置家族姓氏警告 */}
      {!familySurname && (
        <div className="shrink-0 mx-4 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-700">
            <span className="font-medium">提示：</span>请先在「祖谱信息」中配置家族姓氏，避免有零散的成员展示。
          </p>
        </div>
      )}

      {/* 祖谱内容 - 竖排古籍样式 */}
      <div className="flex-1 overflow-auto p-4">
        <div
          ref={printRef}
          className="genealogy-book bg-amber-50 w-[210mm] min-h-[297mm] mx-auto shadow-xl border border-amber-200 relative overflow-hidden"
          style={{ padding: '15mm 20mm' }}
        >
          {/* 装饰边框 */}
          <div className="absolute inset-2 border border-amber-300 pointer-events-none" />
          <div className="absolute inset-[6mm] border border-amber-200 pointer-events-none" />

          {/* 标题区域 */}
          <div className="text-center mb-6">
            <div className="inline-block">
              <h1 className="text-3xl font-bold text-zinc-800 tracking-widest relative">
                {familyName || '某某家族'}
                <span className="text-xl ml-2">祖谱</span>
              </h1>
              <div className="h-px bg-zinc-400 mt-2 mx-auto w-32" />
            </div>
            <p className="text-sm text-zinc-600 mt-2 tracking-wider">
              {familyOrigin || '源远流长  瓜瓞延绵'}
            </p>
          </div>

          {/* 世系表 - 递归家庭单元样式 */}
          <div className="genealogy-chart space-y-3">
            {buildFamilyTree.map(rootNode => renderFamilyNode(rootNode, 0))}
          </div>

          {/* 结尾 */}
          <div className="absolute bottom-8 left-0 right-0 text-center">
            <p className="text-xs text-zinc-500 tracking-wider">
              {familyMaxim || '传承家族文化  弘扬优良家风'}
            </p>
            <p className="text-[10px] text-zinc-400 mt-1">
              共录 {totalCount} 名族人
            </p>
          </div>

          {/* 页码装饰 */}
          <div className="absolute bottom-4 right-6 text-[10px] text-zinc-400">
            第壹页
          </div>
        </div>
      </div>

      {/* 打印样式 */}
      <style>{`
        @page {
          size: A4;
          margin: 0;
        }
        @media print {
          body {
            margin: 0;
            padding: 0;
          }
          .genealogy-book {
            width: 100% !important;
            min-height: auto !important;
            box-shadow: none !important;
            border: none !important;
            padding: 10mm 15mm !important;
            background: white !important;
          }
          .family-node {
            page-break-inside: avoid;
          }
          .children-section {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  )
}
