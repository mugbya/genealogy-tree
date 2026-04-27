import React, { useMemo, useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import type { Member, MemberRelation } from '@/api/client'
import { ArrowLeft, Download, Loader2, BookOpen, Plus, Trash2, FileText } from 'lucide-react'
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

type ViewState = 'cover' | 'toc' | 'detail' | 'volume'

// 分册配置
interface VolumeRange {
  id: string
  startGen: number
  endGen: number
}

export function ModernGenealogyBook({
  familyName,
  familySurname,
  familyOrigin,
  familyMaxim,
  familyGenerationWords,
  members,
  relations,
}: ModernGenealogyBookProps) {
  // 注意: familyGenerationWords 已弃用,现在使用存储在成员表中的 generation_word 字段
  void familyGenerationWords

  const [view, setView] = useState<ViewState>('cover')
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const coverRef = useRef<HTMLDivElement>(null)
  const tocRef = useRef<HTMLDivElement>(null)

  // 导出进度状态
  const [exportingVolume, setExportingVolume] = useState<string | null>(null) // 当前正在导出的分册ID
  const [exportingProgress, setExportingProgress] = useState({ current: 0, total: 0 }) // 导出进度
  const [exportSuccess, setExportSuccess] = useState<string | null>(null) // 导出成功提示

  // 分册配置状态
  const [volumeRanges, setVolumeRanges] = useState<VolumeRange[]>([])

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
        memberEntry.spouses.push({ id: spouseId, name: spouse.name, tag: rel.tag_name })
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

  // 全部族人排序
  const allMembersSorted = useMemo(() => {
    return members
      .filter(m => isOwnFamily(m))
      .sort((a, b) => {
        // 先按代数排序（从小到大，第一代在前）
        const genA = parseInt(a.generation || '0', 10) || 0
        const genB = parseInt(b.generation || '0', 10) || 0
        if (genA !== genB) return genA - genB
        // 同代数内按 weight 排序
        return (b.weight ?? 0) - (a.weight ?? 0)
      })
  }, [members, isOwnFamily])

  const handleViewDetail = (member: Member) => {
    setSelectedMember(member)
    setView('detail')
  }

  const handleEnterToc = () => {
    setView('toc')
  }

  // ========== 分册相关 ==========

  // 获取所有代数
  const allGenerations = useMemo(() => {
    const gens = new Set<number>()
    allMembersSorted.forEach(m => {
      if (m.generation) {
        gens.add(parseInt(m.generation, 10))
      }
    })
    return Array.from(gens).sort((a, b) => a - b)
  }, [allMembersSorted])

  // 初始化分册配置
  React.useEffect(() => {
    if (allGenerations.length > 0 && volumeRanges.length === 0) {
      const defaultRanges: VolumeRange[] = []
      let currentStart = allGenerations[0]
      for (let i = 0; i < allGenerations.length; i++) {
        if (i > 0 && allGenerations[i] - allGenerations[i - 1] > 5) {
          defaultRanges.push({
            id: crypto.randomUUID(),
            startGen: currentStart,
            endGen: allGenerations[i - 1]
          })
          currentStart = allGenerations[i]
        }
        if (i === allGenerations.length - 1) {
          defaultRanges.push({
            id: crypto.randomUUID(),
            startGen: currentStart,
            endGen: allGenerations[i]
          })
        }
      }
      setVolumeRanges(defaultRanges)
    }
  }, [allGenerations])

  // 获取某册的成员
  const getMembersForVolume = (volume: VolumeRange): Member[] => {
    return allMembersSorted.filter(m => {
      if (!m.generation) return false
      const gen = parseInt(m.generation, 10)
      return gen >= volume.startGen && gen <= volume.endGen
    })
  }

  // 添加分册
  const addVolume = () => {
    const lastGen = allGenerations[allGenerations.length - 1] || 1
    setVolumeRanges([...volumeRanges, {
      id: crypto.randomUUID(),
      startGen: lastGen + 1,
      endGen: lastGen + 5
    }])
  }

  // 删除分册
  const removeVolume = (id: string) => {
    setVolumeRanges(volumeRanges.filter(v => v.id !== id))
  }

  // 更新分册
  const updateVolume = (id: string, field: 'startGen' | 'endGen', value: number) => {
    setVolumeRanges(volumeRanges.map(v => {
      if (v.id !== id) return v
      return { ...v, [field]: value }
    }))
  }

  // 导出PDF
  // 导出全部PDF（原生jsPDF快速渲染）
  const handleExportPdf = async () => {
    if (exportingVolume !== null) {
      window.alert('正在导出中，请等待当前导出完成')
      return
    }

    if (allMembersSorted.length === 0) {
      window.alert('没有成员数据')
      return
    }

    setIsExporting(true)
    setExportingVolume('all')
    setExportingProgress({ current: 0, total: allMembersSorted.length + 2 })

    try {
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 20
      const contentWidth = pageWidth - margin * 2

      pdf.setFont('helvetica')

      // ========== 封面页 ==========
      const coverCenterX = pageWidth / 2
      const coverCenterY = pageHeight / 2

      pdf.setFontSize(56)
      pdf.setTextColor(51, 51, 51)
      pdf.text(familyName || '某某家族', coverCenterX, coverCenterY - 80, { align: 'center' })

      pdf.setFontSize(32)
      pdf.text('祖 谱', coverCenterX, coverCenterY - 50, { align: 'center' })

      pdf.setFontSize(24)
      pdf.setTextColor(102, 102, 102)
      pdf.text(`（共 ${membersByGeneration.length} 代）`, coverCenterX, coverCenterY - 25, { align: 'center' })

      pdf.setFontSize(20)
      pdf.setTextColor(51, 51, 51)
      pdf.text('— 现代版 —', coverCenterX, coverCenterY + 10, { align: 'center' })

      pdf.setFontSize(18)
      pdf.text(familyMaxim || '传承家族文化  弘扬优良家风', coverCenterX, coverCenterY + 45, { align: 'center' })

      pdf.setFontSize(14)
      pdf.setTextColor(102, 102, 102)
      pdf.text(`始祖源地：${familyOrigin || '源远流长'}`, coverCenterX, coverCenterY + 75, { align: 'center' })

      pdf.setFontSize(16)
      pdf.setTextColor(51, 51, 51)
      pdf.text(`共录 ${allMembersSorted.length} 名族人`, coverCenterX, coverCenterY + 110, { align: 'center' })

      setExportingProgress(prev => ({ ...prev, current: 1 }))

      // ========== 索引页 ==========
      pdf.addPage()

      let y = margin

      pdf.setFontSize(28)
      pdf.setTextColor(51, 51, 51)
      pdf.text(`${familyName || '某某家族'} 成员索引`, pageWidth / 2, y, { align: 'center' })
      y += 15

      pdf.setDrawColor(51, 51, 51)
      pdf.setLineWidth(0.5)
      pdf.line(margin, y, pageWidth - margin, y)
      y += 15

      pdf.setFontSize(12)
      pdf.setTextColor(51, 51, 51)
      pdf.text('页码', margin, y)
      pdf.text('代数', margin + 30, y)
      pdf.text('字辈', margin + 60, y)
      pdf.text('姓名', margin + 100, y)
      pdf.text('生年', margin + 150, y)
      y += 8

      pdf.setDrawColor(200, 200, 200)
      pdf.line(margin, y, pageWidth - margin, y)
      y += 8

      pdf.setTextColor(102, 102, 102)
      allMembersSorted.forEach((m, i) => {
        const page = i + 3
        const genNum = parseInt(m.generation || '0', 10) || 0
        const genWord = m.generation_word || ''

        pdf.text(`第${page}页`, margin, y)
        pdf.text(genNum > 0 ? `第${genNum}代` : '-', margin + 30, y)
        pdf.text(genWord, margin + 60, y)
        pdf.setTextColor(51, 51, 51)
        pdf.text(m.name, margin + 100, y)
        pdf.setTextColor(102, 102, 102)
        pdf.text(m.birth_date?.substring(0, 4) || '-', margin + 150, y)

        y += 7
        if (y > pageHeight - margin) {
          pdf.addPage()
          y = margin
        }
      })

      y += 20
      pdf.setFontSize(14)
      pdf.text(`共 ${allMembersSorted.length} 名族人，分为 ${allMembersSorted.length + 2} 页记载`, pageWidth / 2, y, { align: 'center' })

      setExportingProgress(prev => ({ ...prev, current: 2 }))

      // ========== 成员详情页 ==========
      const memberMap = new Map(members.map(m => [m.id, m]))

      for (let i = 0; i < allMembersSorted.length; i++) {
        const m = allMembersSorted[i]
        pdf.addPage()

        const rels = memberRelations.get(m.id)
        const genNum = parseInt(m.generation || '0', 10) || 0
        const genWord = m.generation_word || ''
        const fatherInfo = rels?.father ? memberMap.get(rels.father.id) : null
        const motherInfo = rels?.mother ? memberMap.get(rels.mother.id) : null
        const spouseInfo = rels?.spouses || []
        const childrenInfo = (rels?.children || []).map(c => memberMap.get(c.id)).filter((c): c is Member => c !== undefined)

        y = margin

        pdf.setFontSize(36)
        pdf.setTextColor(51, 51, 51)
        pdf.text(m.name, pageWidth / 2, y + 15, { align: 'center' })

        if (m.is_deceased) {
          pdf.setFontSize(14)
          pdf.setTextColor(153, 153, 153)
          pdf.text('（故）', pageWidth / 2, y + 28, { align: 'center' })
        }

        pdf.setFontSize(14)
        pdf.setTextColor(102, 102, 102)
        const genLabel = genNum > 0 && genWord ? `第${genNum}代 · ${genWord}` : (genWord || `第${genNum}代`)
        pdf.text(genLabel, pageWidth / 2, y + 42, { align: 'center' })

        y += 55
        pdf.setDrawColor(51, 51, 51)
        pdf.setLineWidth(0.3)
        pdf.line(margin, y, pageWidth - margin, y)
        y += 15

        pdf.setFontSize(12)
        pdf.setTextColor(102, 102, 102)
        pdf.text('性别', margin, y)
        pdf.setTextColor(51, 51, 51)
        pdf.text(m.gender === 'male' ? '男' : '女', margin + 50, y)
        y += 8

        if (m.birth_date || m.death_date) {
          pdf.setTextColor(102, 102, 102)
          pdf.text('生卒', margin, y)
          pdf.setTextColor(51, 51, 51)
          const deathLabel = m.death_date ? ` ～ ${m.death_date}` : ''
          pdf.text(`${m.birth_date || '未知'}${deathLabel}`, margin + 50, y)
          y += 8
        }

        if (m.birth_place) {
          pdf.setTextColor(102, 102, 102)
          pdf.text('籍贯', margin, y)
          pdf.setTextColor(51, 51, 51)
          pdf.text(m.birth_place, margin + 50, y)
          y += 8
        }

        if (m.occupation) {
          pdf.setTextColor(102, 102, 102)
          pdf.text('职业', margin, y)
          pdf.setTextColor(51, 51, 51)
          pdf.text(m.occupation, margin + 50, y)
          y += 8
        }

        if (fatherInfo || motherInfo || spouseInfo.length > 0 || childrenInfo.length > 0) {
          y += 10
          pdf.setFontSize(14)
          pdf.setTextColor(51, 51, 51)
          pdf.text('家族关系', margin, y)
          y += 8
          pdf.setDrawColor(51, 51, 51)
          pdf.setLineWidth(0.2)
          pdf.line(margin, y, margin + 30, y)
          y += 8

          pdf.setFontSize(12)
          if (fatherInfo) {
            pdf.setTextColor(102, 102, 102)
            pdf.text('父亲', margin, y)
            pdf.setTextColor(51, 51, 51)
            pdf.text(fatherInfo.name, margin + 50, y)
            y += 7
          }
          if (motherInfo) {
            pdf.setTextColor(102, 102, 102)
            pdf.text('母亲', margin, y)
            pdf.setTextColor(51, 51, 51)
            pdf.text(motherInfo.name, margin + 50, y)
            y += 7
          }
          if (spouseInfo.length > 0) {
            pdf.setTextColor(102, 102, 102)
            pdf.text('配偶', margin, y)
            pdf.setTextColor(51, 51, 51)
            pdf.text(spouseInfo.map(s => s.name).join('、'), margin + 50, y)
            y += 7
          }
          if (childrenInfo.length > 0) {
            pdf.setTextColor(102, 102, 102)
            pdf.text('子女', margin, y)
            pdf.setTextColor(51, 51, 51)
            pdf.text(childrenInfo.map(c => c.name).join('、'), margin + 50, y)
            y += 7
          }
        }

        if (m.biography) {
          y += 10
          pdf.setFontSize(14)
          pdf.setTextColor(51, 51, 51)
          pdf.text('生平简介', margin, y)
          y += 8
          pdf.setDrawColor(51, 51, 51)
          pdf.setLineWidth(0.2)
          pdf.line(margin, y, margin + 30, y)
          y += 8

          pdf.setFontSize(12)
          pdf.setTextColor(51, 51, 51)
          const bioLines = pdf.splitTextToSize(m.biography, contentWidth)
          bioLines.forEach((line: string) => {
            if (y > pageHeight - margin - 20) {
              pdf.addPage()
              y = margin
            }
            pdf.text(line, margin, y)
            y += 6
          })
        }

        if (m.remarkable_deeds) {
          y += 10
          pdf.setFontSize(14)
          pdf.setTextColor(51, 51, 51)
          pdf.text('主要成就', margin, y)
          y += 8
          pdf.setDrawColor(51, 51, 51)
          pdf.setLineWidth(0.2)
          pdf.line(margin, y, margin + 30, y)
          y += 8

          pdf.setFontSize(12)
          pdf.setTextColor(51, 51, 51)
          const deedLines = pdf.splitTextToSize(m.remarkable_deeds, contentWidth)
          deedLines.forEach((line: string) => {
            if (y > pageHeight - margin - 20) {
              pdf.addPage()
              y = margin
            }
            pdf.text(line, margin, y)
            y += 6
          })
        }

        pdf.setFontSize(10)
        pdf.setTextColor(153, 153, 153)
        pdf.text(`${familyName || '家族'}族谱 · 第${i + 3}页`, pageWidth / 2, pageHeight - 15, { align: 'center' })

        setExportingProgress(prev => ({ ...prev, current: i + 3 }))
      }

      pdf.save(`${familyName || '家族'}祖谱.pdf`)

      // 显示成功提示
      setExportSuccess(`导出成功！已保存为 "${familyName || '家族'}祖谱.pdf"`)
    } catch (error) {
      console.error('Export failed:', error)
      window.alert('导出失败，请重试')
    } finally {
      setIsExporting(false)
      setExportingVolume(null)
    }
  }

  // 导出单册PDF
  const handleExportVolume = async (volume: VolumeRange) => {
    // 防止并发导出
    if (exportingVolume !== null) {
      window.alert('正在导出中，请等待当前导出完成')
      return
    }

    const volumeMembers = getMembersForVolume(volume)
    if (volumeMembers.length === 0) {
      window.alert('该册没有成员，请调整代数范围')
      return
    }

    setIsExporting(true)
    setExportingVolume(volume.id)
    setExportingProgress({ current: 0, total: volumeMembers.length + 2 })

    try {
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 20
      const contentWidth = pageWidth - margin * 2

      // 设置中文字体支持
      pdf.setFont('helvetica')

      const volumeTitle = `第${volume.startGen}至${volume.endGen}代`

      // ========== 封面页 ==========
      const coverCenterX = pageWidth / 2
      const coverCenterY = pageHeight / 2

      pdf.setFontSize(56)
      pdf.setTextColor(51, 51, 51)
      pdf.text(familyName || '某某家族', coverCenterX, coverCenterY - 80, { align: 'center' })

      pdf.setFontSize(32)
      pdf.text('祖 谱', coverCenterX, coverCenterY - 50, { align: 'center' })

      pdf.setFontSize(24)
      pdf.setTextColor(102, 102, 102)
      pdf.text(`（${volumeTitle}）`, coverCenterX, coverCenterY - 25, { align: 'center' })

      pdf.setFontSize(20)
      pdf.setTextColor(51, 51, 51)
      pdf.text('— 现代版 —', coverCenterX, coverCenterY + 10, { align: 'center' })

      pdf.setFontSize(18)
      pdf.text(familyMaxim || '传承家族文化  弘扬优良家风', coverCenterX, coverCenterY + 45, { align: 'center' })

      pdf.setFontSize(14)
      pdf.setTextColor(102, 102, 102)
      pdf.text(`始祖源地：${familyOrigin || '源远流长'}`, coverCenterX, coverCenterY + 75, { align: 'center' })

      pdf.setFontSize(16)
      pdf.setTextColor(51, 51, 51)
      pdf.text(`共录 ${volumeMembers.length} 名族人`, coverCenterX, coverCenterY + 110, { align: 'center' })

      pdf.setFontSize(14)
      pdf.setTextColor(102, 102, 102)
      pdf.text(`本册记载 ${volume.startGen}-${volume.endGen} 代`, coverCenterX, coverCenterY + 125, { align: 'center' })

      setExportingProgress(prev => ({ ...prev, current: 1 }))

      // ========== 索引页 ==========
      pdf.addPage()

      let y = margin

      // 标题
      pdf.setFontSize(28)
      pdf.setTextColor(51, 51, 51)
      pdf.text(`${familyName || '某某家族'} 成员索引（${volumeTitle}）`, pageWidth / 2, y, { align: 'center' })
      y += 15

      // 分隔线
      pdf.setDrawColor(51, 51, 51)
      pdf.setLineWidth(0.5)
      pdf.line(margin, y, pageWidth - margin, y)
      y += 15

      // 表头
      pdf.setFontSize(12)
      pdf.setTextColor(51, 51, 51)
      pdf.text('页码', margin, y)
      pdf.text('代数', margin + 30, y)
      pdf.text('字辈', margin + 60, y)
      pdf.text('姓名', margin + 100, y)
      pdf.text('生年', margin + 150, y)
      y += 8

      // 分隔线
      pdf.setDrawColor(200, 200, 200)
      pdf.line(margin, y, pageWidth - margin, y)
      y += 8

      // 成员列表
      pdf.setTextColor(102, 102, 102)
      volumeMembers.forEach((m, i) => {
        const page = i + 3
        const genNum = parseInt(m.generation || '0', 10) || 0
        const genWord = m.generation_word || ''

        pdf.text(`第${page}页`, margin, y)
        pdf.text(genNum > 0 ? `第${genNum}代` : '-', margin + 30, y)
        pdf.text(genWord, margin + 60, y)
        pdf.setTextColor(51, 51, 51)
        pdf.text(m.name, margin + 100, y)
        pdf.setTextColor(102, 102, 102)
        pdf.text(m.birth_date?.substring(0, 4) || '-', margin + 150, y)
        pdf.setTextColor(102, 102, 102)

        y += 7
        if (y > pageHeight - margin) {
          pdf.addPage()
          y = margin
        }
      })

      y += 20
      pdf.setFontSize(14)
      pdf.text(`共 ${volumeMembers.length} 名族人，分为 ${volumeMembers.length + 2} 页记载`, pageWidth / 2, y, { align: 'center' })

      setExportingProgress(prev => ({ ...prev, current: 2 }))

      // ========== 成员详情页 ==========
      for (let i = 0; i < volumeMembers.length; i++) {
        const m = volumeMembers[i]
        pdf.addPage()

        const rels = memberRelations.get(m.id)
        const genNum = parseInt(m.generation || '0', 10) || 0
        const genWord = m.generation_word || ''
        const memberMap = new Map(members.map(m => [m.id, m]))
        const fatherInfo = rels?.father ? memberMap.get(rels.father.id) : null
        const motherInfo = rels?.mother ? memberMap.get(rels.mother.id) : null
        const spouseInfo = rels?.spouses || []
        const childrenInfo = (rels?.children || []).map(c => memberMap.get(c.id)).filter((c): c is Member => c !== undefined)

        y = margin

        // 姓名（居中，大字）
        pdf.setFontSize(36)
        pdf.setTextColor(51, 51, 51)
        pdf.text(m.name, pageWidth / 2, y + 15, { align: 'center' })

        // 逝世标记
        if (m.is_deceased) {
          pdf.setFontSize(14)
          pdf.setTextColor(153, 153, 153)
          pdf.text('（故）', pageWidth / 2, y + 28, { align: 'center' })
        }

        // 代数和字辈
        pdf.setFontSize(14)
        pdf.setTextColor(102, 102, 102)
        const genLabel = genNum > 0 && genWord ? `第${genNum}代 · ${genWord}` : (genWord || `第${genNum}代`)
        pdf.text(genLabel, pageWidth / 2, y + 42, { align: 'center' })

        // 分隔线
        y += 55
        pdf.setDrawColor(51, 51, 51)
        pdf.setLineWidth(0.3)
        pdf.line(margin, y, pageWidth - margin, y)
        y += 15

        // 基本信息
        pdf.setFontSize(12)
        pdf.setTextColor(102, 102, 102)
        pdf.text('性别', margin, y)
        pdf.setTextColor(51, 51, 51)
        pdf.text(m.gender === 'male' ? '男' : '女', margin + 50, y)
        y += 8

        if (m.birth_date || m.death_date) {
          pdf.setTextColor(102, 102, 102)
          pdf.text('生卒', margin, y)
          pdf.setTextColor(51, 51, 51)
          const deathLabel = m.death_date ? ` ～ ${m.death_date}` : ''
          pdf.text(`${m.birth_date || '未知'}${deathLabel}`, margin + 50, y)
          y += 8
        }

        if (m.birth_place) {
          pdf.setTextColor(102, 102, 102)
          pdf.text('籍贯', margin, y)
          pdf.setTextColor(51, 51, 51)
          pdf.text(m.birth_place, margin + 50, y)
          y += 8
        }

        if (m.occupation) {
          pdf.setTextColor(102, 102, 102)
          pdf.text('职业', margin, y)
          pdf.setTextColor(51, 51, 51)
          pdf.text(m.occupation, margin + 50, y)
          y += 8
        }

        // 家族关系
        if (fatherInfo || motherInfo || spouseInfo.length > 0 || childrenInfo.length > 0) {
          y += 10
          pdf.setFontSize(14)
          pdf.setTextColor(51, 51, 51)
          pdf.text('家族关系', margin, y)
          y += 8
          pdf.setDrawColor(51, 51, 51)
          pdf.setLineWidth(0.2)
          pdf.line(margin, y, margin + 30, y)
          y += 8

          pdf.setFontSize(12)
          if (fatherInfo) {
            pdf.setTextColor(102, 102, 102)
            pdf.text('父亲', margin, y)
            pdf.setTextColor(51, 51, 51)
            pdf.text(fatherInfo.name, margin + 50, y)
            y += 7
          }
          if (motherInfo) {
            pdf.setTextColor(102, 102, 102)
            pdf.text('母亲', margin, y)
            pdf.setTextColor(51, 51, 51)
            pdf.text(motherInfo.name, margin + 50, y)
            y += 7
          }
          if (spouseInfo.length > 0) {
            pdf.setTextColor(102, 102, 102)
            pdf.text('配偶', margin, y)
            pdf.setTextColor(51, 51, 51)
            pdf.text(spouseInfo.map(s => s.name).join('、'), margin + 50, y)
            y += 7
          }
          if (childrenInfo.length > 0) {
            pdf.setTextColor(102, 102, 102)
            pdf.text('子女', margin, y)
            pdf.setTextColor(51, 51, 51)
            pdf.text(childrenInfo.map(c => c.name).join('、'), margin + 50, y)
            y += 7
          }
        }

        // 生平简介
        if (m.biography) {
          y += 10
          pdf.setFontSize(14)
          pdf.setTextColor(51, 51, 51)
          pdf.text('生平简介', margin, y)
          y += 8
          pdf.setDrawColor(51, 51, 51)
          pdf.setLineWidth(0.2)
          pdf.line(margin, y, margin + 30, y)
          y += 8

          pdf.setFontSize(12)
          pdf.setTextColor(51, 51, 51)
          const bioLines = pdf.splitTextToSize(m.biography, contentWidth)
          bioLines.forEach((line: string) => {
            if (y > pageHeight - margin - 20) {
              pdf.addPage()
              y = margin
            }
            pdf.text(line, margin, y)
            y += 6
          })
        }

        // 主要成就
        if (m.remarkable_deeds) {
          y += 10
          pdf.setFontSize(14)
          pdf.setTextColor(51, 51, 51)
          pdf.text('主要成就', margin, y)
          y += 8
          pdf.setDrawColor(51, 51, 51)
          pdf.setLineWidth(0.2)
          pdf.line(margin, y, margin + 30, y)
          y += 8

          pdf.setFontSize(12)
          pdf.setTextColor(51, 51, 51)
          const deedLines = pdf.splitTextToSize(m.remarkable_deeds, contentWidth)
          deedLines.forEach((line: string) => {
            if (y > pageHeight - margin - 20) {
              pdf.addPage()
              y = margin
            }
            pdf.text(line, margin, y)
            y += 6
          })
        }

        // 页脚
        pdf.setFontSize(10)
        pdf.setTextColor(153, 153, 153)
        pdf.text(`${familyName || '家族'}族谱 · ${volumeTitle} · 第${i + 3}页`, pageWidth / 2, pageHeight - 15, { align: 'center' })

        setExportingProgress(prev => ({ ...prev, current: i + 3 }))
      }

      pdf.save(`${familyName || '家族'}祖谱（${volumeTitle}）.pdf`)

      // 显示成功提示
      setExportSuccess(`导出成功！已保存为 "${familyName || '家族'}祖谱（${volumeTitle}）.pdf"`)
    } catch (error) {
      console.error('Export failed:', error)
      window.alert('导出失败，请重试')
    } finally {
      setIsExporting(false)
      setExportingVolume(null)
      setExportingProgress({ current: 0, total: 0 })
    }
  }

  // 导出全部（分册）
  const handleExportAllVolumes = async () => {
    if (volumeRanges.length === 0) {
      window.alert('请先配置分册')
      return
    }

    for (const volume of volumeRanges) {
      const volumeMembers = getMembersForVolume(volume)
      if (volumeMembers.length > 0) {
        await handleExportVolume(volume)
      }
    }
  }

  // 封面页
  const renderCover = () => (
    <div className="h-full flex flex-col bg-white">
      {/* 顶部导出按钮 */}
      <div className="shrink-0 flex items-center justify-end gap-2 p-4 border-b">
        {exportSuccess && (
          <div className="flex-1 flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 animate-fade-in">
            <span className="font-medium">{exportSuccess}</span>
            <button onClick={() => setExportSuccess(null)} className="ml-auto hover:text-emerald-900">×</button>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setView('volume')}
          className="gap-2"
        >
          <FileText className="w-4 h-4" />
          分册导出
        </Button>
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

      <div className="flex-1 overflow-auto p-4">
        <div
          ref={coverRef}
          className="mx-auto bg-gradient-to-b from-amber-50 to-orange-50 border-4 border-amber-800 shadow-2xl relative overflow-hidden"
          style={{ width: '210mm', minHeight: '285mm' }}
        >
          {/* 装饰边框 */}
          <div className="absolute inset-1 border-2 border-amber-700 pointer-events-none" />
          <div className="absolute inset-4 border border-amber-500 pointer-events-none" />

          {/* 四角装饰 */}
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

          {/* 徽章 */}
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
            <p className="text-lg text-amber-700 tracking-wider">祖谱</p>

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

          <div className="mx-8 mt-6 p-4 bg-amber-100/50 border border-amber-300 rounded text-center">
            <p className="text-sm text-amber-800 italic">
              {familyMaxim || '传承家族文化  弘扬优良家风'}
            </p>
          </div>

          <div className="text-center mt-4 px-8">
            <p className="text-xs text-amber-700">
              始祖源地：{familyOrigin || '源远流长'}
            </p>
          </div>

          <div className="absolute bottom-20 left-0 right-0 text-center">
            <p className="text-sm text-amber-700">
              共录 <span className="font-bold text-amber-900">{allMembersSorted.length}</span> 名族人
            </p>
            <p className="text-xs text-amber-600 mt-1">
              传承 {membersByGeneration.length} 代
            </p>
          </div>

          <div className="absolute bottom-8 left-0 right-0 flex justify-center">
            <Button
              onClick={handleEnterToc}
              className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white px-8 py-2 rounded-full shadow-lg gap-2"
            >
              <BookOpen className="w-4 h-4" />
              进入祖谱
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  // 目录页
  const renderToc = () => {
    return (
      <div className="h-full flex flex-col bg-white">
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

        <div className="flex-1 overflow-auto p-4">
          <div
            ref={tocRef}
            className="bg-white mx-auto shadow-lg border-2 border-amber-300"
            style={{ width: '210mm', minHeight: '297mm', padding: '15mm 20mm', fontFamily: 'serif' }}
          >
            <div className="text-center mb-6 pb-4 border-b-2 border-amber-400">
              <h1 className="text-2xl font-bold text-amber-900 tracking-widest">{familyName || '某某家族'}</h1>
              <p className="text-amber-700 text-lg mt-1">成员索引</p>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-amber-800 border-b border-amber-200">
                  <th className="text-left py-2 w-16">页码</th>
                  <th className="text-left py-2 w-16">代数</th>
                  <th className="text-left py-2 w-20">字辈</th>
                  <th className="text-left py-2 w-24">姓名</th>
                  <th className="text-left py-2 w-20">生年</th>
                </tr>
              </thead>
              <tbody>
                {allMembersSorted.map((member, index) => {
                  const genNum = parseInt(member.generation || '0', 10) || 0
                  const genWord = member.generation_word || ''
                  return (
                    <tr
                      key={member.id}
                      className="border-b border-dotted border-amber-100 hover:bg-amber-50 cursor-pointer"
                      onClick={() => handleViewDetail(member)}
                    >
                      <td className="py-2 text-amber-600">第{index + 3}页</td>
                      <td className="py-2 text-amber-700">{genNum > 0 ? `第${genNum}代` : '-'}</td>
                      <td className="py-2 text-amber-600">{genWord}</td>
                      <td className="py-2 font-medium text-amber-900">{member.name}</td>
                      <td className="py-2 text-zinc-500 text-xs">
                        {member.birth_date?.substring(0, 4) || '-'}
                        {member.is_deceased && <span className="ml-1">故</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <div className="mt-8 pt-4 border-t border-amber-200 text-center text-sm text-amber-700">
              <p>共 {allMembersSorted.length} 名族人，分为 {allMembersSorted.length + 2} 页记载</p>
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
    const childrenInfo = (rels?.children || []).map(c => memberMap.get(c.id)).filter((m): m is Member => m !== undefined) as Member[]
    const genNum = parseInt(selectedMember.generation || '0', 10) || 0
    const genWord = selectedMember.generation_word || ''

    return (
      <div className="h-full flex flex-col bg-white">
        <div className="shrink-0 flex items-center gap-4 p-4 bg-white border-b">
          <Button variant="ghost" onClick={() => setView('toc')} className="gap-1">
            <ArrowLeft className="w-4 h-4" />
            返回目录
          </Button>
          <div className="flex-1 text-center">
            <h2 className="text-lg font-semibold text-zinc-800">{familyName || '家族'}祖谱</h2>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div
            className="mx-auto bg-white border border-zinc-300 shadow-sm"
            style={{ width: '190mm', minHeight: '276mm', padding: '15mm 20mm' }}
          >
            {/* 头部信息 */}
            <div className="text-center mb-8 pb-4 border-b border-zinc-300">
              <h3 className="text-3xl font-bold text-zinc-900 tracking-widest">
                {selectedMember.name}
              </h3>
              {selectedMember.is_deceased && (
                <span className="inline-block mt-1 text-sm text-zinc-500">（故）</span>
              )}
              <div className="text-sm text-zinc-500 mt-2">
                {genNum > 0 && genWord ? `第${genNum}代 · ${genWord}` : genWord || `第${genNum}代`}
              </div>
            </div>

            {/* 基本信息表格 */}
            <div className="mb-6">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-zinc-100">
                    <td className="py-2 text-zinc-500 w-20">性别</td>
                    <td className="py-2 text-zinc-800">{selectedMember.gender === 'male' ? '男' : '女'}</td>
                  </tr>
                  {(selectedMember.birth_date || selectedMember.death_date) && (
                    <tr className="border-b border-zinc-100">
                      <td className="py-2 text-zinc-500">生卒</td>
                      <td className="py-2 text-zinc-800">
                        {selectedMember.birth_date || '未知'}
                        {selectedMember.death_date && ` ～ ${selectedMember.death_date}`}
                      </td>
                    </tr>
                  )}
                  {selectedMember.birth_place && (
                    <tr className="border-b border-zinc-100">
                      <td className="py-2 text-zinc-500">籍贯</td>
                      <td className="py-2 text-zinc-800">{selectedMember.birth_place}</td>
                    </tr>
                  )}
                  {selectedMember.occupation && (
                    <tr className="border-b border-zinc-100">
                      <td className="py-2 text-zinc-500">职业</td>
                      <td className="py-2 text-zinc-800">{selectedMember.occupation}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 家族关系 */}
            {(fatherInfo || motherInfo || spouseInfo.length > 0 || childrenInfo.length > 0) && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-zinc-700 mb-2 border-b border-zinc-200 pb-1">家族关系</h4>
                <div className="text-sm space-y-1">
                  {fatherInfo && (
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500 w-12">父亲</span>
                      <span
                        className="text-zinc-800 cursor-pointer hover:text-amber-600 underline"
                        onClick={() => handleViewDetail(fatherInfo)}
                      >
                        {fatherInfo.name}
                      </span>
                    </div>
                  )}
                  {motherInfo && (
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500 w-12">母亲</span>
                      <span
                        className="text-zinc-800 cursor-pointer hover:text-amber-600 underline"
                        onClick={() => handleViewDetail(motherInfo)}
                      >
                        {motherInfo.name}
                      </span>
                    </div>
                  )}
                  {spouseInfo.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500 w-12">配偶</span>
                      <span className="text-zinc-800">
                        {spouseInfo.map(s => {
                          const spouseMember = memberMap.get(s.id)
                          return spouseMember ? (
                            <span
                              key={s.id}
                              className="cursor-pointer hover:text-amber-600 underline"
                              onClick={() => handleViewDetail(spouseMember)}
                            >
                              {s.name}
                            </span>
                          ) : (
                            <span key={s.id}>{s.name}</span>
                          )
                        }).reduce((acc: React.ReactNode[], el, i, arr) => {
                          return acc.concat(el as React.ReactNode).concat(i < arr.length - 1 ? '、' : [])
                        }, [])}
                      </span>
                    </div>
                  )}
                  {childrenInfo.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500 w-12">子女</span>
                      <span className="text-zinc-800">
                        {childrenInfo.map(c => (
                          <span
                            key={c.id}
                            className="cursor-pointer hover:text-amber-600 underline"
                            onClick={() => handleViewDetail(c)}
                          >
                            {c.name}
                          </span>
                        )).reduce((acc: React.ReactNode[], el, i, arr) => {
                          return acc.concat(el as React.ReactNode).concat(i < arr.length - 1 ? '、' : [])
                        }, [])}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 生平简介 */}
            {selectedMember.biography && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-zinc-700 mb-2 border-b border-zinc-200 pb-1">生平简介</h4>
                <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">{selectedMember.biography}</p>
              </div>
            )}

            {/* 主要成就 */}
            {selectedMember.remarkable_deeds && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-zinc-700 mb-2 border-b border-zinc-200 pb-1">主要成就</h4>
                <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">{selectedMember.remarkable_deeds}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // 分册管理页
  const renderVolume = () => {
    return (
      <div className="h-full flex flex-col bg-white">
        <div className="shrink-0 flex items-center justify-between gap-4 p-4 bg-white border-b">
          <Button variant="ghost" onClick={() => setView('cover')} className="gap-1">
            <ArrowLeft className="w-4 h-4" />
            返回封面
          </Button>
          <div className="flex-1 text-center">
            <h2 className="text-lg font-semibold text-amber-900">分册导出</h2>
          </div>
          {exportSuccess && (
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 animate-fade-in">
              <span className="font-medium">{exportSuccess}</span>
              <button onClick={() => setExportSuccess(null)} className="hover:text-emerald-900">×</button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportAllVolumes}
              disabled={exportingVolume !== null || volumeRanges.length === 0}
              className="gap-1"
            >
              {exportingVolume ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              导出全部
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* 统计信息 */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-amber-800">
                    共 <span className="font-bold">{allMembersSorted.length}</span> 名族人，
                    分为 <span className="font-bold">{allGenerations.length}</span> 代
                  </p>
                  {exportingVolume && (
                    <p className="text-sm text-emerald-600 mt-1">
                      正在导出：第 {volumeRanges.findIndex(v => v.id === exportingVolume) + 1} 册 ({exportingProgress.current}/{exportingProgress.total})
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={addVolume}
                  disabled={exportingVolume !== null}
                  className="gap-1 bg-amber-600 hover:bg-amber-700"
                >
                  <Plus className="w-4 h-4" />
                  添加分册
                </Button>
              </div>
            </div>

            {/* 进度条 */}
            {exportingVolume && (
              <div className="bg-white border border-amber-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-amber-800">导出进度</span>
                  <span className="text-sm text-amber-600">
                    {exportingProgress.current} / {exportingProgress.total} 页
                  </span>
                </div>
                <div className="w-full bg-amber-100 rounded-full h-2">
                  <div
                    className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(exportingProgress.current / exportingProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* 分册列表 */}
            <div className="space-y-4">
              {volumeRanges.map((volume, index) => {
                const volumeMembers = getMembersForVolume(volume)
                const isCurrentExporting = exportingVolume === volume.id
                return (
                  <div
                    key={volume.id}
                    className={`border rounded-lg p-4 bg-white ${isCurrentExporting ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-amber-200'}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <FileText className={`w-5 h-5 ${isCurrentExporting ? 'text-emerald-600' : 'text-amber-600'}`} />
                        <span className={`font-medium ${isCurrentExporting ? 'text-emerald-900' : 'text-amber-900'}`}>
                          第 {index + 1} 册
                          {isCurrentExporting && <span className="ml-1 text-xs text-emerald-600">(导出中...)</span>}
                        </span>
                        <Badge variant="outline" className="text-amber-700 border-amber-300">
                          {volumeMembers.length} 人
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            handleExportVolume(volume)
                          }}
                          disabled={exportingVolume !== null || volumeMembers.length === 0}
                          className="gap-1 text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                        >
                          {isCurrentExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          {isCurrentExporting ? '导出中' : '导出'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeVolume(volume.id)}
                          disabled={exportingVolume !== null}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-zinc-600">起始代数：</label>
                        <Input
                          type="number"
                          min={1}
                          value={volume.startGen}
                          onChange={(e) => updateVolume(volume.id, 'startGen', parseInt(e.target.value) || 1)}
                          disabled={exportingVolume !== null}
                          className="w-20 h-8"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-zinc-600">结束代数：</label>
                        <Input
                          type="number"
                          min={1}
                          value={volume.endGen}
                          onChange={(e) => updateVolume(volume.id, 'endGen', parseInt(e.target.value) || 1)}
                          disabled={exportingVolume !== null}
                          className="w-20 h-8"
                        />
                      </div>
                      <span className="text-sm text-zinc-500">
                        （第 {volume.startGen} 代 ~ 第 {volume.endGen} 代）
                      </span>
                    </div>

                    {volumeMembers.length > 0 && (
                      <div className="mt-3 text-xs text-zinc-500">
                        包含成员：{volumeMembers.slice(0, 5).map(m => m.name).join('、')}
                        {volumeMembers.length > 5 && `...等${volumeMembers.length}人`}
                      </div>
                    )}
                  </div>
                )
              })}

              {volumeRanges.length === 0 && (
                <div className="text-center py-12 text-zinc-500">
                  <p>暂无分册配置</p>
                  <p className="text-sm mt-1">点击「添加分册」开始配置</p>
                </div>
              )}
            </div>
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
      {view === 'volume' && renderVolume()}
    </div>
  )
}