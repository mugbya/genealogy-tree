import React, { useMemo, useRef, useState, useEffect } from 'react'
import type { Member, MemberRelation } from '@/api/client'

interface TreeNode {
  name: string
  surname?: string
  memberId?: number
  gender?: string
  generation: number
  // 标签显示的父母（显示在连接线上）
  labelParent?: { name: string; surname?: string; gender: string; relation: string; memberId?: number; isDeceased?: boolean }
  // 本家父母信息（用于连接线标签显示）
  mainParentName?: string
  mainParentSurname?: string
  spouses?: { name: string; surname?: string; gender: string; isMainFamily: boolean; memberId?: number; isDeceased?: boolean; is_matrilocal?: boolean; is_adopted_son?: boolean }[]
  children?: TreeNode[]
  // Position for rendering
  x?: number
  y?: number
  width?: number
  height?: number
  // 虚拟根节点标识
  isVirtualRoot?: boolean
}

interface GenealogyTreeProps {
  members: Member[]
  relations: MemberRelation[]
  familyName?: string
  familySurname?: string
  rootMemberId?: number | null  // 指定从哪个成员开始展示
  onNodeClick?: (member: Member) => void
}

const NODE_WIDTH = 120
const NODE_HEIGHT = 80
const H_GAP = 50
const V_GAP = 120

export function GenealogyTree({ members, relations, familyName, familySurname, rootMemberId, onNodeClick }: GenealogyTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 1200, height: 800 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [viewStart, setViewStart] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const isInitialLoad = useRef(true)

  // Build tree structure with 本家/非本家 logic
  const treeData = useMemo(() => {
    if (members.length === 0) return null

    const memberMap = new Map<number, Member>()
    members.forEach(m => memberMap.set(m.id, m))

    // Find parent-child relations
    // Database stores: from_member_id = child, to_member_id = parent, relation_type = 'father' or 'mother'
    const parentChildRelations = relations.filter(
      r => r.relation_type === 'father' || r.relation_type === 'mother'
    )

    // Find spouse relations
    const spouseRelations = relations.filter(r => r.relation_type === 'spouse')

    // Find who is a child (appears as from_member_id in father relations only)
    // We only consider 'father' relations for establishing family tree roots
    const childMemberIds = new Set(
      parentChildRelations.filter(r => r.relation_type === 'father').map(r => r.from_member_id)
    )

    // Find who is someone's spouse (appears in spouse relations)
    const spouseMemberIds = new Set<number>()
    spouseRelations.forEach(rel => {
      spouseMemberIds.add(rel.from_member_id)
      spouseMemberIds.add(rel.to_member_id)
    })

    // Find who is a parent in father relations (for father chain)
    const fatherParentIds = new Set<number>()
    parentChildRelations
      .filter(r => r.relation_type === 'father')
      .forEach(r => fatherParentIds.add(r.to_member_id))

    // Find who is a parent in any relation
    const isParentInAnyRelation = (memberId: number): boolean => {
      return parentChildRelations.some(r => r.to_member_id === memberId)
    }

    // A member is in the father chain if they appear as either child or parent in father relations
    const inFatherChain = (memberId: number) =>
      childMemberIds.has(memberId) || fatherParentIds.has(memberId)

    // A root must be:
    // 1. Not someone's child in father relations
    // 2. If they ARE someone's spouse, they MUST also be in the father chain
    //    (e.g., 贾演 is spouse of 贾演夫人, and 贾演 IS in father chain, so he's a valid root)
    //    (贾演夫人 is spouse of 贾演, but 贾演夫人 is NOT in father chain, so she's NOT a valid root)
    // EXCEPTION: Women who are spouses of matrilocal husbands can be roots if they are parents
    const potentialRoots = members.filter(m => {
      if (childMemberIds.has(m.id)) return false // Can't be root if you're someone's child
      if (!spouseMemberIds.has(m.id)) return true // Not a spouse, definitely a root

      // Is a spouse - valid root if in father chain
      if (inFatherChain(m.id)) return true

      // For 入赘 (matrilocal) case: the wife of a matrilocal husband
      // She should be a root if she is a parent and her husband is matrilocal
      if (isParentInAnyRelation(m.id)) {
        // She is a parent, check if her husband is matrilocal
        const husbandRel = spouseRelations.find(r => r.to_member_id === m.id && r.relation_type === 'spouse')
        if (husbandRel) {
          const husband = memberMap.get(husbandRel.from_member_id)
          if (husband?.is_matrilocal) return true
        }
      }

      return false
    })

    // Helper to check if a member is from the main family
    // 如果没有家族姓氏配置，默认所有人都是本家
    // 如果有家族姓氏配置，只有同姓的才是本家
    const isMainFamily = (member: Member): boolean => {
      if (!familySurname) return true  // No config, treat as main family
      if (!member.surname) return true  // No surname on this member, treat as main family
      return member.surname === familySurname
    }

    // Root members: those who are not someone's child, are from main family, and are not matrilocal/adopted
    let rootMembers = potentialRoots.filter(m => {
      if (!isMainFamily(m)) return false
      // 入赘成员不作为独立根节点
      if (m.is_matrilocal) return false
      // 招夫养子不作为独立根节点（他们跟随妻子的家族）
      if (m.is_adopted_son) return false
      return true
    })

    // If no main family roots found (e.g., all roots have different surnames),
    // use the first potential root as the family root (excluding matrilocal/adopted)
    if (rootMembers.length === 0 && potentialRoots.length > 0) {
      const validRoots = potentialRoots.filter(m => !m.is_matrilocal && !m.is_adopted_son)
      if (validRoots.length > 0) {
        rootMembers = [validRoots[0]]
      }
    }

    // Build a map: child_id -> {father_id, mother_id}
    const childToParentMap = new Map<number, { fatherId?: number; motherId?: number }>()
    parentChildRelations.forEach(rel => {
      const childId = rel.from_member_id
      const parentId = rel.to_member_id
      const existing = childToParentMap.get(childId) || {}
      if (rel.relation_type === 'father') {
        existing.fatherId = parentId
      } else if (rel.relation_type === 'mother') {
        existing.motherId = parentId
      }
      childToParentMap.set(childId, existing)
    })

    // Build spouse map: member_id -> spouse_id
    const spouseMap = new Map<number, number>()
    spouseRelations.forEach(rel => {
      if (!spouseMap.has(rel.from_member_id)) {
        spouseMap.set(rel.from_member_id, rel.to_member_id)
      }
      if (!spouseMap.has(rel.to_member_id)) {
        spouseMap.set(rel.to_member_id, rel.from_member_id)
      }
    })

    // Build reverse map: parent_id -> child_ids
    // For father relations, children should be attached to the spouse if the father is matrilocal
    // For mother relations, children are naturally under the mother
    const parentToChildrenMap = new Map<number, number[]>()

    // 用于记录孩子和真实父亲的关系（用于显示在连接线上）
    // key: childId, value: biological fatherId (the is_adopted_son member)
    const childToBioFatherMap = new Map<number, number>()

    // Process all parent-child relations
    console.log('Total parentChildRelations:', parentChildRelations.length);

    // 检查 memberMap 中李永泰的数据
    const liyongtaiFromMap = memberMap.get(79);
    console.log('*** memberMap.get(79):', liyongtaiFromMap ? JSON.stringify(liyongtaiFromMap) : 'NOT FOUND');

    parentChildRelations.forEach(rel => {
      if (rel.from_member_id === 55 || rel.to_member_id === 55) {
        console.log('*** FOUND relation for 刘金兰(55):', JSON.stringify(rel));
      }
      const childMember = memberMap.get(rel.from_member_id)
      const parentMember = memberMap.get(rel.to_member_id)
      console.log('Processing relation:', rel.from_member_id, '->', rel.to_member_id, 'type:', rel.relation_type, 'parentMember:', parentMember ? 'exists' : 'undefined', 'is_adopted_son:', parentMember?.is_adopted_son);
      // 招夫养子不跟随生父，而是跟随妻子家族
      if (childMember?.is_adopted_son) return

      // 如果是父亲关系且父亲是入赘或招夫养子成员
      // 孩子应该显示在妻子的本家丈夫（如刘三友）名下，连接线标注真实父亲
      if (rel.relation_type === 'father' && (parentMember?.is_matrilocal || parentMember?.is_adopted_son)) {
        console.log('Adopted son case: child=', rel.from_member_id, 'father=', rel.to_member_id, 'is_adopted_son=', parentMember?.is_adopted_son);
        // 记录真实父亲关系，用于显示在连接线上
        childToBioFatherMap.set(rel.from_member_id, rel.to_member_id)

        // 找到父亲的配偶（母亲），再找母亲的本家配偶
        const fatherId = rel.to_member_id  // 李永泰
        const motherSpouseRelations = spouseRelations.filter(
          r => (r.from_member_id === fatherId || r.to_member_id === fatherId) && r.relation_type === 'spouse'
        )
        console.log('*** Father', fatherId, 'spouse relations (mothers):', motherSpouseRelations.map(r => r.from_member_id === fatherId ? r.to_member_id : r.from_member_id));

        // 遍历所有母亲，找她们的本家配偶
        let mainFamilySpouseId: number | undefined
        for (const motherSpouseRel of motherSpouseRelations) {
          const motherId = motherSpouseRel.from_member_id === fatherId ? motherSpouseRel.to_member_id : motherSpouseRel.from_member_id
          console.log('  Checking mother:', motherId, memberMap.get(motherId)?.name);

          // 找母亲的所有配偶
          const motherAllSpouseRelations = spouseRelations.filter(
            r => (r.from_member_id === motherId || r.to_member_id === motherId) && r.relation_type === 'spouse'
          )
          console.log('    Mother', motherId, 'all spouses:', motherAllSpouseRelations.map(r => r.from_member_id === motherId ? r.to_member_id : r.from_member_id));

          for (const spouseRel of motherAllSpouseRelations) {
            const spouseId = spouseRel.from_member_id === motherId ? spouseRel.to_member_id : spouseRel.from_member_id
            if (spouseId === fatherId) continue  // 跳过亲生父亲
            const spouse = memberMap.get(spouseId)
            console.log('    Checking spouse:', spouseId, spouse?.name, 'surname:', spouse?.surname, 'isMainFamily:', spouse && isMainFamily(spouse));
            if (spouse && isMainFamily(spouse)) {
              mainFamilySpouseId = spouseId
              console.log('    -> Found main family spouse:', spouseId, spouse?.name);
              break
            }
          }
          if (mainFamilySpouseId) break
        }
        console.log('Final mainFamilySpouseId:', mainFamilySpouseId);

        // 如果找到了本家成员，把孩子添加到他名下
        if (mainFamilySpouseId) {
          const childId = rel.from_member_id
          const existing = parentToChildrenMap.get(mainFamilySpouseId) || []
          if (!existing.includes(childId)) {
            existing.push(childId)
          }
          parentToChildrenMap.set(mainFamilySpouseId, existing)
          console.log('Added child', childId, 'to parent', mainFamilySpouseId);
        }
        return
      }

      // 其他情况：正常添加到父亲或母亲名下
      const parentId = rel.to_member_id
      const childId = rel.from_member_id
      const existing = parentToChildrenMap.get(parentId) || []
      if (!existing.includes(childId)) {
        existing.push(childId)
      }
      parentToChildrenMap.set(parentId, existing)
    })

    // Calculate generations dynamically
    const generations = new Map<number, number>()

    const calculateGeneration = (memberId: number, visited = new Set<number>()): number => {
      if (visited.has(memberId)) return 1
      visited.add(memberId)

      if (generations.has(memberId)) return generations.get(memberId)!

      const parents = childToParentMap.get(memberId)
      if (!parents || (!parents.fatherId && !parents.motherId)) {
        generations.set(memberId, 1)
        return 1
      }

      // Determine main parent (the one from main family)
      let mainParentId: number | undefined
      let secondParentId: number | undefined

      if (parents.fatherId) {
        const father = memberMap.get(parents.fatherId)
        if (father && isMainFamily(father)) {
          mainParentId = parents.fatherId
        } else {
          secondParentId = parents.fatherId
        }
      }
      if (parents.motherId && !mainParentId) {
        const mother = memberMap.get(parents.motherId)
        if (mother && isMainFamily(mother)) {
          mainParentId = parents.motherId
        } else {
          secondParentId = parents.motherId
        }
      }
      if (parents.motherId && !secondParentId) {
        secondParentId = parents.motherId
      }

      if (!mainParentId && !secondParentId) {
        generations.set(memberId, 1)
        return 1
      }

      // Get max parent generation + 1
      let maxGen = 0
      if (mainParentId && generations.has(mainParentId)) {
        maxGen = Math.max(maxGen, generations.get(mainParentId)!)
      }
      if (secondParentId && generations.has(secondParentId)) {
        maxGen = Math.max(maxGen, generations.get(secondParentId)!)
      }

      // If parents not yet calculated, do recursive calculation
      if (mainParentId && !generations.has(mainParentId)) {
        calculateGeneration(mainParentId, new Set(visited))
      }
      if (secondParentId && !generations.has(secondParentId)) {
        calculateGeneration(secondParentId, new Set(visited))
      }

      // Recalculate with full info
      maxGen = 0
      if (mainParentId && generations.has(mainParentId)) {
        maxGen = Math.max(maxGen, generations.get(mainParentId)!)
      }
      if (secondParentId && generations.has(secondParentId)) {
        maxGen = Math.max(maxGen, generations.get(secondParentId)!)
      }

      const gen = maxGen + 1
      generations.set(memberId, gen)
      return gen
    }

    // Calculate generations for all members
    members.forEach(m => {
      if (!generations.has(m.id)) {
        calculateGeneration(m.id)
      }
    })

    // Helper to find spouses for a member
    const findSpouses = (memberId: number): { name: string; surname?: string; gender: string; isMainFamily: boolean; memberId?: number; isDeceased?: boolean; is_matrilocal?: boolean; is_adopted_son?: boolean }[] => {
      const spouseRels = spouseRelations.filter(
        r => r.from_member_id === memberId || r.to_member_id === memberId
      )
      const spouses: { name: string; surname?: string; gender: string; isMainFamily: boolean; memberId?: number; isDeceased?: boolean; is_matrilocal?: boolean; is_adopted_son?: boolean }[] = []
      const seenSpouseIds = new Set<number>()
      spouseRels.forEach(rel => {
        const spouseId = rel.from_member_id === memberId ? rel.to_member_id : rel.from_member_id
        if (seenSpouseIds.has(spouseId)) return // Skip duplicate
        seenSpouseIds.add(spouseId)
        const spouse = memberMap.get(spouseId)
        if (spouse) {
          spouses.push({
            name: spouse.name,
            surname: spouse.surname,
            gender: spouse.gender,
            isMainFamily: isMainFamily(spouse),
            memberId: spouse.id,
            isDeceased: spouse.is_deceased,
            is_matrilocal: spouse.is_matrilocal,
            is_adopted_son: spouse.is_adopted_son
          })
        }
      })
      return spouses
    }

    // Build tree recursively
    // Only follows the main family branch (same surname as family surname)
    const buildTree = (member: Member, visited = new Set<number>(), labelParent?: { name: string; surname?: string; gender: string; relation: string }): TreeNode => {
      console.log('Building tree for:', member.name, 'id:', member.id, 'children:', parentToChildrenMap.get(member.id));
      if (visited.has(member.id)) {
        return {
          name: member.name,
          surname: member.surname,
          memberId: member.id,
          gender: member.gender,
          generation: generations.get(member.id) || 1,
          spouses: [],
          children: [],
          labelParent,
        }
      }
      visited.add(member.id)

      // Get parents
      const parents = childToParentMap.get(member.id)

      // Determine main parent for building the tree structure
      let mainParentId: number | undefined

      if (parents?.fatherId) {
        const father = memberMap.get(parents.fatherId)
        if (father && isMainFamily(father)) {
          mainParentId = parents.fatherId
        }
      }
      if (!mainParentId && parents?.motherId) {
        const mother = memberMap.get(parents.motherId)
        if (mother && isMainFamily(mother)) {
          mainParentId = parents.motherId
        }
      }
      // If no main parent found yet, use the first available
      if (!mainParentId && parents?.fatherId) {
        mainParentId = parents.fatherId
      }
      if (!mainParentId && parents?.motherId) {
        mainParentId = parents.motherId
      }

      // The label parent for this node - show the "other" parent (not the main one in the tree)
      // This is used when displaying connection lines between parent and child
      let nodeLabelParent: { name: string; surname?: string; gender: string; relation: string; memberId?: number; isDeceased?: boolean } | undefined

      // Check if this member was added via adopted_son/matrilocal relationship
      // If so, show the biological father on the connection line
      const bioFatherId = childToBioFatherMap.get(member.id)
      if (bioFatherId) {
        const bioFather = memberMap.get(bioFatherId)
        if (bioFather) {
          nodeLabelParent = {
            name: bioFather.name,
            surname: bioFather.surname,
            gender: 'male',
            relation: 'father',
            memberId: bioFather.id,
            isDeceased: bioFather.is_deceased
          }
        }
      } else {
        // Get the "other parent" - if father is mainParentId, show mother; if mother is mainParentId, show father
        if (mainParentId && parents?.fatherId && mainParentId === parents.fatherId && parents.motherId) {
          // Father is the main parent in tree, show mother on the connection line
          const mother = memberMap.get(parents.motherId)
          if (mother) {
            nodeLabelParent = {
              name: mother.name,
              surname: mother.surname,
              gender: 'female',
              relation: 'mother',
              memberId: mother.id,
              isDeceased: mother.is_deceased
            }
          }
        } else if (mainParentId && parents?.motherId && mainParentId === parents.motherId && parents.fatherId) {
          // Mother is the main parent in tree, show father on the connection line
          const father = memberMap.get(parents.fatherId)
          if (father) {
            nodeLabelParent = {
              name: father.name,
              surname: father.surname,
              gender: 'male',
              relation: 'father',
              memberId: father.id,
              isDeceased: father.is_deceased
            }
          }
        }
      }

      const spouses = findSpouses(member.id)

      // Find children - current member is the parent, find their children
      const childIds = parentToChildrenMap.get(member.id) || []
      const children: TreeNode[] = []

      childIds.forEach(childId => {
        const child = memberMap.get(childId)
        if (child && !visited.has(childId)) {
          // For children, the label parent is the secondary parent of their parent
          children.push(buildTree(child, visited, nodeLabelParent))
        }
      })

      return {
        name: member.name,
        surname: member.surname,
        memberId: member.id,
        gender: member.gender,
        generation: generations.get(member.id) || 1,
        labelParent: nodeLabelParent,
        spouses,
        children: children.length > 0 ? children : undefined,
      }
    }

    // Handle roots - prefer main family root
    const mainFamilyRoots = rootMembers.filter(m => isMainFamily(m))
    const effectiveRoots = mainFamilyRoots.length > 0 ? mainFamilyRoots : rootMembers

    // Build the root node with family name
    const rootName = familySurname
      ? `${familySurname}氏家族`
      : familyName || '本家'

    // If rootMemberId is specified, build tree from that member (showing their descendants)
    if (rootMemberId) {
      const rootMember = memberMap.get(rootMemberId)
      if (rootMember) {
        return {
          name: rootName,
          surname: familySurname,
          generation: 0,
          children: [buildTree(rootMember)],
          isVirtualRoot: true,
        }
      }
    }

    // If only one effective root, just build the tree directly with virtual root as parent
    if (effectiveRoots.length === 1) {
      return {
        name: rootName,
        surname: familySurname,
        generation: 0,
        children: [buildTree(effectiveRoots[0])],
        isVirtualRoot: true,
      }
    }

    // Multiple roots: create a "家族" node to group them, then wrap in virtual root
    return {
      name: rootName,
      surname: familySurname,
      generation: 0,
      children: [{
        name: '家族',
        generation: 0,
        children: effectiveRoots.map(m => buildTree(m)),
      }],
      isVirtualRoot: true,
    }
  }, [members, relations, familyName, familySurname, rootMemberId])

  // Calculate positions using a bottom-up layout
  const positionedTree = useMemo(() => {
    if (!treeData) return null

    // Calculate subtree width
    const calcWidth = (node: TreeNode): number => {
      // Account for spouses width
      const spouseWidth = node.spouses && node.spouses.length > 0 ? 88 : 0 // 80 + 8 gap

      if (!node.children || node.children.length === 0) {
        return NODE_WIDTH + spouseWidth
      }
      const childrenWidth = node.children.reduce((sum, child) => sum + calcWidth(child), 0)
      return Math.max(NODE_WIDTH + spouseWidth, childrenWidth + (node.children.length - 1) * H_GAP)
    }

    // Calculate positions recursively
    const calcPositions = (node: TreeNode, x: number, y: number): TreeNode => {
      const width = calcWidth(node)

      if (!node.children || node.children.length === 0) {
        return {
          ...node,
          x: x - NODE_WIDTH / 2,
          y,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
        }
      }

      let childX = x - width / 2
      const childY = y + NODE_HEIGHT + V_GAP

      const positionedChildren: TreeNode[] = []
      node.children.forEach((child) => {
        const childWidth = calcWidth(child)
        const childPos = calcPositions(child, childX + childWidth / 2, childY)
        positionedChildren.push(childPos)
        childX += childWidth + H_GAP
      })

      return {
        ...node,
        x: x - NODE_WIDTH / 2,
        y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        children: positionedChildren,
      }
    }

    const startX = viewBox.width / 2
    const startY = 50

    return calcPositions(treeData, startX, startY)
  }, [treeData, viewBox.width])

  // Render connections with parent labels (for non-main family parents)
  const renderConnections = (node: TreeNode): React.ReactElement[] => {
    const elements: React.ReactElement[] = []

    if (!node.children) return elements

    node.children.forEach((child) => {
      if (child.x === undefined || child.y === undefined || node.x === undefined || node.y === undefined) return

      const parentX = node.x + NODE_WIDTH / 2
      const parentY = node.y + NODE_HEIGHT
      const childX = child.x + NODE_WIDTH / 2
      const childY = child.y

      const midY = (parentY + childY) / 2

      // Draw vertical line from parent
      elements.push(
        <line
          key={`${node.memberId}-${child.memberId}-v`}
          x1={parentX}
          y1={parentY}
          x2={parentX}
          y2={midY}
          stroke="#94a3b8"
          strokeWidth="2"
        />
      )

      // Draw vertical line to child
      elements.push(
        <line
          key={`${node.memberId}-${child.memberId}-v2`}
          x1={childX}
          y1={midY}
          x2={childX}
          y2={childY}
          stroke="#94a3b8"
          strokeWidth="2"
        />
      )

      // Draw horizontal line
      elements.push(
        <line
          key={`${node.memberId}-${child.memberId}-h`}
          x1={parentX}
          y1={midY}
          x2={childX}
          y2={midY}
          stroke="#94a3b8"
          strokeWidth="2"
        />
      )

      // Draw label parent on the connection line
      // labelParent.relation tells us what labelParent IS (father or mother)
      // We display the OPPOSITE because the current node (parent in tree) is already that person
      // Example: if labelParent.relation === 'mother', it means labelParent is mother,
      // and current node (parent in tree) is father, so we show "母:" on the line
      if (child.labelParent) {
        const isLabelParentMother = child.labelParent.relation === 'mother'
        const labelText = isLabelParentMother
          ? `母: ${child.labelParent.name}`   // labelParent is mother
          : `父: ${child.labelParent.name}`    // labelParent is father

        const textWidth = labelText.length * 14 + 20

        elements.push(
          <rect
            key={`${node.memberId}-${child.memberId}-label-bg`}
            x={childX - textWidth / 2}
            y={midY - 12}
            width={textWidth}
            height="20"
            fill={child.labelParent.isDeceased ? '#e5e7eb' : '#fef3c7'}
            stroke={child.labelParent.isDeceased ? '#9ca3af' : '#f59e0b'}
            strokeWidth="1"
            rx="4"
          />
        )

        elements.push(
          <text
            key={`${node.memberId}-${child.memberId}-label`}
            x={childX}
            y={midY + 4}
            textAnchor="middle"
            fontSize="11"
            fill={child.labelParent.isDeceased ? '#9ca3af' : '#92400e'}
            fontWeight="500"
          >
            {labelText}
          </text>
        )
      }

      // Recursively render child connections
      elements.push(...renderConnections(child))
    })

    return elements
  }

  // Render a single node
  const renderNode = (node: TreeNode): React.ReactElement => {
    if (node.x === undefined || node.y === undefined) return <g key={node.memberId || node.name} />

    // Virtual root node styling
    if (node.isVirtualRoot) {
      return (
        <g
          key={node.memberId || node.name}
          transform={`translate(${node.x}, ${node.y})`}
        >
          {/* Root node rectangle - larger and golden */}
          <rect
            width={NODE_WIDTH + 40}
            height={NODE_HEIGHT + 20}
            fill="#fef3c7"
            stroke="#f59e0b"
            strokeWidth="3"
            rx="12"
          />

          {/* Family name */}
          <text
            x={(NODE_WIDTH + 40) / 2}
            y={(NODE_HEIGHT + 20) / 2 - 6}
            textAnchor="middle"
            fontSize="18"
            fontWeight="bold"
            fill="#92400e"
          >
            {node.name}
          </text>

          {/* Surname tree indicator */}
          {node.surname && (
            <text
              x={(NODE_WIDTH + 40) / 2}
              y={(NODE_HEIGHT + 20) / 2 + 16}
              textAnchor="middle"
              fontSize="12"
              fill="#b45309"
            >
              {node.surname}氏宗谱
            </text>
          )}
        </g>
      )
    }

    const isMale = node.gender === 'male'
    const isDeceased = node.memberId ? members.find(m => m.id === node.memberId)?.is_deceased : false
    // 离世人员节点变灰
    const bgColor = isDeceased ? '#d1d5db' : (isMale ? '#93c5fd' : '#f9a8d4')
    const borderColor = isDeceased ? '#9ca3af' : (isMale ? '#3b82f6' : '#ec4899')
    const textColor = isDeceased ? '#6b7280' : '#1f2937'

    return (
      <g
        key={node.memberId || node.name}
        transform={`translate(${node.x}, ${node.y})`}
        onClick={() => {
          if (onNodeClick && node.memberId) {
            const member = members.find(m => m.id === node.memberId)
            if (member) onNodeClick(member)
          }
        }}
        style={{ cursor: 'pointer' }}
      >
        {/* Node rectangle */}
        <rect
          width={NODE_WIDTH}
          height={NODE_HEIGHT}
          fill={bgColor}
          stroke={borderColor}
          strokeWidth="2"
          rx="8"
        />

        {/* Generation badge */}
        {node.generation > 0 && (
          <>
            <circle
              cx={NODE_WIDTH - 10}
              cy={10}
              r="12"
              fill={borderColor}
            />
            <text
              x={NODE_WIDTH - 10}
              y={14}
              textAnchor="middle"
              fontSize="10"
              fill="white"
              fontWeight="bold"
            >
              {node.generation}代
            </text>
          </>
        )}

        {/* Name */}
        <text
          x={NODE_WIDTH / 2}
          y={NODE_HEIGHT / 2 - 8}
          textAnchor="middle"
          fontSize="14"
          fontWeight="bold"
          fill={textColor}
        >
          {node.name}
        </text>

        {/* Gender indicator */}
        <text
          x={NODE_WIDTH / 2}
          y={NODE_HEIGHT - 12}
          textAnchor="middle"
          fontSize="11"
          fill={isDeceased ? '#9ca3af' : '#6b7280'}
        >
          {isMale ? '♂' : '♀'}
        </text>

        {/* Spouses - displayed to the right of the node */}
        {node.spouses && node.spouses.length > 0 && node.spouses.map((spouse, idx) => {
          const spouseBgColor = spouse.isDeceased ? '#d1d5db' : (spouse.gender === 'male' ? '#93c5fd' : '#f9a8d4')
          const spouseBorderColor = spouse.isDeceased ? '#9ca3af' : (spouse.gender === 'male' ? '#3b82f6' : '#ec4899')
          const spouseTextColor = spouse.isDeceased ? '#9ca3af' : '#1f2937'
          const spouseX = NODE_WIDTH + 8
          const spouseY = (node.spouses!.length - 1) * 30 / 2 - idx * 30
          const spouseWidth = 80
          const spouseHeight = 26

          return (
            <g key={`spouse-${idx}`} transform={`translate(${spouseX}, ${spouseY})`}>
              <rect
                width={spouseWidth}
                height={spouseHeight}
                fill={spouseBgColor}
                stroke={spouseBorderColor}
                strokeWidth="1"
                rx="4"
              />
              <text
                x={spouseWidth / 2}
                y={spouseHeight / 2 + 4}
                textAnchor="middle"
                fontSize="10"
                fill={spouseTextColor}
              >
                {spouse.name}
              </text>
            </g>
          )
        })}
      </g>
    )
  }

  // Render all nodes recursively
  const renderAllNodes = (node: TreeNode): React.ReactElement[] => {
    const elements = [renderNode(node)]
    if (node.children) {
      node.children.forEach(child => {
        elements.push(...renderAllNodes(child))
      })
    }
    return elements
  }

  // Mouse event handlers for pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
    setViewStart({ x: viewBox.x, y: viewBox.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    const dx = (e.clientX - dragStart.x) / scale
    const dy = (e.clientY - dragStart.y) / scale
    setViewBox(prev => ({
      ...prev,
      x: viewStart.x - dx,
      y: viewStart.y - dy,
    }))
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Handle wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    // 缩小是 deltaY > 0，放大是 deltaY < 0
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.min(Math.max(scale * delta, 0.2), 3)

    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    // 计算鼠标位置在世界坐标中的位置
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const worldX = viewBox.x + (mouseX / viewBox.width) * viewBox.width
    const worldY = viewBox.y + (mouseY / viewBox.height) * viewBox.height

    // 计算新的 viewBox，保持鼠标指向的世界坐标点不变
    const newWidth = viewBox.width * (scale / newScale)
    const newHeight = viewBox.height * (scale / newScale)

    setScale(newScale)
    setViewBox(prev => ({
      x: worldX - (mouseX / prev.width) * newWidth,
      y: worldY - (mouseY / prev.height) * newHeight,
      width: newWidth,
      height: newHeight,
    }))
  }

  // Update viewBox when tree changes (only on initial load)
  useEffect(() => {
    if (!positionedTree) return

    // 只有初始加载时才自动调整视图，用户缩放时不要重置
    if (!isInitialLoad.current) return
    isInitialLoad.current = false

    const calcBounds = (node: TreeNode, bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }): typeof bounds => {
      if (node.x !== undefined && node.y !== undefined) {
        bounds.minX = Math.min(bounds.minX, node.x)
        bounds.maxX = Math.max(bounds.maxX, node.x + NODE_WIDTH)
        bounds.minY = Math.min(bounds.minY, node.y)
        bounds.maxY = Math.max(bounds.maxY, node.y + NODE_HEIGHT)
      }
      node.children?.forEach(child => calcBounds(child, bounds))
      return bounds
    }

    const bounds = calcBounds(positionedTree)
    const padding = 100
    setViewBox({
      x: bounds.minX - padding,
      y: bounds.minY - padding,
      width: Math.max(bounds.maxX - bounds.minX + padding * 2, 800),
      height: Math.max(bounds.maxY - bounds.minY + padding * 2, 600),
    })
  }, [positionedTree])

  if (!positionedTree) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        暂无族谱数据，请先添加成员
      </div>
    )
  }

  // Handle zoom with buttons - SVG viewBox缩放通过改变width/height实现
  const handleZoomIn = () => {
    // 计算当前视图中心在世界坐标中的位置
    const centerWorldX = viewBox.x + viewBox.width / 2
    const centerWorldY = viewBox.y + viewBox.height / 2
    // 放大：减小 viewBox 的宽高
    const newScale = Math.min(scale * 1.2, 3)
    const newWidth = viewBox.width / newScale * scale
    const newHeight = viewBox.height / newScale * scale
    // 保持中心点不变
    setScale(newScale)
    setViewBox(prev => ({
      ...prev,
      x: centerWorldX - newWidth / 2,
      y: centerWorldY - newHeight / 2,
      width: newWidth,
      height: newHeight,
    }))
  }

  const handleZoomOut = () => {
    // 计算当前视图中心在世界坐标中的位置
    const centerWorldX = viewBox.x + viewBox.width / 2
    const centerWorldY = viewBox.y + viewBox.height / 2
    // 缩小：增大 viewBox 的宽高
    const newScale = Math.max(scale * 0.8, 0.2)
    const newWidth = viewBox.width / newScale * scale
    const newHeight = viewBox.height / newScale * scale
    // 保持中心点不变
    setScale(newScale)
    setViewBox(prev => ({
      ...prev,
      x: centerWorldX - newWidth / 2,
      y: centerWorldY - newHeight / 2,
      width: newWidth,
      height: newHeight,
    }))
  }

  const handleResetView = () => {
    isInitialLoad.current = true
    setScale(1)
    if (positionedTree) {
      const calcBounds = (node: TreeNode, bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }): typeof bounds => {
        if (node.x !== undefined && node.y !== undefined) {
          bounds.minX = Math.min(bounds.minX, node.x)
          bounds.maxX = Math.max(bounds.maxX, node.x + NODE_WIDTH)
          bounds.minY = Math.min(bounds.minY, node.y)
          bounds.maxY = Math.max(bounds.maxY, node.y + NODE_HEIGHT)
        }
        node.children?.forEach(child => calcBounds(child, bounds))
        return bounds
      }
      const bounds = calcBounds(positionedTree)
      const padding = 100
      setViewBox({
        x: bounds.minX - padding,
        y: bounds.minY - padding,
        width: Math.max(bounds.maxX - bounds.minX + padding * 2, 800),
        height: Math.max(bounds.maxY - bounds.minY + padding * 2, 600),
      })
    }
  }

  return (
    <div className="relative w-full h-full">
      {/* Zoom controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-1 bg-white/90 backdrop-blur-sm rounded-lg shadow-md p-1">
        <button
          onClick={handleZoomIn}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-700 font-bold"
          title="放大"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-700 font-bold"
          title="缩小"
        >
          −
        </button>
        <div className="w-full h-px bg-gray-200 my-1" />
        <button
          onClick={handleResetView}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-700 text-xs"
          title="重置视图"
        >
          ⟲
        </button>
      </div>
      {/* Scale indicator */}
      <div className="absolute bottom-4 right-4 z-10 bg-white/90 backdrop-blur-sm rounded-lg shadow-md px-2 py-1 text-xs text-gray-600">
        {Math.round(scale * 100)}%
      </div>
      <div
        ref={containerRef}
        className="w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        >
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect x={viewBox.x - 1000} y={viewBox.y - 1000} width={viewBox.width + 2000} height={viewBox.height + 2000} fill="url(#grid)" />

          <g>{renderConnections(positionedTree)}</g>
          <g>{renderAllNodes(positionedTree)}</g>
        </svg>
      </div>
    </div>
  )
}
