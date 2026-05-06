import React, { useMemo, useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import type { Member, MemberRelation } from '@/api/client'
import { licenseApi, exportApi } from '@/api/client'
import { ArrowLeft, BookOpen, Plus, Trash2, FileText, AlertTriangle } from 'lucide-react'

interface ModernGenealogyBookProps {
  familyName: string
  familySurname: string
  familyOrigin: string
  familyMaxim: string
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
  members,
  relations,
}: ModernGenealogyBookProps) {
  const [view, setView] = useState<ViewState>('cover')
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const coverRef = useRef<HTMLDivElement>(null)
  const tocRef = useRef<HTMLDivElement>(null)

  // 导出成功提示
  const [exportSuccess, setExportSuccess] = useState<string | null>(null)

  // 分册配置状态
  const [volumeRanges, setVolumeRanges] = useState<VolumeRange[]>([])

  // 授权功能状态
  const [licenseFeatures, setLicenseFeatures] = useState({
    exportHtml: false,
    exportWord: false,
    exportVolume: false,
  })
  const [licenseValid, setLicenseValid] = useState(false)
  const [isTrial, setIsTrial] = useState(false)
  const [remainingDays, setRemainingDays] = useState<number | null>(null)

  // 检查授权功能
  useEffect(() => {
    const checkLicenseFeatures = async () => {
      try {
        // Get license info first to check trial status
        const infoResult = await licenseApi.getInfo()
        const info = infoResult.data

        // Check export_html feature
        const htmlResult = await licenseApi.checkFeature('export_html')
        // Check export_volume feature
        const volumeResult = await licenseApi.checkFeature('export_volume')

        setLicenseFeatures({
          exportHtml: htmlResult.data?.allowed ?? false,
          exportWord: false, // Word export not yet implemented
          exportVolume: volumeResult.data?.allowed ?? false,
        })
        setLicenseValid(htmlResult.data?.is_valid ?? false)

        // Set trial status
        setIsTrial(info?.is_trial ?? false)
        setRemainingDays(info?.remaining_days ?? null)
      } catch (err) {
        console.error('检查授权失败:', err)
        // On error, assume not licensed
        setLicenseFeatures({
          exportHtml: false,
          exportWord: false,
          exportVolume: false,
        })
        setLicenseValid(false)
        setIsTrial(false)
        setRemainingDays(null)
      }
    }

    checkLicenseFeatures()
  }, [])

  // 提前计算 ownFamilyMembers 避免重复 filter
  const ownFamilyMembers = useMemo(() => {
    if (!familySurname) return members
    return members.filter(m => !m.surname || m.surname === familySurname)
  }, [members, familySurname])

  // 构建成员关系
  const memberRelations = useMemo(() => {
    if (members.length === 0) return new Map()

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

    // 一次性过滤减少遍历
    const parentRelations = relations.filter(r => r.relation_type === 'father' || r.relation_type === 'mother')
    const spouseRelations = relations.filter(r => r.relation_type === 'spouse')

    // 构建父子关系
    for (const rel of parentRelations) {
      const entry = result.get(rel.from_member_id)
      if (!entry) continue
      const parent = memberMap.get(rel.to_member_id)
      if (!parent) continue
      if (rel.relation_type === 'father') {
        entry.father = { id: parent.id, name: parent.name }
      } else if (rel.relation_type === 'mother') {
        entry.mother = { id: parent.id, name: parent.name }
      }
    }

    // 构建配偶关系
    for (const rel of spouseRelations) {
      if (rel.from_member_id === rel.to_member_id) continue
      const member = memberMap.get(rel.from_member_id)
      const spouse = memberMap.get(rel.to_member_id)
      if (!member || !spouse) continue

      const memberEntry = result.get(member.id)
      const spouseEntry = result.get(spouse.id)
      if (!memberEntry || !spouseEntry) continue

      if (!memberEntry.spouses.find(s => s.id === spouse.id)) {
        memberEntry.spouses.push({ id: spouse.id, name: spouse.name, tag: rel.tag_name })
      }
      if (!spouseEntry.spouses.find(s => s.id === member.id)) {
        spouseEntry.spouses.push({ id: member.id, name: member.name, tag: rel.tag_name })
      }
    }

    // 构建子女关系
    for (const rel of parentRelations) {
      const entry = result.get(rel.to_member_id)
      if (!entry) continue
      const child = memberMap.get(rel.from_member_id)
      if (!child) continue
      if (!entry.children.find(c => c.id === child.id)) {
        entry.children.push({ id: child.id, name: child.name })
      }
    }

    return result
  }, [members, relations])

  // 按代数分组
  const membersByGeneration = useMemo(() => {
    if (ownFamilyMembers.length === 0) return []

    const memberMap = new Map(members.map(m => [m.id, m]))
    const relMap = memberRelations

    const getGeneration = (memberId: number): number => {
      const member = memberMap.get(memberId)
      if (member?.generation) {
        const genNum = parseInt(member.generation, 10)
        if (!isNaN(genNum) && genNum > 0) return genNum
      }
      // 递归查找祖先
      const visited = new Set<number>()
      const getAncestors = (mid: number, depth: number): number => {
        if (visited.has(mid)) return depth
        visited.add(mid)
        const r = relMap.get(mid)
        if (!r?.father) return depth
        return getAncestors(r.father.id, depth + 1)
      }
      return getAncestors(memberId, 1)
    }

    const byGen = new Map<number, Member[]>()
    for (const m of ownFamilyMembers) {
      const gen = getGeneration(m.id)
      if (!byGen.has(gen)) byGen.set(gen, [])
      byGen.get(gen)!.push(m)
    }

    const sortedGens = Array.from(byGen.keys()).sort((a, b) => a - b)
    return sortedGens.map(gen => ({
      generation: gen,
      members: byGen.get(gen)!.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    }))
  }, [members, ownFamilyMembers, memberRelations])

  // 全部族人排序
  const allMembersSorted = useMemo(() => {
    return [...ownFamilyMembers].sort((a, b) => {
      const genA = parseInt(a.generation || '0', 10) || 0
      const genB = parseInt(b.generation || '0', 10) || 0
      if (genA !== genB) return genA - genB
      return (b.weight ?? 0) - (a.weight ?? 0)
    })
  }, [ownFamilyMembers])

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

  // 生成封面HTML
  const generateCoverHtml = (options: { volumeTitle?: string; memberCount: number; startGen?: number; endGen?: number } = { memberCount: 0 }) => {
    const { volumeTitle, memberCount, startGen, endGen } = options
    const isVolume = !!volumeTitle

    return `
<div style="width: 210mm; min-height: 285mm; margin: 0 auto; background: linear-gradient(to bottom, #fffbeb, #fff7ed); border: 4px solid #92400e; position: relative; font-family: 'Noto Sans SC', 'SimSun', sans-serif; box-sizing: border-box;">
  <!-- 装饰边框 -->
  <div style="position: absolute; inset: 2mm; border: 2px solid #92400e; pointer-events: none;"></div>
  <div style="position: absolute; inset: 8mm; border: 1px solid #d97706; pointer-events: none;"></div>

  <!-- 四角装饰 -->
  <div style="position: absolute; top: 4mm; left: 4mm; width: 8mm; height: 8mm;">
    <svg viewBox="0 0 40 40" style="width: 100%; height: 100%; color: #92400e;">
      <path d="M2 38 Q2 2 38 2" fill="none" stroke="currentColor" stroke-width="2"/>
      <circle cx="8" cy="8" r="3" fill="currentColor"/>
    </svg>
  </div>
  <div style="position: absolute; top: 4mm; right: 4mm; width: 8mm; height: 8mm; transform: rotate(90deg);">
    <svg viewBox="0 0 40 40" style="width: 100%; height: 100%; color: #92400e;">
      <path d="M2 38 Q2 2 38 2" fill="none" stroke="currentColor" stroke-width="2"/>
      <circle cx="8" cy="8" r="3" fill="currentColor"/>
    </svg>
  </div>
  <div style="position: absolute; bottom: 4mm; left: 4mm; width: 8mm; height: 8mm; transform: rotate(-90deg);">
    <svg viewBox="0 0 40 40" style="width: 100%; height: 100%; color: #92400e;">
      <path d="M2 38 Q2 2 38 2" fill="none" stroke="currentColor" stroke-width="2"/>
      <circle cx="8" cy="8" r="3" fill="currentColor"/>
    </svg>
  </div>
  <div style="position: absolute; bottom: 4mm; right: 4mm; width: 8mm; height: 8mm; transform: rotate(180deg);">
    <svg viewBox="0 0 40 40" style="width: 100%; height: 100%; color: #92400e;">
      <path d="M2 38 Q2 2 38 2" fill="none" stroke="currentColor" stroke-width="2"/>
      <circle cx="8" cy="8" r="3" fill="currentColor"/>
    </svg>
  </div>

  <!-- 徽章 -->
  <div style="display: flex; justify-content: center; padding-top: 30mm;">
    <div style="width: 50mm; height: 50mm; position: relative;">
      <div style="position: absolute; inset: 0; border-radius: 50%; border: 4px solid #92400e; background: linear-gradient(135deg, #fef3c7, #fde68a); box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <div style="position: absolute; inset: 4mm; border-radius: 50%; border: 2px solid #b45309; display: flex; align-items: center; justify-content: center;">
          <div style="font-size: 48px; color: #78350f; font-family: serif;">谱</div>
        </div>
      </div>
    </div>
  </div>

  <!-- 家族名称 -->
  <div style="text-align: center; padding: 0 15mm; margin-top: 10mm;">
    <h1 style="font-size: 36px; font-weight: bold; color: #78350f; letter-spacing: 4px; margin: 0 0 4px 0;">
      ${familyName || '某某家族'}
    </h1>
    <p style="font-size: 18px; color: #b45309; letter-spacing: 4px;">祖谱</p>

    <div style="display: flex; align-items: center; justify-content: center; gap: 5mm; margin: 8mm 0;">
      <div style="height: 1px; width: 25mm; background: linear-gradient(to right, transparent, #d97706);"></div>
      <div style="display: flex; gap: 2mm;">
        <span style="color: #d97706; font-size: 10px;">◆</span>
        <span style="color: #d97706;">◆</span>
        <span style="color: #d97706; font-size: 10px;">◆</span>
      </div>
      <div style="height: 1px; width: 25mm; background: linear-gradient(to left, transparent, #d97706);"></div>
    </div>

    <div style="display: inline-block; padding: 2mm 6mm; border: 1px solid #b45309; border-radius: 4px; background: #fffbeb;">
      <span style="font-size: 14px; color: #78350f;">现代版</span>
    </div>
  </div>

  <div style="margin: 8mm 15mm; padding: 4mm; background: rgba(254, 243, 199, 0.5); border: 1px solid #fcd34d; border-radius: 4px; text-align: center;">
    <p style="font-size: 14px; color: #78350f; font-style: italic; margin: 0;">
      ${familyMaxim || '传承家族文化  弘扬优良家风'}
    </p>
  </div>

  <div style="text-align: center; margin-top: 4mm; padding: 0 15mm;">
    <p style="font-size: 12px; color: #b45309;">
      始祖源地：${familyOrigin || '源远流长'}
    </p>
  </div>

  <div style="position: absolute; bottom: 25mm; left: 0; right: 0; text-align: center;">
    ${isVolume ? `<p style="font-size: 16px; color: #92400e; margin: 0 0 2mm 0;">（第 ${startGen} 代 ~ 第 ${endGen} 代）</p>` : ''}
    <p style="font-size: 14px; color: #b45309; margin: 0;">
      共录 <span style="font-weight: bold; color: #78350f;">${memberCount}</span> 名族人
    </p>
    <p style="font-size: 12px; color: #d97706; margin: 2mm 0 0 0;">
      ${isVolume ? `本册记载 ${volumeTitle}` : `传承 ${membersByGeneration.length} 代`}
    </p>
  </div>
</div>`
  }

  // 导出全部Word文档
  const handleExportFullWord = async () => {
    const memberMap = new Map(members.map(m => [m.id, m]))

    // 生成封面HTML
    const coverHtml = generateCoverHtml({
      memberCount: allMembersSorted.length
    })

    // 生成目录HTML（带样式）
    const tocHtml = `
<div style="width: 210mm; min-height: 297mm; margin: 0 auto; background: white; padding: 15mm 20mm; font-family: 'Noto Sans SC', 'SimSun', sans-serif; box-sizing: border-box;">
  <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #f59e0b;">
    <h1 style="font-size: 24px; font-weight: bold; color: #78350f; letter-spacing: 4px; margin: 0;">${familyName || '某某家族'}</h1>
    <p style="color: #b45309; font-size: 18px; margin: 4px 0 0 0;">成员索引</p>
  </div>
  <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
    <thead>
      <tr style="color: #78350f; border-bottom: 1px solid #fde68a;">
        <th style="text-align: left; padding: 8px 4px; font-weight: 500;">页码</th>
        <th style="text-align: left; padding: 8px 4px; font-weight: 500;">代数</th>
        <th style="text-align: left; padding: 8px 4px; font-weight: 500;">字辈</th>
        <th style="text-align: left; padding: 8px 4px; font-weight: 500;">姓名</th>
        <th style="text-align: left; padding: 8px 4px; font-weight: 500;">生年</th>
      </tr>
    </thead>
    <tbody>
      ${allMembersSorted.map((m, i) => {
        const genNum = parseInt(m.generation || '0', 10) || 0
        const genWord = m.generation_word || ''
        return `
        <tr style="color: #3f3f46; border-bottom: 1px solid #fef3c7;">
          <td style="padding: 8px 4px;">${i + 1}</td>
          <td style="padding: 8px 4px;">${genNum > 0 ? `第${genNum}代` : '-'}</td>
          <td style="padding: 8px 4px;">${genWord || '-'}</td>
          <td style="padding: 8px 4px;">${m.name}</td>
          <td style="padding: 8px 4px;">${m.birth_date?.substring(0, 4) || '-'}</td>
        </tr>`
      }).join('')}
    </tbody>
  </table>
</div>`

    // 生成成员详情HTML
    let membersHtml = ''
    allMembersSorted.forEach((m, index) => {
      const rels = memberRelations.get(m.id)
      const fatherInfo = rels?.father ? memberMap.get(rels.father.id) : null
      const motherInfo = rels?.mother ? memberMap.get(rels.mother.id) : null
      const spouseInfo = rels?.spouses || []
      const childrenInfo = (rels?.children || []).map((c: Member | undefined): c is Member => c !== undefined)
      const genNum = parseInt(m.generation || '0', 10) || 0
      const genWord = m.generation_word || ''

      membersHtml += `
        <div style="width: 210mm; min-height: 285mm; margin: 0 auto; background: white; padding: 20mm; font-family: 'Noto Sans SC', 'SimSun', sans-serif; box-sizing: border-box; page-break-after: always; position: relative;">
          <h1 style="font-size: 36px; text-align: center; color: #333; margin: 0 0 10px 0;">${m.name}${m.is_deceased ? '<span style="font-size: 14px; color: #999;">（故）</span>' : ''}</h1>
          <p style="font-size: 14px; color: #666; text-align: center; margin: 0 0 30px 0;">
            ${genNum > 0 && genWord ? `第${genNum}代 · ${genWord}` : (genWord || `第${genNum}代`)}
          </p>
          <hr style="border: none; border-top: 1px solid #333; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            ${m.gender ? `<tr><td style="padding: 8px; color: #666; width: 80px;">性别</td><td style="padding: 8px;">${m.gender === 'male' ? '男' : '女'}</td></tr>` : ''}
            ${m.birth_date || m.death_date ? `<tr><td style="padding: 8px; color: #666;">生卒</td><td style="padding: 8px;">${m.birth_date || '未知'}${m.death_date ? ` ～ ${m.death_date}` : ''}</td></tr>` : ''}
            ${m.birth_place ? `<tr><td style="padding: 8px; color: #666;">籍贯</td><td style="padding: 8px;">${m.birth_place}</td></tr>` : ''}
            ${m.occupation ? `<tr><td style="padding: 8px; color: #666;">职业</td><td style="padding: 8px;">${m.occupation}</td></tr>` : ''}
          </table>
          ${(fatherInfo || motherInfo || spouseInfo.length > 0 || childrenInfo.length > 0) ? `
          <div style="margin-top: 20px;">
            <h3 style="font-size: 16px; color: #333; margin: 0 0 10px 0;">家族关系</h3>
            <hr style="border: none; border-top: 1px solid #333; width: 60px; margin: 0 0 10px 0;">
            ${fatherInfo ? `<p style="font-size: 14px; margin: 5px 0;"><span style="color: #666;">父亲：</span>${fatherInfo.name}</p>` : ''}
            ${motherInfo ? `<p style="font-size: 14px; margin: 5px 0;"><span style="color: #666;">母亲：</span>${motherInfo.name}</p>` : ''}
            ${spouseInfo.length > 0 ? `<p style="font-size: 14px; margin: 5px 0;"><span style="color: #666;">配偶：</span>${spouseInfo.map(s => s.name).join('、')}</p>` : ''}
            ${childrenInfo.length > 0 ? `<p style="font-size: 14px; margin: 5px 0;"><span style="color: #666;">子女：</span>${childrenInfo.map(c => c.name).join('、')}</p>` : ''}
          </div>
          ` : ''}
          ${m.biography ? `
          <div style="margin-top: 20px;">
            <h3 style="font-size: 16px; color: #333; margin: 0 0 10px 0;">生平简介</h3>
            <hr style="border: none; border-top: 1px solid #333; width: 60px; margin: 0 0 10px 0;">
            <p style="font-size: 14px; line-height: 1.8; color: #333; margin: 0;">${m.biography}</p>
          </div>
          ` : ''}
          ${m.remarkable_deeds ? `
          <div style="margin-top: 20px;">
            <h3 style="font-size: 16px; color: #333; margin: 0 0 10px 0;">主要成就</h3>
            <hr style="border: none; border-top: 1px solid #333; width: 60px; margin: 0 0 10px 0;">
            <p style="font-size: 14px; line-height: 1.8; color: #333; margin: 0;">${m.remarkable_deeds}</p>
          </div>
          ` : ''}
          <p style="position: absolute; bottom: 20px; left: 0; right: 0; text-align: center; font-size: 12px; color: #999; margin: 0;">
            ${familyName || '家族'}族谱 · 第${index + 1}页
          </p>
        </div>`
    })

    // 生成完整HTML
    const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${familyName || '家族'}族谱</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Noto Sans SC', 'SimSun', sans-serif; }
  </style>
</head>
<body>
${coverHtml}
${tocHtml}
${membersHtml}
</body>
</html>`

    // 创建Blob并下载为Word格式
    const blob = new Blob([htmlContent], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${familyName || '家族'}族谱.doc`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    setExportSuccess('导出成功！已保存为 Word 文档')
  }

  // 导出全部HTML（调用后端API，后端进行授权校验）
  const handleExportFullHtml = async () => {
    const result = await exportApi.exportHtml()
    if (result.success) {
      setExportSuccess('导出成功！已保存为 HTML 文件')
    } else {
      setExportSuccess(null)
      window.alert(result.error || '导出失败')
    }
  }

  // 导出单册HTML
  const handleExportVolumeHtml = async (volume: VolumeRange) => {
    const result = await exportApi.exportHtmlVolume({
      start_generation: volume.startGen,
      end_generation: volume.endGen,
    })
    if (result.success) {
      setExportSuccess(`导出成功！已保存为 HTML 文件`)
    } else {
      setExportSuccess(null)
      window.alert(result.error || '导出失败')
    }
  }

  // 导出单册Word
  const handleExportVolumeWord = async (volume: VolumeRange) => {
    const volumeMembers = getMembersForVolume(volume)
    if (volumeMembers.length === 0) {
      window.alert('该册没有成员，请调整代数范围')
      return
    }

    const volumeTitle = `第${volume.startGen}至${volume.endGen}代`
    const memberMap = new Map(members.map(m => [m.id, m]))

    // 生成封面HTML（带分册信息）
    const coverHtml = generateCoverHtml({
      volumeTitle,
      memberCount: volumeMembers.length,
      startGen: volume.startGen,
      endGen: volume.endGen
    })

    // 生成索引页HTML
    const tocHtml = `
<div style="width: 210mm; min-height: 297mm; margin: 0 auto; background: white; padding: 15mm 20mm; font-family: 'Noto Sans SC', 'SimSun', sans-serif; box-sizing: border-box; page-break-after: always;">
  <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #f59e0b;">
    <h1 style="font-size: 24px; font-weight: bold; color: #78350f; letter-spacing: 4px; margin: 0;">${familyName || '某某家族'}</h1>
    <p style="color: #b45309; font-size: 18px; margin: 4px 0 0 0;">${volumeTitle} · 成员索引</p>
  </div>
  <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
    <thead>
      <tr style="color: #78350f; border-bottom: 1px solid #fde68a;">
        <th style="text-align: left; padding: 8px 4px; font-weight: 500;">页码</th>
        <th style="text-align: left; padding: 8px 4px; font-weight: 500;">代数</th>
        <th style="text-align: left; padding: 8px 4px; font-weight: 500;">字辈</th>
        <th style="text-align: left; padding: 8px 4px; font-weight: 500;">姓名</th>
        <th style="text-align: left; padding: 8px 4px; font-weight: 500;">生年</th>
      </tr>
    </thead>
    <tbody>
      ${volumeMembers.map((m, i) => {
        const genNum = parseInt(m.generation || '0', 10) || 0
        const genWord = m.generation_word || ''
        return `
        <tr style="color: #3f3f46; border-bottom: 1px solid #fef3c7;">
          <td style="padding: 8px 4px;">${i + 1}</td>
          <td style="padding: 8px 4px;">${genNum > 0 ? `第${genNum}代` : '-'}</td>
          <td style="padding: 8px 4px;">${genWord || '-'}</td>
          <td style="padding: 8px 4px;">${m.name}</td>
          <td style="padding: 8px 4px;">${m.birth_date?.substring(0, 4) || '-'}</td>
        </tr>`
      }).join('')}
    </tbody>
  </table>
</div>`

    // 生成成员详情HTML
    let membersHtml = ''
    volumeMembers.forEach((m, index) => {
      const rels = memberRelations.get(m.id)
      const fatherInfo = rels?.father ? memberMap.get(rels.father.id) : null
      const motherInfo = rels?.mother ? memberMap.get(rels.mother.id) : null
      const spouseInfo = rels?.spouses || []
      const childrenInfo = (rels?.children || []).map((c: Member | undefined): c is Member => c !== undefined)
      const genNum = parseInt(m.generation || '0', 10) || 0
      const genWord = m.generation_word || ''

      membersHtml += `
        <div class="member-card" style="page-break-after: always; padding: 20mm; font-family: 'Noto Sans SC', sans-serif;">
          <h1 style="font-size: 36px; text-align: center; color: #333; margin-bottom: 10px;">${m.name}${m.is_deceased ? '<span style="font-size: 14px; color: #999;">（故）</span>' : ''}</h1>
          <p style="font-size: 14px; color: #666; text-align: center; margin-bottom: 30px;">
            ${genNum > 0 && genWord ? `第${genNum}代 · ${genWord}` : (genWord || `第${genNum}代`)}
          </p>
          <hr style="border: none; border-top: 1px solid #333; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            ${m.gender ? `<tr><td style="padding: 8px; color: #666; width: 80px;">性别</td><td style="padding: 8px;">${m.gender === 'male' ? '男' : '女'}</td></tr>` : ''}
            ${m.birth_date || m.death_date ? `<tr><td style="padding: 8px; color: #666;">生卒</td><td style="padding: 8px;">${m.birth_date || '未知'}${m.death_date ? ` ～ ${m.death_date}` : ''}</td></tr>` : ''}
            ${m.birth_place ? `<tr><td style="padding: 8px; color: #666;">籍贯</td><td style="padding: 8px;">${m.birth_place}</td></tr>` : ''}
            ${m.occupation ? `<tr><td style="padding: 8px; color: #666;">职业</td><td style="padding: 8px;">${m.occupation}</td></tr>` : ''}
          </table>
          ${(fatherInfo || motherInfo || spouseInfo.length > 0 || childrenInfo.length > 0) ? `
          <div style="margin-top: 20px;">
            <h3 style="font-size: 16px; color: #333; margin-bottom: 10px;">家族关系</h3>
            <hr style="border: none; border-top: 1px solid #333; width: 60px; margin-bottom: 10px;">
            ${fatherInfo ? `<p style="font-size: 14px; margin: 5px 0;"><span style="color: #666;">父亲：</span>${fatherInfo.name}</p>` : ''}
            ${motherInfo ? `<p style="font-size: 14px; margin: 5px 0;"><span style="color: #666;">母亲：</span>${motherInfo.name}</p>` : ''}
            ${spouseInfo.length > 0 ? `<p style="font-size: 14px; margin: 5px 0;"><span style="color: #666;">配偶：</span>${spouseInfo.map(s => s.name).join('、')}</p>` : ''}
            ${childrenInfo.length > 0 ? `<p style="font-size: 14px; margin: 5px 0;"><span style="color: #666;">子女：</span>${childrenInfo.map(c => c.name).join('、')}</p>` : ''}
          </div>
          ` : ''}
          ${m.biography ? `
          <div style="margin-top: 20px;">
            <h3 style="font-size: 16px; color: #333; margin-bottom: 10px;">生平简介</h3>
            <hr style="border: none; border-top: 1px solid #333; width: 60px; margin-bottom: 10px;">
            <p style="font-size: 14px; line-height: 1.8; color: #333;">${m.biography}</p>
          </div>
          ` : ''}
          ${m.remarkable_deeds ? `
          <div style="margin-top: 20px;">
            <h3 style="font-size: 16px; color: #333; margin-bottom: 10px;">主要成就</h3>
            <hr style="border: none; border-top: 1px solid #333; width: 60px; margin-bottom: 10px;">
            <p style="font-size: 14px; line-height: 1.8; color: #333;">${m.remarkable_deeds}</p>
          </div>
          ` : ''}
          <p style="position: absolute; bottom: 20px; left: 0; right: 0; text-align: center; font-size: 12px; color: #999;">
            ${familyName || '家族'}族谱 · ${volumeTitle} · 第${index + 1}页
          </p>
        </div>
      `
    })

    const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${familyName || '家族'}族谱（${volumeTitle}）</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Noto Sans SC', 'SimSun', sans-serif; }
    .member-card { width: 210mm; min-height: 285mm; margin: 0 auto; background: white; position: relative; padding: 20mm; }
  </style>
</head>
<body>
${coverHtml}
${tocHtml}
${membersHtml}
</body>
</html>`

    const blob = new Blob([htmlContent], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${familyName || '家族'}族谱（${volumeTitle}）.doc`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    setExportSuccess(`导出成功！已保存为 "${familyName || '家族'}族谱（${volumeTitle}）.doc"`)
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
        {/* 试用期提示 */}
        {isTrial && remainingDays !== null && remainingDays > 0 && (
          <div className="flex-1 flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 animate-fade-in">
            <span className="font-medium">试用期剩余 {remainingDays} 天</span>
            <span className="text-blue-600">，到期后导出功能将不可用</span>
          </div>
        )}
        {/* 试用期已过期或未授权提示 */}
        {!licenseValid && !isTrial && (
          <div className="flex-1 flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 animate-fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="font-medium">导出功能需要授权才能使用</span>
            <span className="text-amber-600">如有需要请联系客服获取授权</span>
          </div>
        )}
        {/* 试用期已过期提示 */}
        {!licenseValid && isTrial && remainingDays === 0 && (
          <div className="flex-1 flex items-center gap-2 px-3 py-1 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 animate-fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="font-medium">试用期已结束</span>
            <span className="text-red-600">请联系客服获取授权</span>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setView('volume')}
          className="gap-2"
          disabled={!licenseFeatures.exportVolume}
          title={!licenseFeatures.exportVolume ? '需要授权才能使用分册导出功能' : ''}
        >
          <FileText className="w-4 h-4" />
          分册导出
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportFullHtml}
          className="gap-2"
          disabled={!licenseFeatures.exportHtml}
          title={!licenseFeatures.exportHtml ? '需要授权才能使用HTML导出功能' : ''}
        >
          <FileText className="w-4 h-4" />
          导出HTML
        </Button>
        {/* <Button
          variant="default"
          size="sm"
          onClick={handleExportFullWord}
          className="gap-2 shadow-lg bg-emerald-600 hover:bg-emerald-700"
        >
          <Printer className="w-4 h-4" />
          导出Word
        </Button> */}
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div
          ref={coverRef}
          className="mx-auto bg-gradient-to-b from-amber-50 to-orange-50 border-4 border-amber-800 shadow-2xl relative"
          style={{ maxWidth: '600px', minHeight: '800px' }}
        >
          {/* 装饰边框 */}
          <div className="absolute inset-2 border-2 border-amber-700 pointer-events-none" />
          <div className="absolute inset-6 border border-amber-500 pointer-events-none" />

          {/* 四角装饰 */}
          <div className="absolute top-3 left-3 w-6 h-6">
            <svg viewBox="0 0 40 40" className="w-full h-full text-amber-700">
              <path d="M2 38 Q2 2 38 2" fill="none" stroke="currentColor" strokeWidth="3"/>
              <circle cx="8" cy="8" r="4" fill="currentColor"/>
            </svg>
          </div>
          <div className="absolute top-3 right-3 w-6 h-6 rotate-90">
            <svg viewBox="0 0 40 40" className="w-full h-full text-amber-700">
              <path d="M2 38 Q2 2 38 2" fill="none" stroke="currentColor" strokeWidth="3"/>
              <circle cx="8" cy="8" r="4" fill="currentColor"/>
            </svg>
          </div>
          <div className="absolute bottom-3 left-3 w-6 h-6 -rotate-90">
            <svg viewBox="0 0 40 40" className="w-full h-full text-amber-700">
              <path d="M2 38 Q2 2 38 2" fill="none" stroke="currentColor" strokeWidth="3"/>
              <circle cx="8" cy="8" r="4" fill="currentColor"/>
            </svg>
          </div>
          <div className="absolute bottom-3 right-3 w-6 h-6 rotate-180">
            <svg viewBox="0 0 40 40" className="w-full h-full text-amber-700">
              <path d="M2 38 Q2 2 38 2" fill="none" stroke="currentColor" strokeWidth="3"/>
              <circle cx="8" cy="8" r="4" fill="currentColor"/>
            </svg>
          </div>

          {/* 顶部英文装饰 */}
          <div className="pt-16 text-center">
            <p className="text-xs text-amber-600 tracking-[0.3em]">★ FAMILY GENEALOGY ★</p>
          </div>

          {/* 徽章 */}
          <div className="flex justify-center pt-8 pb-4">
            <div className="w-24 h-24 relative">
              <div className="absolute inset-0 rounded-full border-4 border-amber-700 bg-gradient-to-br from-amber-200 to-amber-400 shadow-xl">
                <div className="absolute inset-3 rounded-full border-2 border-amber-600 flex items-center justify-center">
                  <span className="text-5xl text-amber-800 font-serif">谱</span>
                </div>
              </div>
            </div>
          </div>

          {/* 家族名称 */}
          <div className="text-center px-6">
            <h1 className="text-4xl font-bold text-amber-900 tracking-widest mb-1">
              {familyName || '某某家族'}
            </h1>
            <p className="text-lg text-amber-700 tracking-widest">— 祖谱 —</p>

            <div className="flex items-center justify-center gap-2 my-4">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-amber-500" />
              <div className="flex gap-2">
                <span className="text-amber-500">◆</span>
                <span className="text-amber-600">◆</span>
                <span className="text-amber-500">◆</span>
              </div>
              <div className="h-px w-12 bg-gradient-to-l from-transparent to-amber-500" />
            </div>

            <Badge variant="outline" className="text-amber-800 border-amber-400 bg-amber-50 text-sm px-4 py-1">
              现代版
            </Badge>
          </div>

          {/* 家族宗旨 */}
          <div className="mx-10 mt-6 p-4 bg-amber-100/60 border border-amber-300 rounded-lg text-center">
            <p className="text-base text-amber-800 italic leading-relaxed">
              {familyMaxim || '传承家族文化  弘扬优良家风'}
            </p>
          </div>

          {/* 装饰分隔 */}
          <div className="flex items-center justify-center mt-6 px-10">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
            <div className="px-4 text-amber-500 text-lg">✦</div>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
          </div>

          {/* 始祖源地 */}
          <div className="text-center mt-6 px-8">
            <p className="text-sm text-amber-700">
              始祖源地：{familyOrigin || '源远流长'}
            </p>
          </div>

          {/* 底部信息区 */}
          <div className="absolute bottom-20 left-0 right-0 text-center px-4">
            {membersByGeneration.length > 10 && (
              <div className="mb-3 px-3 py-1.5 bg-amber-100 border border-amber-400 rounded-lg inline-block">
                <p className="text-xs text-amber-800">
                  代数较多，建议使用"分册导出"功能
                </p>
              </div>
            )}
            <p className="text-base text-amber-700">
              共录 <span className="font-bold text-amber-900 text-lg">{allMembersSorted.length}</span> 名族人
            </p>
            <p className="text-sm text-amber-600 mt-1">
              传承 <span className="text-amber-800 font-medium">{membersByGeneration.length}</span> 代
            </p>
          </div>

          {/* 进入按钮 */}
          <div className="absolute bottom-8 left-0 right-0 flex justify-center">
            <Button
              onClick={handleEnterToc}
              className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white px-10 py-2.5 rounded-full shadow-lg gap-2 text-base"
            >
              <BookOpen className="w-5 h-5" />
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
                          onClick={() => handleExportVolumeHtml(volume)}
                          disabled={!licenseFeatures.exportVolume || volumeMembers.length === 0}
                          className="gap-1 text-blue-600 border-blue-300 hover:bg-blue-50"
                          title={!licenseFeatures.exportVolume ? '需要授权才能使用分册导出功能' : ''}
                        >
                          <FileText className="w-4 h-4" />
                          HTML
                        </Button>
                        {/* <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleExportVolumeWord(volume)}
                          disabled={volumeMembers.length === 0}
                          className="gap-1 text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                        >
                          <Printer className="w-4 h-4" />
                          Word
                        </Button> */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeVolume(volume.id)}
                          disabled={false}
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
                          disabled={false}
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
                          disabled={false}
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
      {/* 隐藏的TOC用于导出 - 当不在TOC页时渲染 */}
      {view !== 'toc' && (
        <div className="absolute inset-0 -z-10 opacity-0 pointer-events-none">
          <div ref={tocRef} className="bg-white" style={{ width: '210mm', minHeight: '297mm', padding: '15mm 20mm', fontFamily: 'serif' }}>
            <div className="text-center mb-6 pb-4 border-b-2 border-amber-400">
              <h1 className="text-2xl font-bold text-amber-900 tracking-widest">{familyName || '某某家族'}</h1>
              <p className="text-amber-700 text-lg mt-1">成员索引</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-amber-800 border-b border-amber-200">
                  <th className="text-left py-2 px-1 font-medium">页码</th>
                  <th className="text-left py-2 px-1 font-medium">代数</th>
                  <th className="text-left py-2 px-1 font-medium">字辈</th>
                  <th className="text-left py-2 px-1 font-medium">姓名</th>
                  <th className="text-left py-2 px-1 font-medium">生年</th>
                </tr>
              </thead>
              <tbody>
                {allMembersSorted.map((m, i) => {
                  const genNum = parseInt(m.generation || '0', 10) || 0
                  const genWord = m.generation_word || ''
                  return (
                    <tr key={m.id} className="text-zinc-700 border-b border-amber-100 hover:bg-amber-50">
                      <td className="py-2 px-1">{i + 1}</td>
                      <td className="py-2 px-1">{genNum > 0 ? `第${genNum}代` : '-'}</td>
                      <td className="py-2 px-1">{genWord || '-'}</td>
                      <td className="py-2 px-1">{m.name}</td>
                      <td className="py-2 px-1">{m.birth_date?.substring(0, 4) || '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}