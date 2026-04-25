import { useMemo, useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import type { Member, MemberRelation } from '@/api/client'
import { Users, BookOpen, Award, Briefcase, Home, Calendar, ArrowLeft, Download, Loader2 } from 'lucide-react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

interface ModernGenealogyBookProps {
  familyName: string
  familySurname: string
  familyOrigin: string
  familyMaxim: string
  familyGenerationWords: string
  members: Member[]
  relations: MemberRelation[]
}

type ViewState = 'cover' | 'toc' | 'detail'

const MEMBERS_PER_PAGE = 12 // 每页12人

export function ModernGenealogyBook({
  familyName,
  familySurname,
  familyOrigin,
  familyMaxim,
  familyGenerationWords,
  members,
  relations,
}: ModernGenealogyBookProps) {
  const [view, setView] = useState<ViewState>('cover')
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const coverRef = useRef<HTMLDivElement>(null)
  const tocRef = useRef<HTMLDivElement>(null)

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
      members: byGen.get(gen)!.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    }))
  }, [members, relations, isOwnFamily, memberRelations])

  // 全部族人按页码排列
  const allMembersSorted = useMemo(() => {
    return members
      .filter(m => isOwnFamily(m))
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
  }, [members, isOwnFamily])

  // 计算每个成员的页码
  const memberPageMap = useMemo(() => {
    const map = new Map<number, number>()
    allMembersSorted.forEach((member, index) => {
      map.set(member.id, Math.floor(index / MEMBERS_PER_PAGE) + 1)
    })
    return map
  }, [allMembersSorted])

  const totalPages = Math.ceil(allMembersSorted.length / MEMBERS_PER_PAGE) || 1

  const handleViewDetail = (member: Member) => {
    setSelectedMember(member)
    setView('detail')
  }

  const handleEnterToc = () => {
    setView('toc')
  }

  const handleExportPdf = async () => {
    setIsExporting(true)
    try {
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()

      // 深度清理函数 - 移除所有可能含oklch的样式
      const deepCleanElement = (el: HTMLElement) => {
        // 移除所有类名
        el.removeAttribute('class')
        // 重置内联背景
        el.style.background = ''
        el.style.backgroundColor = ''
        // 递归处理子元素
        Array.from(el.children).forEach(child => deepCleanElement(child as HTMLElement))
      }

      // 1. 导出封面
      if (coverRef.current) {
        const clone = coverRef.current.cloneNode(true) as HTMLElement
        deepCleanElement(clone)

        clone.style.cssText = `
          position: absolute;
          left: -9999px;
          top: 0;
          width: ${coverRef.current.offsetWidth}px;
          height: ${coverRef.current.offsetHeight}px;
          background: #faf3e0;
        `
        document.body.appendChild(clone)

        await new Promise(resolve => setTimeout(resolve, 100))

        const coverCanvas = await html2canvas(clone, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#faf3e0',
        })

        document.body.removeChild(clone)

        const coverImgData = coverCanvas.toDataURL('image/jpeg', 0.95)
        const coverImgHeight = (coverCanvas.height * pageWidth) / coverCanvas.width
        pdf.addImage(coverImgData, 'JPEG', 0, 0, pageWidth, coverImgHeight)
      }

      // 2. 导出目录页
      if (tocRef.current) {
        pdf.addPage()

        const clone = tocRef.current.cloneNode(true) as HTMLElement
        deepCleanElement(clone)

        clone.style.cssText = `
          position: absolute;
          left: -9999px;
          top: 0;
          width: ${tocRef.current.offsetWidth}px;
          min-height: ${tocRef.current.offsetHeight}px;
          background: #ffffff;
        `
        document.body.appendChild(clone)

        await new Promise(resolve => setTimeout(resolve, 100))

        const tocCanvas = await html2canvas(clone, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        })

        document.body.removeChild(clone)

        const tocImgData = tocCanvas.toDataURL('image/jpeg', 0.95)
        const tocImgHeight = (tocCanvas.height * pageWidth) / tocCanvas.width
        pdf.addImage(tocImgData, 'JPEG', 0, 0, pageWidth, tocImgHeight)
      }

      pdf.save(`${familyName || '家族'}族谱.pdf`)
    } catch (error) {
      console.error('Export failed:', error)
    } finally {
      setIsExporting(false)
    }
  }

  const getGenerationLabel = (gen?: string) => {
    if (!gen) return ''
    if (generationWords.includes(gen)) return gen
    return gen
  }

  // 封面页
  const renderCover = () => (
    <div className="h-full flex items-center justify-center bg-gradient-to-br from-amber-100 to-orange-100 p-8 relative">
      {/* 顶部导出按钮 */}
      <div className="absolute top-4 right-4 z-10">
        <Button
          variant="default"
          size="sm"
          onClick={handleExportPdf}
          disabled={isExporting}
          className="gap-2 shadow-lg bg-emerald-600 hover:bg-emerald-700"
        >
          {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          导出PDF
        </Button>
      </div>

      <div
        ref={coverRef}
        className="w-[500px] aspect-[3/4] bg-gradient-to-b from-amber-50 to-orange-50 border-4 border-amber-800 rounded-lg shadow-2xl relative overflow-hidden"
      >
        {/* 装饰边框 - 外层 */}
        <div className="absolute inset-1 border-2 border-amber-700 pointer-events-none" />
        {/* 装饰边框 - 内层 */}
        <div className="absolute inset-4 border border-amber-500 pointer-events-none" />

        {/* 四角装饰 - 如意纹 */}
        <div className="absolute top-2 left-2 w-8 h-8">
          <svg viewBox="0 0 40 40" className="w-full h-full text-amber-700">
            <path d="M2 38 Q2 2 38 2" fill="none" stroke="currentColor" strokeWidth="2"/>
            <circle cx="8" cy="8" r="3" fill="currentColor"/>
          </svg>
        </div>
        <div className="absolute top-2 right-2 w-8 h-8 rotate-90">
          <svg viewBox="0 0 40 40" className="w-full h-full text-amber-700">
            <path d="M2 38 Q2 2 38 2" fill="none" stroke="currentColor" strokeWidth="2"/>
            <circle cx="8" cy="8" r="3" fill="currentColor"/>
          </svg>
        </div>
        <div className="absolute bottom-2 left-2 w-8 h-8 -rotate-90">
          <svg viewBox="0 0 40 40" className="w-full h-full text-amber-700">
            <path d="M2 38 Q2 2 38 2" fill="none" stroke="currentColor" strokeWidth="2"/>
            <circle cx="8" cy="8" r="3" fill="currentColor"/>
          </svg>
        </div>
        <div className="absolute bottom-2 right-2 w-8 h-8 rotate-180">
          <svg viewBox="0 0 40 40" className="w-full h-full text-amber-700">
            <path d="M2 38 Q2 2 38 2" fill="none" stroke="currentColor" strokeWidth="2"/>
            <circle cx="8" cy="8" r="3" fill="currentColor"/>
          </svg>
        </div>

        {/* 中式徽章 - 圆形传统纹样 */}
        <div className="flex justify-center pt-16 pb-6">
          <div className="w-28 h-28 relative">
            <div className="absolute inset-0 rounded-full border-4 border-amber-700 bg-gradient-to-br from-amber-200 to-amber-400 shadow-lg">
              <div className="absolute inset-2 rounded-full border-2 border-amber-600 flex items-center justify-center">
                <div className="text-5xl text-amber-800 font-serif">谱</div>
              </div>
              <div className="absolute top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-amber-600"/>
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-amber-600"/>
              <div className="absolute left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-amber-600"/>
              <div className="absolute right-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-amber-600"/>
            </div>
          </div>
        </div>

        {/* 家族名称 */}
        <div className="text-center px-8">
          <h1 className="text-4xl font-bold text-amber-900 tracking-widest mb-2">
            {familyName || '某某家族'}
          </h1>
          <p className="text-lg text-amber-700 tracking-wider">族谱</p>

          {/* 分隔线 */}
          <div className="flex items-center justify-center gap-3 my-6">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-amber-500" />
            <div className="flex gap-1">
              <span className="text-amber-500 text-xs">◆</span>
              <span className="text-amber-500">◆</span>
              <span className="text-amber-500 text-xs">◆</span>
            </div>
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-amber-500" />
          </div>

          <Badge variant="outline" className="text-amber-800 border-amber-400 bg-amber-50 text-sm px-3 py-1">
            现代版
          </Badge>
        </div>

        {/* 家族精神 */}
        <div className="mx-8 mt-6 p-4 bg-amber-100/50 border border-amber-300 rounded text-center">
          <p className="text-sm text-amber-800 italic">
            "{familyMaxim || '传承家族文化  弘扬优良家风'}"
          </p>
        </div>

        {/* 家族来源 */}
        <div className="text-center mt-4 px-8">
          <p className="text-xs text-amber-700">
            始祖源地：{familyOrigin || '源远流长'}
          </p>
        </div>

        {/* 统计信息 */}
        <div className="absolute bottom-20 left-0 right-0 text-center">
          <p className="text-sm text-amber-700">
            共录 <span className="font-bold text-amber-900">{allMembersSorted.length}</span> 名族人
          </p>
          <p className="text-xs text-amber-600 mt-1">
            传承 {membersByGeneration.length} 代
          </p>
        </div>

        {/* 进入族谱按钮 */}
        <div className="absolute bottom-8 left-0 right-0 flex justify-center">
          <Button
            onClick={handleEnterToc}
            className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white px-8 py-2 rounded-full shadow-lg gap-2"
          >
            <BookOpen className="w-4 h-4" />
            进入族谱
          </Button>
        </div>
      </div>
    </div>
  )

  // 目录页 - 书籍索引风格（两列布局，适合打印）
  const renderToc = () => {
    // 生成书籍风格的索引列表 - 按姓名拼音排序
    const indexedMembers = allMembersSorted.map((member, index) => ({
      member,
      page: Math.floor(index / MEMBERS_PER_PAGE) + 1
    }))

    // 分成两列显示
    const half = Math.ceil(indexedMembers.length / 2)
    const leftColumn = indexedMembers.slice(0, half)
    const rightColumn = indexedMembers.slice(half)

    return (
      <div className="h-full flex flex-col bg-gradient-to-br from-amber-50 to-orange-50">
        {/* 顶部导航 */}
        <div className="shrink-0 flex items-center justify-between gap-4 p-4 bg-white border-b">
          <Button variant="ghost" onClick={() => setView('cover')} className="gap-1">
            <ArrowLeft className="w-4 h-4" />
            返回封面
          </Button>
          <div className="flex-1 text-center">
            <h2 className="text-lg font-semibold text-amber-900">家族成员索引</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPdf}
              disabled={isExporting}
              className="gap-1"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              导出PDF
            </Button>
          </div>
        </div>

        {/* 目录内容 - 书籍索引风格 */}
        <div className="flex-1 overflow-auto p-4">
          <div
            ref={tocRef}
            className="bg-white mx-auto shadow-lg border-2 border-amber-300"
            style={{ width: '210mm', minHeight: '297mm', padding: '15mm 20mm', fontFamily: 'serif' }}
          >
            {/* 标题 */}
            <div className="text-center mb-6 pb-4 border-b-2 border-amber-400">
              <h1 className="text-2xl font-bold text-amber-900 tracking-widest">{familyName || '某某家族'}</h1>
              <p className="text-amber-700 text-lg mt-1">成员索引</p>
            </div>

            {/* 索引表格 - 两列布局 */}
            <div className="flex gap-8">
              {/* 左列 */}
              <div className="flex-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-amber-800 border-b border-amber-200">
                      <th className="text-left py-2 w-16">页码</th>
                      <th className="text-left py-2">姓名</th>
                      <th className="text-left py-2 w-20">生卒年</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leftColumn.map(({ member, page }) => (
                      <tr
                        key={member.id}
                        className="border-b border-dotted border-amber-100 hover:bg-amber-50 cursor-pointer"
                        onClick={() => handleViewDetail(member)}
                      >
                        <td className="py-1.5 text-amber-600">{page}</td>
                        <td className="py-1.5 font-medium text-amber-900">{member.name}</td>
                        <td className="py-1.5 text-zinc-500 text-xs">
                          {member.birth_date?.substring(0, 4) || '-'}
                          {member.is_deceased && <span className="ml-1">故</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 右列 */}
              <div className="flex-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-amber-800 border-b border-amber-200">
                      <th className="text-left py-2 w-16">页码</th>
                      <th className="text-left py-2">姓名</th>
                      <th className="text-left py-2 w-20">生卒年</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rightColumn.map(({ member, page }) => (
                      <tr
                        key={member.id}
                        className="border-b border-dotted border-amber-100 hover:bg-amber-50 cursor-pointer"
                        onClick={() => handleViewDetail(member)}
                      >
                        <td className="py-1.5 text-amber-600">{page}</td>
                        <td className="py-1.5 font-medium text-amber-900">{member.name}</td>
                        <td className="py-1.5 text-zinc-500 text-xs">
                          {member.birth_date?.substring(0, 4) || '-'}
                          {member.is_deceased && <span className="ml-1">故</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 统计信息 */}
            <div className="mt-8 pt-4 border-t border-amber-200 text-center text-sm text-amber-700">
              <p>共 {allMembersSorted.length} 名族人，分为 {totalPages} 页记载</p>
              <p className="mt-1 text-zinc-500">编纂于 {new Date().toLocaleDateString('zh-CN')}</p>
            </div>
          </div>
        </div>

        <style>{`
          @media print {
            button { display: none !important; }
            .bg-white { background: white !important; }
          }
        `}</style>
      </div>
    )
  }

  // 成员详情页
  const renderDetail = () => {
    if (!selectedMember) return null

    const rels = memberRelations.get(selectedMember.id)
    const memberMap = new Map(members.map(m => [m.id, m]))
    const fatherInfo = rels?.father ? memberMap.get(rels.father.id) : null
    const motherInfo = rels?.mother ? memberMap.get(rels.mother.id) : null
    const spouseInfo = rels?.spouses || []
    const childrenInfo = (rels?.children || []).map(c => memberMap.get(c.id)).filter(Boolean) as Member[]
    const genLabel = getGenerationLabel(selectedMember.generation)
    const memberPage = memberPageMap.get(selectedMember.id) || 1

    return (
      <div className="h-full flex flex-col bg-gradient-to-br from-amber-50 to-orange-50">
        {/* 顶部导航 */}
        <div className="shrink-0 flex items-center gap-4 p-4 bg-white border-b">
          <Button variant="ghost" onClick={() => setView('toc')} className="gap-1">
            <ArrowLeft className="w-4 h-4" />
            返回目录
          </Button>
          <div className="flex-1 text-center">
            <h2 className="text-lg font-semibold text-amber-900">成员详情</h2>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-amber-700">
              第 {memberPage} 页
            </Badge>
          </div>
        </div>

        {/* 详情内容 */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* 照片和基本信息卡片 */}
            <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
              <CardContent className="p-6">
                <div className="flex items-start gap-6">
                  <div className="relative">
                    <div className="w-32 h-32 rounded-full border-4 border-amber-700 bg-gradient-to-br from-amber-100 to-orange-100 overflow-hidden shadow-lg">
                      <Avatar
                        src={selectedMember.photo_path ? `/api/photos/${selectedMember.photo_path.split('/').pop()}` : undefined}
                        fallback={selectedMember.name}
                        size="xl"
                        gender={selectedMember.gender as "male" | "female"}
                      />
                    </div>
                    {selectedMember.is_deceased && (
                      <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-gray-500 rounded-full flex items-center justify-center text-white text-xs">
                        故
                      </div>
                    )}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-2xl font-bold text-amber-900">{selectedMember.name}</h3>
                      {genLabel && (
                        <Badge className="bg-amber-200 text-amber-800 border-amber-400">
                          {genLabel}
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-amber-700">
                        <span className="w-16">性别</span>
                        <span className="text-amber-900">{selectedMember.gender === 'male' ? '男' : '女'}</span>
                      </div>

                      {(selectedMember.birth_date || selectedMember.death_date) && (
                        <div className="flex items-center gap-2 text-amber-700">
                          <Calendar className="w-4 h-4" />
                          <span className="text-amber-900">
                            {selectedMember.birth_date || '未知'}
                            {selectedMember.death_date && ` ～ ${selectedMember.death_date}`}
                          </span>
                        </div>
                      )}

                      {selectedMember.birth_place && (
                        <div className="flex items-center gap-2 text-amber-700">
                          <Home className="w-4 h-4" />
                          <span className="text-amber-900">{selectedMember.birth_place}</span>
                        </div>
                      )}

                      {selectedMember.occupation && (
                        <div className="flex items-center gap-2 text-amber-700">
                          <Briefcase className="w-4 h-4" />
                          <span className="text-amber-900">{selectedMember.occupation}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 生平事迹 */}
            {selectedMember.biography && (
              <Card className="border-amber-200">
                <CardContent className="p-4">
                  <h4 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-2">
                    <BookOpen className="w-4 h-4" />
                    生平事迹
                  </h4>
                  <p className="text-amber-900 text-sm leading-relaxed">{selectedMember.biography}</p>
                </CardContent>
              </Card>
            )}

            {/* 主要成就 */}
            {selectedMember.remarkable_deeds && (
              <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
                <CardContent className="p-4">
                  <h4 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-2">
                    <Award className="w-4 h-4" />
                    主要成就
                  </h4>
                  <p className="text-amber-900 text-sm leading-relaxed">{selectedMember.remarkable_deeds}</p>
                </CardContent>
              </Card>
            )}

            {/* 家族关系 */}
            <Card className="border-amber-200">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  家族关系
                </h4>

                <div className="space-y-3">
                  {(fatherInfo || motherInfo) && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-amber-600 w-12">父母</span>
                      <div className="flex gap-2">
                        {fatherInfo && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs border-amber-300 hover:border-amber-500"
                            onClick={() => handleViewDetail(fatherInfo)}
                          >
                            {fatherInfo.name} <span className="text-amber-500 ml-1">父</span>
                          </Button>
                        )}
                        {motherInfo && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs border-amber-300 hover:border-amber-500"
                            onClick={() => handleViewDetail(motherInfo)}
                          >
                            {motherInfo.name} <span className="text-amber-500 ml-1">母</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {spouseInfo.length > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-amber-600 w-12">配偶</span>
                      <div className="flex flex-wrap gap-2">
                        {spouseInfo.map(spouse => {
                          const spouseMember = memberMap.get(spouse.id)
                          return (
                            <Button
                              key={spouse.id}
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs border-amber-300 hover:border-amber-500"
                              onClick={() => spouseMember && handleViewDetail(spouseMember)}
                            >
                              {spouse.name}
                              {spouse.tag && <span className="text-amber-500 ml-1">（{spouse.tag}）</span>}
                            </Button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {childrenInfo.length > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-amber-600 w-12">子女</span>
                      <div className="flex flex-wrap gap-2">
                        {childrenInfo.map(child => (
                          <Button
                            key={child.id}
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs border-amber-300 hover:border-amber-500"
                            onClick={() => handleViewDetail(child)}
                          >
                            {child.name}
                            <span className="text-amber-500 ml-1">{child.gender === 'male' ? '子' : '女'}</span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full relative">
      {view === 'cover' && renderCover()}
      {view === 'toc' && renderToc()}
      {view === 'detail' && renderDetail()}
    </div>
  )
}