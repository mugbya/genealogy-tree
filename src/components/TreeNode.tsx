import React, { useMemo, useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react'
import type { Member, MemberRelation } from '@/api/client'

interface TreeNode {
  name: string
  surname?: string
  memberId?: number
  gender?: string
  generation: number
  // 树的深度（从根节点开始计算，虚拟根的子节点为第1代）
  depth?: number
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
  textMode?: boolean  // 文字模式，不显示图形背景
  // 过滤选项
  filterNoChildrenFemale?: boolean  // 过滤没有子女的女性节点
  hideLineName?: boolean  // 隐藏连线上的名字
  hideSpouse?: boolean  // 隐藏配偶
  onNodeClick?: (member: Member) => void
  onTruncationChange?: (isTruncated: boolean) => void  // 代数超限回调
  maxGenerations?: number  // 最大代数限制，默认10
}

export interface GenealogyTreeRef {
  container: HTMLDivElement | null
  exportSvgAsDataUrl: () => string
}

const NODE_WIDTH = 150
const NODE_HEIGHT = 100
const H_GAP = 60
const V_GAP = 140

export const GenealogyTree = forwardRef<GenealogyTreeRef, GenealogyTreeProps>(function GenealogyTree({ members, relations, familyName, familySurname, rootMemberId, textMode = false, filterNoChildrenFemale = false, hideLineName = false, hideSpouse = false, onNodeClick, onTruncationChange, maxGenerations = 10 }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [truncationState, setTruncationState] = useState({ isTruncated: false, truncatedAt: 0 })
  const truncationDetectedRef = useRef(false)

  // Expose container ref and methods to parent
  useImperativeHandle(ref, () => ({
    container: containerRef.current,
    exportSvgAsDataUrl,
  }))
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 1200, height: 800 })
  const scaleRef = useRef(1)
  const viewBoxRef = useRef({ x: 0, y: 0, width: 1200, height: 800 })
  const isInitialLoad = useRef(true)
  // Drag state using refs to avoid closure issues
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const viewStartRef = useRef({ x: 0, y: 0 })

  // Notify parent of truncation changes
  useEffect(() => {
    if (onTruncationChange) {
      onTruncationChange(truncationState.isTruncated)
    }
  }, [truncationState.isTruncated, onTruncationChange])

  // Build tree structure with 本家/非本家 logic
  const treeData = useMemo(() => {
    if (members.length === 0) return null

    // Reset truncation detector
    truncationDetectedRef.current = false

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
    parentChildRelations.forEach(rel => {
      const childMember = memberMap.get(rel.from_member_id)
      const parentMember = memberMap.get(rel.to_member_id)
      // 招夫养子不跟随生父，而是跟随妻子家族
      if (childMember?.is_adopted_son) return

      // 如果是父亲关系且父亲是入赘或招夫养子成员
      // 孩子应该显示在妻子的本家丈夫（如刘三友）名下，连接线标注真实父亲
      if (rel.relation_type === 'father' && (parentMember?.is_matrilocal || parentMember?.is_adopted_son)) {
        // 记录真实父亲关系，用于显示在连接线上
        childToBioFatherMap.set(rel.from_member_id, rel.to_member_id)

        // 找到父亲的配偶（母亲），再找母亲的本家配偶
        const fatherId = rel.to_member_id  // 李永泰
        const motherSpouseRelations = spouseRelations.filter(
          r => (r.from_member_id === fatherId || r.to_member_id === fatherId) && r.relation_type === 'spouse'
        )

        // 遍历所有母亲，找她们的本家配偶
        let mainFamilySpouseId: number | undefined
        for (const motherSpouseRel of motherSpouseRelations) {
          const motherId = motherSpouseRel.from_member_id === fatherId ? motherSpouseRel.to_member_id : motherSpouseRel.from_member_id

          // 找母亲的所有配偶
          const motherAllSpouseRelations = spouseRelations.filter(
            r => (r.from_member_id === motherId || r.to_member_id === motherId) && r.relation_type === 'spouse'
          )

          for (const spouseRel of motherAllSpouseRelations) {
            const spouseId = spouseRel.from_member_id === motherId ? spouseRel.to_member_id : spouseRel.from_member_id
            if (spouseId === fatherId) continue  // 跳过亲生父亲
            const spouse = memberMap.get(spouseId)
            if (spouse && isMainFamily(spouse)) {
              mainFamilySpouseId = spouseId
              break
            }
          }
          if (mainFamilySpouseId) break
        }

        // 如果找到了本家成员，把孩子添加到他名下
        if (mainFamilySpouseId) {
          const childId = rel.from_member_id
          const existing = parentToChildrenMap.get(mainFamilySpouseId) || []
          if (!existing.includes(childId)) {
            existing.push(childId)
          }
          parentToChildrenMap.set(mainFamilySpouseId, existing)
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
    // depth: starts from 1 for direct children of virtual root, represents tree depth
    // maxGenerations: max allowed depth (10 means show generations 1-10, not including virtual root)
    const buildTree = (member: Member, visited = new Set<number>(), labelParent?: { name: string; surname?: string; gender: string; relation: string }, depth: number = 1): TreeNode => {
      if (visited.has(member.id)) {
        return {
          name: member.name,
          surname: member.surname,
          memberId: member.id,
          gender: member.gender,
          generation: generations.get(member.id) || 1,
          depth,
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
      // If depth >= maxGenerations, don't add children (truncation)
      const childIds = parentToChildrenMap.get(member.id) || []
      const children: TreeNode[] = []

      if (depth === maxGenerations) {
        // At the max depth - check if there are more children to indicate truncation
        if (childIds.length > 0) {
          truncationDetectedRef.current = true
        }
      }

      if (depth < maxGenerations) {
        childIds.forEach(childId => {
          const child = memberMap.get(childId)
          if (child && !visited.has(childId)) {
            // Skip female members with no children if filter is enabled
            if (filterNoChildrenFemale && child.gender === 'female') {
              const grandchildIds = parentToChildrenMap.get(childId) || []
              if (grandchildIds.length === 0) {
                return // Skip this child - female with no children
              }
            }
            // For children, the label parent is the secondary parent of their parent
            children.push(buildTree(child, visited, nodeLabelParent, depth + 1))
          }
        })
      }

      return {
        name: member.name,
        surname: member.surname,
        memberId: member.id,
        gender: member.gender,
        generation: generations.get(member.id) || 1,
        depth,
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
        const tree = {
          name: rootName,
          surname: familySurname,
          generation: 0,
          depth: 0,
          children: [buildTree(rootMember)],
          isVirtualRoot: true,
        }
        return tree
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

    // Multiple roots: directly use them as children of virtual root
    const tree = {
      name: rootName,
      surname: familySurname,
      generation: 0,
      children: effectiveRoots.map(m => buildTree(m)),
      isVirtualRoot: true,
    }

    return tree
  }, [members, relations, familyName, familySurname, rootMemberId, filterNoChildrenFemale, maxGenerations])

  // Check for truncation after treeData is built
  useEffect(() => {
    if (!treeData) return

    // Use the ref that was set during tree building to detect truncation
    const isTruncated = truncationDetectedRef.current
    if (isTruncated !== truncationState.isTruncated) {
      setTruncationState({ isTruncated, truncatedAt: maxGenerations })
    }
  }, [treeData, maxGenerations])

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
      // x is the CENTER of this node (not the left edge)
      const nodeLeft = x - NODE_WIDTH / 2

      if (!node.children || node.children.length === 0) {
        return {
          ...node,
          x: nodeLeft,
          y,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
        }
      }

      const childY = y + NODE_HEIGHT + V_GAP

      // For single child, position directly under parent center
      if (node.children.length === 1) {
        const childPos = calcPositions(node.children[0], x, childY)
        return {
          ...node,
          x: nodeLeft,
          y,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          children: [childPos],
        }
      }

      // Multiple children: calculate total width and position them
      const totalWidth = node.children.reduce((sum, child) => sum + calcWidth(child), 0) + (node.children.length - 1) * H_GAP
      let childX = x - totalWidth / 2

      const positionedChildren: TreeNode[] = []
      node.children.forEach((child) => {
        const childWidth = calcWidth(child)
        const childCenterX = childX + childWidth / 2
        const childPos = calcPositions(child, childCenterX, childY)
        positionedChildren.push(childPos)
        childX += childWidth + H_GAP
      })

      return {
        ...node,
        x: nodeLeft,
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

  // Calculate tree bounds (for full tree screenshot)
  const getTreeBounds = (node: TreeNode, bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }): typeof bounds => {
    if (node.x !== undefined && node.y !== undefined) {
      const spouseWidth = node.spouses && node.spouses.length > 0 ? 88 : 0
      const nodeWidth = (node.isVirtualRoot ? NODE_WIDTH + 40 : NODE_WIDTH) + spouseWidth
      const nodeHeight = node.isVirtualRoot ? NODE_HEIGHT + 20 : NODE_HEIGHT
      bounds.minX = Math.min(bounds.minX, node.x)
      bounds.maxX = Math.max(bounds.maxX, node.x + nodeWidth)
      bounds.minY = Math.min(bounds.minY, node.y)
      bounds.maxY = Math.max(bounds.maxY, node.y + nodeHeight)
    }
    node.children?.forEach(child => getTreeBounds(child, bounds))
    return bounds
  }

  // Log all node positions for debugging
  const logNodePositions = (node: TreeNode, depth = 0) => {
    const indent = '  '.repeat(depth)
    if (node.x !== undefined && node.y !== undefined) {
      // Debug logging disabled
    }
    node.children?.forEach(child => logNodePositions(child, depth + 1))
  }

  // Export tree as SVG string (for full tree screenshot)
  const exportSvgAsDataUrl = (): string => {
    if (!positionedTree) {
      return ''
    }

    logNodePositions(positionedTree)

    const bounds = getTreeBounds(positionedTree)
    const padding = 100
    const svgWidth = bounds.maxX - bounds.minX + padding * 2
    const svgHeight = bounds.maxY - bounds.minY + padding * 2
    const offsetX = bounds.minX - padding
    const offsetY = bounds.minY - padding

    // Generate SVG content
    const renderConnectionsSVG = (node: TreeNode, hideLineName: boolean): string => {
      if (!node.children) return ''

      let svg = ''
      node.children.forEach((child) => {
        if (child.x === undefined || child.y === undefined || node.x === undefined || node.y === undefined) return

        const parentX = node.x + NODE_WIDTH / 2 - offsetX
        const parentY = node.y + NODE_HEIGHT - offsetY
        const childX = child.x + NODE_WIDTH / 2 - offsetX
        const childY = child.y - offsetY
        const midY = (parentY + childY) / 2

        // Check if single child with direct alignment - draw straight line
        const isSingleChild = node.children!.length === 1
        const isAligned = Math.abs(parentX - childX) < 2

        if (isSingleChild && isAligned) {
          svg += `<line x1="${parentX}" y1="${parentY}" x2="${childX}" y2="${childY}" stroke="#94a3b8" stroke-width="2"/>`
        } else {
          svg += `<line x1="${parentX}" y1="${parentY}" x2="${parentX}" y2="${midY}" stroke="#94a3b8" stroke-width="2"/>`
          svg += `<line x1="${childX}" y1="${midY}" x2="${childX}" y2="${childY}" stroke="#94a3b8" stroke-width="2"/>`
          svg += `<line x1="${parentX}" y1="${midY}" x2="${childX}" y2="${midY}" stroke="#94a3b8" stroke-width="2"/>`
        }

        // Label background and text (only for broken lines)
        if (child.labelParent && !hideLineName && (!isSingleChild || !isAligned)) {
          const isLabelParentMother = child.labelParent.relation === 'mother'
          const labelText = isLabelParentMother ? `母: ${child.labelParent.name}` : `父: ${child.labelParent.name}`
          const textWidth = labelText.length * 18 + 24
          const bgColor = child.labelParent.isDeceased ? '#e5e7eb' : '#fef3c7'
          const strokeColor = child.labelParent.isDeceased ? '#9ca3af' : '#f59e0b'
          const textColor = child.labelParent.isDeceased ? '#9ca3af' : '#92400e'

          svg += `<rect x="${childX - textWidth / 2}" y="${midY - 14}" width="${textWidth}" height="24" fill="${bgColor}" fill-opacity="0.5" stroke="${strokeColor}" stroke-opacity="0.5" stroke-width="1" rx="4"/>`
          svg += `<text x="${childX}" y="${midY + 5}" text-anchor="middle" font-size="14" fill="${textColor}" font-weight="500">${labelText}</text>`
        }

        svg += renderConnectionsSVG(child, hideLineName)
      })

      return svg
    }

    const renderNodeSVG = (node: TreeNode): string => {
      if (node.x === undefined || node.y === undefined) return ''

      const x = node.x - offsetX
      const y = node.y - offsetY

      // Virtual root node
      if (node.isVirtualRoot) {
        if (textMode) {
          return `<g>
            <text x="${x + (NODE_WIDTH + 40) / 2}" y="${y + (NODE_HEIGHT + 20) / 2}" text-anchor="middle" font-size="18" font-weight="bold" fill="#92400e">${node.name}</text>
            ${node.surname ? `<text x="${x + (NODE_WIDTH + 40) / 2}" y="${y + (NODE_HEIGHT + 20) / 2 + 20}" text-anchor="middle" font-size="12" fill="#b45309">${node.surname}氏宗谱</text>` : ''}
          </g>`
        }
        const rootWidth = NODE_WIDTH + 40
        const rootHeight = NODE_HEIGHT + 20
        return `<g>
          <rect x="${x}" y="${y}" width="${rootWidth}" height="${rootHeight}" fill="#fef3c7" stroke="#f59e0b" stroke-width="3" rx="12"/>
          <text x="${x + rootWidth / 2}" y="${y + rootHeight / 2 - 6}" text-anchor="middle" font-size="28" font-weight="bold" fill="#92400e">${node.name}</text>
          ${node.surname ? `<text x="${x + rootWidth / 2}" y="${y + rootHeight / 2 + 16}" text-anchor="middle" font-size="18" fill="#b45309">${node.surname}氏宗谱</text>` : ''}
        </g>`
      }

      const isMale = node.gender === 'male'
      const member = node.memberId ? members.find(m => m.id === node.memberId) : null
      const isDeceased = member?.is_deceased || false
      const textColor = isDeceased ? '#9ca3af' : '#4b5563'

      if (textMode) {
        // 文字模式 SVG 渲染
        const nameChars = node.name.split('')
        const charSpacing = 32
        const nameStartY = 30
        const nameEndY = nameStartY + (nameChars.length - 1) * charSpacing
        const nameX = x + NODE_WIDTH / 2

        let svg = '<g>'

        // 代数 - 显示在节点名字的左边
        if (node.generation > 0) {
          svg += `<text x="${x + 5}" y="${y + 15}" text-anchor="start" font-size="12" font-weight="bold" fill="#d97706">${node.generation}代</text>`
        }

        // 名字竖排
        nameChars.forEach((char, idx) => {
          svg += `<text x="${nameX}" y="${y + nameStartY + idx * charSpacing}" text-anchor="middle" font-size="28" font-weight="bold" fill="${textColor}">${char}</text>`
        })

        // 配偶 - 显示在节点名字的右边
        if (node.spouses && node.spouses.length > 0 && !hideSpouse) {
          svg += `<text x="${nameX + 22}" y="${y + (nameStartY + nameEndY) / 2 + 6}" text-anchor="start" font-size="13" fill="#9ca3af">${node.spouses.map(s => s.name).join('、')}</text>`
        }

        svg += '</g>'
        return svg
      }

      // 图形模式
      const bgColor = isDeceased ? '#d1d5db' : (isMale ? '#93c5fd' : '#f9a8d4')
      const borderColor = isDeceased ? '#9ca3af' : (isMale ? '#3b82f6' : '#ec4899')
      const normalTextColor = isDeceased ? '#6b7280' : '#1f2937'

      let svg = `<g>
        <rect x="${x}" y="${y}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" fill="${bgColor}" stroke="${borderColor}" stroke-width="2" rx="8"/>
        ${node.generation > 0 ? `<circle cx="${x + NODE_WIDTH - 10}" cy="${y + 10}" r="14" fill="${borderColor}"/><text x="${x + NODE_WIDTH - 10}" y="${y + 15}" text-anchor="middle" font-size="14" fill="white" font-weight="bold">${node.generation}代</text>` : ''}
        <text x="${x + NODE_WIDTH / 2}" y="${y + NODE_HEIGHT / 2 - 6}" text-anchor="middle" font-size="18" font-weight="bold" fill="${normalTextColor}">${node.name}</text>
        <text x="${x + NODE_WIDTH / 2}" y="${y + NODE_HEIGHT - 10}" text-anchor="middle" font-size="14" fill="${isDeceased ? '#9ca3af' : '#6b7280'}">${isMale ? '♂' : '♀'}</text>
      `

      // Spouses
      if (node.spouses && node.spouses.length > 0) {
        node.spouses.forEach((spouse, idx) => {
          const spouseBgColor = spouse.isDeceased ? '#d1d5db' : (spouse.gender === 'male' ? '#93c5fd' : '#f9a8d4')
          const spouseBorderColor = spouse.isDeceased ? '#9ca3af' : (spouse.gender === 'male' ? '#3b82f6' : '#ec4899')
          const spouseTextColor = spouse.isDeceased ? '#9ca3af' : '#1f2937'
          const spouseX = x + NODE_WIDTH + 8
          const spouseY = y + (node.spouses!.length - 1) * 35 / 2 - idx * 35
          const spouseWidth = 90
          const spouseHeight = 30

          svg += `<rect x="${spouseX}" y="${spouseY}" width="${spouseWidth}" height="${spouseHeight}" fill="${spouseBgColor}" stroke="${spouseBorderColor}" stroke-width="1" rx="4"/>`
          svg += `<text x="${spouseX + spouseWidth / 2}" y="${spouseY + spouseHeight / 2 + 5}" text-anchor="middle" font-size="14" fill="${spouseTextColor}">${spouse.name}</text>`
        })
      }

      svg += '</g>'
      return svg
    }

    const renderAllNodesSVG = (node: TreeNode): string => {
      let svg = renderNodeSVG(node)
      if (node.children) {
        node.children.forEach(child => {
          svg += renderAllNodesSVG(child)
        })
      }
      return svg
    }

    const connectionsSVG = renderConnectionsSVG(positionedTree, hideLineName)
    const nodesSVG = renderAllNodesSVG(positionedTree)

    const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="white"/>
  <defs>
    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" stroke-width="0.5"/>
    </pattern>
  </defs>
  <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="url(#grid)"/>
  ${connectionsSVG}
  ${nodesSVG}
</svg>`

    return svgContent
  }

  // Render connections with parent labels (for non-main family parents)
  const renderConnections = (node: TreeNode, hideLineName: boolean): React.ReactElement[] => {
    const elements: React.ReactElement[] = []

    if (!node.children) return elements

    node.children.forEach((child) => {
      if (child.x === undefined || child.y === undefined || node.x === undefined || node.y === undefined) return

      const parentX = node.x + NODE_WIDTH / 2
      const parentY = node.y + NODE_HEIGHT
      const childX = child.x + NODE_WIDTH / 2
      const childY = child.y

      const midY = (parentY + childY) / 2

      // Check if single child with direct alignment - draw straight line
      const isSingleChild = node.children!.length === 1
      const isAligned = Math.abs(parentX - childX) < 2

      if (isSingleChild && isAligned) {
        // Draw single straight vertical line
        elements.push(
          <line
            key={`${node.memberId}-${child.memberId}-v`}
            x1={parentX}
            y1={parentY}
            x2={childX}
            y2={childY}
            stroke="#94a3b8"
            strokeWidth="2"
          />
        )
      } else {
        // Draw broken line (vertical + horizontal + vertical)
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
      }

      // Draw label parent on the connection line (only if not hidden)
      if (child.labelParent && !hideLineName) {
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
            fillOpacity="0.5"
            stroke={child.labelParent.isDeceased ? '#9ca3af' : '#f59e0b'}
            strokeWidth="1"
            strokeOpacity="0.5"
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
      elements.push(...renderConnections(child, hideLineName))
    })

    return elements
  }

  // Render a single node with optional custom key
  const renderNode = (node: TreeNode, customKey?: string): React.ReactElement => {
    const key = customKey || node.memberId || node.name
    if (node.x === undefined || node.y === undefined) return <g key={key} />

    // Virtual root node styling
    if (node.isVirtualRoot) {
      if (textMode) {
        // 文字模式：只显示文字，无背景
        return (
          <g
            key={key}
            transform={`translate(${node.x}, ${node.y})`}
          >
            <text
              x={(NODE_WIDTH + 40) / 2}
              y={(NODE_HEIGHT + 20) / 2}
              textAnchor="middle"
              fontSize="18"
              fontWeight="bold"
              fill="#92400e"
            >
              {node.name}
            </text>
            {node.surname && (
              <text
                x={(NODE_WIDTH + 40) / 2}
                y={(NODE_HEIGHT + 20) / 2 + 20}
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
      return (
        <g
          key={key}
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
    const textColor = isDeceased ? '#9ca3af' : '#4b5563'

    if (textMode) {
      // 文字模式：只显示文字，无背景，名字竖排
      const nameChars = node.name.split('')
      const charSpacing = 32  // 每个字符的间距
      const nameStartY = 30   // 名字起始Y位置
      const nameEndY = nameStartY + (nameChars.length - 1) * charSpacing  // 最后一个字符的Y位置
      const nameX = NODE_WIDTH / 2  // 名字X位置居中

      return (
        <g
          key={key}
          transform={`translate(${node.x}, ${node.y})`}
          onClick={() => {
            if (onNodeClick && node.memberId) {
              const member = members.find(m => m.id === node.memberId)
              if (member) onNodeClick(member)
            }
          }}
          style={{ cursor: 'pointer' }}
        >
          {/* 代数 - 显示在节点名字的左边 */}
          {node.generation > 0 && (
            <text
              x={5}
              y={15}
              textAnchor="start"
              fontSize="12"
              fontWeight="bold"
              fill="#d97706"
            >
              {node.generation}代
            </text>
          )}

          {/* 名字竖排 - 从上到下，居中 */}
          {nameChars.map((char, idx) => (
            <text
              key={`char-${idx}`}
              x={nameX}
              y={nameStartY + idx * charSpacing}
              textAnchor="middle"
              fontSize="28"
              fontWeight="bold"
              fill={textColor}
            >
              {char}
            </text>
          ))}

          {/* 配偶 - 显示在节点名字的右边（如果未隐藏） */}
          {node.spouses && node.spouses.length > 0 && !hideSpouse && (
            <text
              x={nameX + 22}
              y={(nameStartY + nameEndY) / 2 + 6}
              textAnchor="start"
              fontSize="13"
              fill="#9ca3af"
            >
              {node.spouses.map(s => s.name).join('、')}
            </text>
          )}
        </g>
      )
    }

    // 图形模式：显示带背景的节点
    const bgColor = isDeceased ? '#d1d5db' : (isMale ? '#93c5fd' : '#f9a8d4')
    const borderColor = isDeceased ? '#9ca3af' : (isMale ? '#3b82f6' : '#ec4899')

    return (
      <g
        key={key}
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

        {/* Spouses - displayed to the right of the node (if not hidden) */}
        {node.spouses && node.spouses.length > 0 && !hideSpouse && node.spouses.map((spouse, idx) => {
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

  // Render all nodes recursively - add path parameter for unique keys
  const renderAllNodes = (node: TreeNode, path: string = ''): React.ReactElement[] => {
    const nodePath = path ? `${path}-${node.memberId || node.name}` : `${node.memberId || node.name}`
    const elements = [renderNode(node, nodePath)]
    if (node.children) {
      node.children.forEach((child, index) => {
        elements.push(...renderAllNodes(child, `${nodePath}-${index}`))
      })
    }
    return elements
  }

  // Mouse event handlers for pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    isDraggingRef.current = true
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    viewStartRef.current = { x: viewBoxRef.current.x, y: viewBoxRef.current.y }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return
    e.preventDefault()
    const currentScale = scaleRef.current
    const currentViewBox = viewBoxRef.current
    const dx = (e.clientX - dragStartRef.current.x) / currentScale
    const dy = (e.clientY - dragStartRef.current.y) / currentScale
    const newViewBox = {
      x: viewStartRef.current.x - dx,
      y: viewStartRef.current.y - dy,
      width: currentViewBox.width,
      height: currentViewBox.height,
    }
    viewBoxRef.current = newViewBox
    setViewBox(newViewBox)
  }

  const handleMouseUp = () => {
    isDraggingRef.current = false
  }

  // Handle wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const currentScale = scaleRef.current
    // 缩小是 deltaY > 0，放大是 deltaY < 0
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.min(Math.max(currentScale * delta, 0.2), 3)

    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    // 计算鼠标位置在世界坐标中的位置
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const currentViewBox = viewBoxRef.current
    const worldX = currentViewBox.x + (mouseX / currentViewBox.width) * currentViewBox.width
    const worldY = currentViewBox.y + (mouseY / currentViewBox.height) * currentViewBox.height

    // 计算新的 viewBox，保持鼠标指向的世界坐标点不变
    const newWidth = currentViewBox.width * (currentScale / newScale)
    const newHeight = currentViewBox.height * (currentScale / newScale)

    scaleRef.current = newScale
    const newViewBox = {
      x: worldX - (mouseX / newWidth) * newWidth,
      y: worldY - (mouseY / newHeight) * newHeight,
      width: newWidth,
      height: newHeight,
    }
    viewBoxRef.current = newViewBox
    setViewBox(newViewBox)
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
        暂无祖谱数据，请先添加成员
      </div>
    )
  }

  // Handle zoom with buttons - SVG viewBox缩放通过改变width/height实现
  const handleZoomIn = () => {
    // 计算当前视图中心在世界坐标中的位置
    const currentViewBox = viewBoxRef.current
    const currentScale = scaleRef.current
    const centerWorldX = currentViewBox.x + currentViewBox.width / 2
    const centerWorldY = currentViewBox.y + currentViewBox.height / 2
    // 放大：减小 viewBox 的宽高
    const newScale = Math.min(currentScale * 1.2, 3)
    const newWidth = currentViewBox.width / newScale * currentScale
    const newHeight = currentViewBox.height / newScale * currentScale
    // 保持中心点不变
    scaleRef.current = newScale
    const newViewBox = {
      x: centerWorldX - newWidth / 2,
      y: centerWorldY - newHeight / 2,
      width: newWidth,
      height: newHeight,
    }
    viewBoxRef.current = newViewBox
    setViewBox(newViewBox)
  }

  const handleZoomOut = () => {
    // 计算当前视图中心在世界坐标中的位置
    const currentViewBox = viewBoxRef.current
    const currentScale = scaleRef.current
    const centerWorldX = currentViewBox.x + currentViewBox.width / 2
    const centerWorldY = currentViewBox.y + currentViewBox.height / 2
    // 缩小：增大 viewBox 的宽高
    const newScale = Math.max(currentScale * 0.8, 0.2)
    const newWidth = currentViewBox.width / newScale * currentScale
    const newHeight = currentViewBox.height / newScale * currentScale
    // 保持中心点不变
    scaleRef.current = newScale
    const newViewBox = {
      x: centerWorldX - newWidth / 2,
      y: centerWorldY - newHeight / 2,
      width: newWidth,
      height: newHeight,
    }
    viewBoxRef.current = newViewBox
    setViewBox(newViewBox)
  }

  const handleResetView = () => {
    isInitialLoad.current = true
    scaleRef.current = 1
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
      const newViewBox = {
        x: bounds.minX - padding,
        y: bounds.minY - padding,
        width: Math.max(bounds.maxX - bounds.minX + padding * 2, 800),
        height: Math.max(bounds.maxY - bounds.minY + padding * 2, 600),
      }
      viewBoxRef.current = newViewBox
      setViewBox(newViewBox)
    }
  }

  return (
    <div className="relative w-full h-full">
      {/* 未配置家族姓氏警告 */}
      {!familySurname && (
        <div className="absolute top-4 left-4 z-10 p-3 bg-amber-50 border border-amber-200 rounded-lg shadow-md max-w-xs">
          <p className="text-sm text-amber-700">
            <span className="font-medium">提示：</span>请先在「祖谱信息」中配置家族姓氏
          </p>
        </div>
      )}
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
        {Math.round(scaleRef.current * 100)}%
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

          <g>{renderConnections(positionedTree, hideLineName)}</g>
          <g>{renderAllNodes(positionedTree)}</g>
        </svg>
      </div>
    </div>
  )
})
