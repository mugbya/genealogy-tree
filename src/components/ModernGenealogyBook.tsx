import React, { useMemo, useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import type { Member, MemberRelation } from '@/api/client'
import { ArrowLeft, Download, Loader2, BookOpen, Plus, Trash2, FileText } from 'lucide-react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

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
  const handleExportPdf = async () => {
    setIsExporting(true)
    try {
      // 确保字体加载
      try {
        await document.fonts.ready
      } catch (e) {
        console.warn('Font loading skipped:', e)
      }

      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()

      // 创建隐藏的渲染容器
      const container = document.createElement('div')
      container.style.cssText = 'position: fixed; left: 0; top: 0; width: 595px; min-height: 842px; background: white; font-family: "Source Han Sans CN", "Noto Sans SC", sans-serif; z-index: -1; opacity: 0;'
      document.body.appendChild(container)

      // 辅助函数：渲染HTML到canvas并添加到PDF
      const renderToPdf = async (html: string, pageNum: number): Promise<boolean> => {
        // 清除之前的内容
        container.innerHTML = ''
        container.innerHTML = html

        // 等待DOM渲染完成
        await new Promise(r => setTimeout(r, 800))

        const element = container.firstElementChild as HTMLElement
        if (!element) {
          console.error('No element found in container')
          return false
        }

        // 确保元素有实际内容
        const rect = element.getBoundingClientRect()
        console.log(`Page ${pageNum} - Element rect:`, rect.width, rect.height)

        if (rect.width === 0 || rect.height === 0) {
          console.error('Element has no dimensions')
          return false
        }

        try {
          const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff'
          })
          const image = canvas.toDataURL('image/png')
          console.log(`Page ${pageNum} - Canvas created, size:`, canvas.width, canvas.height)

          // 第一页（封面）不需要addPage，jsPDF自动创建了第一页
          // 从第二页开始，每次都需要addPage
          if (pageNum > 1) {
            pdf.addPage()
          }
          pdf.addImage(image, 'PNG', 0, 0, pageWidth, pageHeight)
          console.log(`Page ${pageNum} added successfully`)
          return true
        } catch (err) {
          console.error('html2canvas error:', err)
          return false
        }
      }

      // 1. 渲染封面页 - 简化设计，打印友好
      const coverHtml = `
        <div style="width: 595px; height: 842px; background: white;">
          <table style="width: 100%; height: 100%; border-collapse: collapse;">
            <tr>
              <td style="text-align: center; vertical-align: middle;">
                <div style="font-size: 56px; color: #333; margin-top: 40px; font-weight: bold;">${familyName || '某某家族'}</div>
                <div style="font-size: 32px; color: #333; margin-top: 10px;">祖 谱</div>
                <div style="font-size: 20px; color: #666; margin-top: 40px;">— 现代版 —</div>
                <div style="font-size: 18px; color: #333; margin-top: 30px; font-style: italic;">${familyMaxim || '传承家族文化  弘扬优良家风'}</div>
                <div style="font-size: 14px; color: #666; margin-top: 20px;">始祖源地：${familyOrigin || '源远流长'}</div>
                <div style="font-size: 16px; color: #333; margin-top: 60px;">共录 ${allMembersSorted.length} 名族人</div>
                <div style="font-size: 14px; color: #666; margin-top: 5px;">传承 ${membersByGeneration.length} 代</div>
              </td>
            </tr>
          </table>
        </div>
      `
      console.log('Rendering cover page...')
      const coverSuccess = await renderToPdf(coverHtml, 1)
      console.log('Cover page result:', coverSuccess)

      // 2. 渲染索引页 - 简化设计
      const indexHtml = `
        <div style="width: 595px; min-height: 842px; background: white; padding: 40px;">
          <h1 style="text-align: center; font-size: 28px; color: #333; margin-bottom: 20px;">${familyName || '某某家族'} 成员索引</h1>
          <div style="height: 2px; background: #333; margin-bottom: 30px;"></div>
          <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 1px solid #333;">
                <th style="text-align: left; padding: 8px 4px; color: #333;">页码</th>
                <th style="text-align: left; padding: 8px 4px; color: #333;">代数</th>
                <th style="text-align: left; padding: 8px 4px; color: #333;">字辈</th>
                <th style="text-align: left; padding: 8px 4px; color: #333;">姓名</th>
                <th style="text-align: left; padding: 8px 4px; color: #333;">生年</th>
              </tr>
            </thead>
            <tbody>
              ${allMembersSorted.map((m, i) => {
                const page = i + 3
                const genNum = parseInt(m.generation || '0', 10) || 0
                const genWord = m.generation_word || ''
                return `<tr style="border-bottom: 1px dashed #ccc;">
                  <td style="padding: 8px 4px; color: #333;">第${page}页</td>
                  <td style="padding: 8px 4px; color: #333;">${genNum > 0 ? '第' + genNum + '代' : '-'}</td>
                  <td style="padding: 8px 4px; color: #666;">${genWord}</td>
                  <td style="padding: 8px 4px; color: #333;">${m.name}</td>
                  <td style="padding: 8px 4px; color: #666;">${m.birth_date?.substring(0, 4) || '-'}</td>
                </tr>`
              }).join('')}
            </tbody>
          </table>
          <div style="margin-top: 40px; text-align: center; font-size: 14px; color: #666;">
            共 ${allMembersSorted.length} 名族人，分为 ${allMembersSorted.length + 2} 页记载
          </div>
        </div>
      `
      console.log('Rendering index page...')
      const indexSuccess = await renderToPdf(indexHtml, 2)
      console.log('Index page result:', indexSuccess)

      // 3. 渲染每个成员的详情页（每人单独一页，白底打印友好）
      for (let i = 0; i < allMembersSorted.length; i++) {
        const m = allMembersSorted[i]
        const rels = memberRelations.get(m.id)
        const genNum = parseInt(m.generation || '0', 10) || 0
        const genWord = m.generation_word || ''
        const memberMap = new Map(members.map(m => [m.id, m]))
        const fatherInfo = rels?.father ? memberMap.get(rels.father.id) : null
        const motherInfo = rels?.mother ? memberMap.get(rels.mother.id) : null
        const spouseInfo = rels?.spouses || []
        const childrenInfo = (rels?.children || []).map(c => memberMap.get(c.id)).filter((c): c is Member => c !== undefined)

        const memberHtml = `
          <div style="width: 595px; height: 842px; background: white; padding: 40px; box-sizing: border-box; position: relative;">
            <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px solid #333;">
              <h3 style="font-size: 36px; color: #333; margin: 0; letter-spacing: 4px;">${m.name}</h3>
              ${m.is_deceased ? '<div style="font-size: 14px; color: #999; margin-top: 8px;">（故）</div>' : ''}
              <div style="font-size: 14px; color: #666; margin-top: 8px;">${genNum > 0 && genWord ? '第' + genNum + '代 · ' + genWord : genWord || '第' + genNum + '代'}</div>
            </div>

            <div style="padding-bottom: 60px;">
              <table style="width: 100%; font-size: 14px; border-collapse: collapse; margin-bottom: 30px;">
                <tr><td style="padding: 8px 4px; color: #666; width: 60px;">性别</td><td style="padding: 8px 4px; color: #333;">${m.gender === 'male' ? '男' : '女'}</td></tr>
                ${(m.birth_date || m.death_date) ? '<tr><td style="padding: 8px 4px; color: #666;">生卒</td><td style="padding: 8px 4px; color: #333;">' + (m.birth_date || '未知') + (m.death_date ? ' ～ ' + m.death_date : '') + '</td></tr>' : ''}
                ${m.birth_place ? '<tr><td style="padding: 8px 4px; color: #666;">籍贯</td><td style="padding: 8px 4px; color: #333;">' + m.birth_place + '</td></tr>' : ''}
                ${m.occupation ? '<tr><td style="padding: 8px 4px; color: #666;">职业</td><td style="padding: 8px 4px; color: #333;">' + m.occupation + '</td></tr>' : ''}
              </table>

              ${(fatherInfo || motherInfo || spouseInfo.length > 0 || childrenInfo.length > 0) ? '<div style="margin-bottom: 30px;"><h4 style="font-size: 14px; font-weight: bold; color: #333; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 1px solid #333;">家族关系</h4><div style="font-size: 14px; color: #333;">' + (fatherInfo ? '<div>父亲: ' + fatherInfo.name + '</div>' : '') + (motherInfo ? '<div>母亲: ' + motherInfo.name + '</div>' : '') + (spouseInfo.length > 0 ? '<div>配偶: ' + spouseInfo.map(s => s.name).join('、') + '</div>' : '') + (childrenInfo.length > 0 ? '<div>子女: ' + childrenInfo.map(c => c.name).join('、') + '</div>' : '') + '</div></div>' : ''}

              ${m.biography ? '<div style="margin-bottom: 30px;"><h4 style="font-size: 14px; font-weight: bold; color: #333; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 1px solid #333;">生平简介</h4><p style="font-size: 14px; color: #333; margin: 0;">' + m.biography + '</p></div>' : ''}

              ${m.remarkable_deeds ? '<div style="margin-bottom: 30px;"><h4 style="font-size: 14px; font-weight: bold; color: #333; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 1px solid #333;">主要成就</h4><p style="font-size: 14px; color: #333; margin: 0;">' + m.remarkable_deeds + '</p></div>' : ''}
            </div>

            <div style="position: absolute; bottom: 40px; left: 0; right: 0; text-align: center; font-size: 12px; color: #999;">${familyName || '家族'}族谱 · 第${i + 3}页</div>
          </div>
        `
        console.log('Rendering member page:', m.name)
        const memberSuccess = await renderToPdf(memberHtml, i + 3)
        console.log('Member page result:', memberSuccess)
      }

      // 清理
      document.body.removeChild(container)

      console.log('PDF exported with', pdf.getNumberOfPages(), 'pages')
      pdf.save(`${familyName || '家族'}祖谱.pdf`)
    } catch (error) {
      console.error('Export failed:', error)
      alert('导出失败，请重试')
    } finally {
      setIsExporting(false)
    }
  }

  // 导出单册PDF
  const handleExportVolume = async (volume: VolumeRange) => {
    const volumeMembers = getMembersForVolume(volume)
    if (volumeMembers.length === 0) {
      alert('该册没有成员，请调整代数范围')
      return
    }

    setIsExporting(true)
    try {
      await document.fonts.ready
    } catch (e) {
      console.warn('Font loading skipped:', e)
    }

    try {
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()

      const container = document.createElement('div')
      container.style.cssText = 'position: fixed; left: 0; top: 0; width: 595px; min-height: 842px; background: white; font-family: "Source Han Sans CN", "Noto Sans SC", sans-serif; z-index: -1; opacity: 0;'
      document.body.appendChild(container)

      const renderToPdf = async (html: string, pageNum: number): Promise<boolean> => {
        container.innerHTML = ''
        container.innerHTML = html
        await new Promise(r => setTimeout(r, 800))

        const element = container.firstElementChild as HTMLElement
        if (!element) return false

        const rect = element.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) return false

        try {
          const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff'
          })
          const image = canvas.toDataURL('image/png')

          if (pageNum > 1) {
            pdf.addPage()
          }
          pdf.addImage(image, 'PNG', 0, 0, pageWidth, pageHeight)
          return true
        } catch (err) {
          console.error('html2canvas error:', err)
          return false
        }
      }

      const volumeTitle = `第${volume.startGen}至${volume.endGen}代`

      // 封面
      const coverHtml = `
        <div style="width: 595px; height: 842px; background: white;">
          <table style="width: 100%; height: 100%; border-collapse: collapse;">
            <tr>
              <td style="text-align: center; vertical-align: middle;">
                <div style="font-size: 56px; color: #333; margin-top: 40px; font-weight: bold;">${familyName || '某某家族'}</div>
                <div style="font-size: 32px; color: #333; margin-top: 10px;">祖 谱</div>
                <div style="font-size: 24px; color: #666; margin-top: 20px;">（${volumeTitle}）</div>
                <div style="font-size: 20px; color: #333; margin-top: 30px;">— 现代版 —</div>
                <div style="font-size: 18px; color: #333; margin-top: 30px; font-style: italic;">${familyMaxim || '传承家族文化  弘扬优良家风'}</div>
                <div style="font-size: 14px; color: #666; margin-top: 20px;">始祖源地：${familyOrigin || '源远流长'}</div>
                <div style="font-size: 16px; color: #333; margin-top: 60px;">共录 ${volumeMembers.length} 名族人</div>
                <div style="font-size: 14px; color: #666; margin-top: 5px;">本册记载 ${volume.startGen}-${volume.endGen} 代</div>
              </td>
            </tr>
          </table>
        </div>
      `
      await renderToPdf(coverHtml, 1)

      // 索引页
      const indexHtml = `
        <div style="width: 595px; min-height: 842px; background: white; padding: 40px;">
          <h1 style="text-align: center; font-size: 28px; color: #333; margin-bottom: 20px;">${familyName || '某某家族'} 成员索引（${volumeTitle}）</h1>
          <div style="height: 2px; background: #333; margin-bottom: 30px;"></div>
          <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 1px solid #333;">
                <th style="text-align: left; padding: 8px 4px; color: #333;">页码</th>
                <th style="text-align: left; padding: 8px 4px; color: #333;">代数</th>
                <th style="text-align: left; padding: 8px 4px; color: #333;">字辈</th>
                <th style="text-align: left; padding: 8px 4px; color: #333;">姓名</th>
                <th style="text-align: left; padding: 8px 4px; color: #333;">生年</th>
              </tr>
            </thead>
            <tbody>
              ${volumeMembers.map((m, i) => {
                const page = i + 3
                const genNum = parseInt(m.generation || '0', 10) || 0
                const genWord = m.generation_word || ''
                return `<tr style="border-bottom: 1px dashed #ccc;">
                  <td style="padding: 8px 4px; color: #333;">第${page}页</td>
                  <td style="padding: 8px 4px; color: #333;">${genNum > 0 ? '第' + genNum + '代' : '-'}</td>
                  <td style="padding: 8px 4px; color: #666;">${genWord}</td>
                  <td style="padding: 8px 4px; color: #333;">${m.name}</td>
                  <td style="padding: 8px 4px; color: #666;">${m.birth_date?.substring(0, 4) || '-'}</td>
                </tr>`
              }).join('')}
            </tbody>
          </table>
          <div style="margin-top: 40px; text-align: center; font-size: 14px; color: #666;">
            共 ${volumeMembers.length} 名族人，分为 ${volumeMembers.length + 2} 页记载
          </div>
        </div>
      `
      await renderToPdf(indexHtml, 2)

      // 成员详情页
      for (let i = 0; i < volumeMembers.length; i++) {
        const m = volumeMembers[i]
        const rels = memberRelations.get(m.id)
        const genNum = parseInt(m.generation || '0', 10) || 0
        const genWord = m.generation_word || ''
        const memberMap = new Map(members.map(m => [m.id, m]))
        const fatherInfo = rels?.father ? memberMap.get(rels.father.id) : null
        const motherInfo = rels?.mother ? memberMap.get(rels.mother.id) : null
        const spouseInfo = rels?.spouses || []
        const childrenInfo = (rels?.children || []).map(c => memberMap.get(c.id)).filter((c): c is Member => c !== undefined)

        const memberHtml = `
          <div style="width: 595px; height: 842px; background: white; padding: 40px; box-sizing: border-box; position: relative;">
            <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px solid #333;">
              <h3 style="font-size: 36px; color: #333; margin: 0; letter-spacing: 4px;">${m.name}</h3>
              ${m.is_deceased ? '<div style="font-size: 14px; color: #999; margin-top: 8px;">（故）</div>' : ''}
              <div style="font-size: 14px; color: #666; margin-top: 8px;">${genNum > 0 && genWord ? '第' + genNum + '代 · ' + genWord : genWord || '第' + genNum + '代'}</div>
            </div>

            <div style="padding-bottom: 60px;">
              <table style="width: 100%; font-size: 14px; border-collapse: collapse; margin-bottom: 30px;">
                <tr><td style="padding: 8px 4px; color: #666; width: 60px;">性别</td><td style="padding: 8px 4px; color: #333;">${m.gender === 'male' ? '男' : '女'}</td></tr>
                ${(m.birth_date || m.death_date) ? '<tr><td style="padding: 8px 4px; color: #666;">生卒</td><td style="padding: 8px 4px; color: #333;">' + (m.birth_date || '未知') + (m.death_date ? ' ～ ' + m.death_date : '') + '</td></tr>' : ''}
                ${m.birth_place ? '<tr><td style="padding: 8px 4px; color: #666;">籍贯</td><td style="padding: 8px 4px; color: #333;">' + m.birth_place + '</td></tr>' : ''}
                ${m.occupation ? '<tr><td style="padding: 8px 4px; color: #666;">职业</td><td style="padding: 8px 4px; color: #333;">' + m.occupation + '</td></tr>' : ''}
              </table>

              ${(fatherInfo || motherInfo || spouseInfo.length > 0 || childrenInfo.length > 0) ? '<div style="margin-bottom: 30px;"><h4 style="font-size: 14px; font-weight: bold; color: #333; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 1px solid #333;">家族关系</h4><div style="font-size: 14px; color: #333;">' + (fatherInfo ? '<div>父亲: ' + fatherInfo.name + '</div>' : '') + (motherInfo ? '<div>母亲: ' + motherInfo.name + '</div>' : '') + (spouseInfo.length > 0 ? '<div>配偶: ' + spouseInfo.map(s => s.name).join('、') + '</div>' : '') + (childrenInfo.length > 0 ? '<div>子女: ' + childrenInfo.map(c => c.name).join('、') + '</div>' : '') + '</div></div>' : ''}

              ${m.biography ? '<div style="margin-bottom: 30px;"><h4 style="font-size: 14px; font-weight: bold; color: #333; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 1px solid #333;">生平简介</h4><p style="font-size: 14px; color: #333; margin: 0;">' + m.biography + '</p></div>' : ''}

              ${m.remarkable_deeds ? '<div style="margin-bottom: 30px;"><h4 style="font-size: 14px; font-weight: bold; color: #333; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 1px solid #333;">主要成就</h4><p style="font-size: 14px; color: #333; margin: 0;">' + m.remarkable_deeds + '</p></div>' : ''}
            </div>

            <div style="position: absolute; bottom: 40px; left: 0; right: 0; text-align: center; font-size: 12px; color: #999;">${familyName || '家族'}族谱 · ${volumeTitle} · 第${i + 3}页</div>
          </div>
        `
        await renderToPdf(memberHtml, i + 3)
      }

      document.body.removeChild(container)
      pdf.save(`${familyName || '家族'}祖谱（${volumeTitle}）.pdf`)
    } catch (error) {
      console.error('Export failed:', error)
      alert('导出失败，请重试')
    } finally {
      setIsExporting(false)
    }
  }

  // 导出全部（分册）
  const handleExportAllVolumes = async () => {
    if (volumeRanges.length === 0) {
      alert('请先配置分册')
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportAllVolumes}
              disabled={isExporting || volumeRanges.length === 0}
              className="gap-1"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
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
                </div>
                <Button
                  size="sm"
                  onClick={addVolume}
                  className="gap-1 bg-amber-600 hover:bg-amber-700"
                >
                  <Plus className="w-4 h-4" />
                  添加分册
                </Button>
              </div>
            </div>

            {/* 分册列表 */}
            <div className="space-y-4">
              {volumeRanges.map((volume, index) => {
                const volumeMembers = getMembersForVolume(volume)
                return (
                  <div
                    key={volume.id}
                    className="border border-amber-200 rounded-lg p-4 bg-white"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-amber-600" />
                        <span className="font-medium text-amber-900">
                          第 {index + 1} 册
                        </span>
                        <Badge variant="outline" className="text-amber-700 border-amber-300">
                          {volumeMembers.length} 人
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleExportVolume(volume)}
                          disabled={isExporting || volumeMembers.length === 0}
                          className="gap-1 text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                        >
                          {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                          导出
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeVolume(volume.id)}
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