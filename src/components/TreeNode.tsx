import React, { useMemo, useRef, useState, useEffect } from 'react'
import type { Member, MemberRelation } from '@/api/client'

interface TreeNode {
  name: string
  memberId?: number
  gender?: string
  generation: number
  mother?: string
  father?: string
  spouses?: { name: string; gender: string }[]
  children?: TreeNode[]
  // Position for rendering
  x?: number
  y?: number
  width?: number
  height?: number
}

interface GenealogyTreeProps {
  members: Member[]
  relations: MemberRelation[]
  onNodeClick?: (member: Member) => void
}

const NODE_WIDTH = 120
const NODE_HEIGHT = 80
const H_GAP = 50
const V_GAP = 120

export function GenealogyTree({ members, relations, onNodeClick }: GenealogyTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 1200, height: 800 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [viewStart, setViewStart] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)

  // Build tree structure with dynamic generation calculation
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

    // Find who is a child (appears as from_member_id in parent relations)
    const childMemberIds = new Set(parentChildRelations.map(r => r.from_member_id))

    // Root members: those who are not someone's child (no parent relations pointing to them as child)
    let rootMembers = members.filter(m => !childMemberIds.has(m.id))

    // If no roots found, use all members as potential roots
    if (rootMembers.length === 0) {
      rootMembers = [members[0]]
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

    // Build reverse map: parent_id -> child_ids
    const parentToChildrenMap = new Map<number, number[]>()
    parentChildRelations.forEach(rel => {
      const parentId = rel.to_member_id
      const childId = rel.from_member_id
      const existing = parentToChildrenMap.get(parentId) || []
      if (!existing.includes(childId)) {
        existing.push(childId)
      }
      parentToChildrenMap.set(parentId, existing)
    })

    // Calculate generations dynamically
    // Generation 1 = oldest generation (roots)
    const generations = new Map<number, number>()

    const calculateGeneration = (memberId: number, visited = new Set<number>()): number => {
      if (visited.has(memberId)) return 1 // Cycle detected
      visited.add(memberId)

      if (generations.has(memberId)) return generations.get(memberId)!

      const parents = childToParentMap.get(memberId)
      if (!parents || (!parents.fatherId && !parents.motherId)) {
        // Root member - generation 1
        generations.set(memberId, 1)
        return 1
      }

      // Get max parent generation + 1
      let maxParentGen = 0
      if (parents.fatherId && generations.has(parents.fatherId)) {
        maxParentGen = Math.max(maxParentGen, generations.get(parents.fatherId)!)
      }
      if (parents.motherId && generations.has(parents.motherId)) {
        maxParentGen = Math.max(maxParentGen, generations.get(parents.motherId)!)
      }

      // If parents not yet calculated, do recursive calculation
      if (parents.fatherId && !generations.has(parents.fatherId)) {
        calculateGeneration(parents.fatherId, new Set(visited))
      }
      if (parents.motherId && !generations.has(parents.motherId)) {
        calculateGeneration(parents.motherId, new Set(visited))
      }

      // Recalculate with full info
      let maxGen = 0
      if (parents.fatherId && generations.has(parents.fatherId)) {
        maxGen = Math.max(maxGen, generations.get(parents.fatherId)!)
      }
      if (parents.motherId && generations.has(parents.motherId)) {
        maxGen = Math.max(maxGen, generations.get(parents.motherId)!)
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
    const findSpouses = (memberId: number): { name: string; gender: string }[] => {
      const spouseRels = spouseRelations.filter(
        r => r.from_member_id === memberId || r.to_member_id === memberId
      )
      return spouseRels.map(rel => {
        const spouseId = rel.from_member_id === memberId ? rel.to_member_id : rel.from_member_id
        const spouse = memberMap.get(spouseId)
        return spouse ? { name: spouse.name, gender: spouse.gender } : null
      }).filter((s): s is { name: string; gender: string } => s !== null)
    }

    // Build tree recursively
    const buildTree = (member: Member, visited = new Set<number>()): TreeNode => {
      if (visited.has(member.id)) {
        return {
          name: member.name,
          memberId: member.id,
          gender: member.gender,
          generation: generations.get(member.id) || 1,
          spouses: [],
          children: [],
        }
      }
      visited.add(member.id)

      // Get parents
      const parents = childToParentMap.get(member.id)
      let mother: string | undefined
      let father: string | undefined

      if (parents?.fatherId) {
        const fatherMember = memberMap.get(parents.fatherId)
        father = fatherMember?.name
      }
      if (parents?.motherId) {
        const motherMember = memberMap.get(parents.motherId)
        mother = motherMember?.name
      }

      const spouses = findSpouses(member.id)

      // Find children - look in parentToChildrenMap
      const childIds = parentToChildrenMap.get(member.id) || []
      const children: TreeNode[] = []

      childIds.forEach(childId => {
        const child = memberMap.get(childId)
        if (child && !visited.has(childId)) {
          children.push(buildTree(child, visited))
        }
      })

      return {
        name: member.name,
        memberId: member.id,
        gender: member.gender,
        generation: generations.get(member.id) || 1,
        mother,
        father,
        spouses,
        children: children.length > 0 ? children : undefined,
      }
    }

    // Handle multiple roots
    if (rootMembers.length === 1) {
      return buildTree(rootMembers[0])
    }

    return {
      name: '家族',
      generation: 0,
      children: rootMembers.map(m => buildTree(m)),
    }
  }, [members, relations])

  // Calculate positions using a bottom-up layout
  const positionedTree = useMemo(() => {
    if (!treeData) return null

    // Calculate subtree width
    const calcWidth = (node: TreeNode): number => {
      if (!node.children || node.children.length === 0) {
        return NODE_WIDTH
      }
      const childrenWidth = node.children.reduce((sum, child) => sum + calcWidth(child), 0)
      return Math.max(NODE_WIDTH, childrenWidth + (node.children.length - 1) * H_GAP)
    }

    // Calculate positions recursively (top-down for y, children centered)
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

      // Position children first (bottom-up)
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

    // Start from center of tree at top
    const startX = viewBox.width / 2
    const startY = 50

    return calcPositions(treeData, startX, startY)
  }, [treeData, viewBox.width])

  // Render connections with parent labels
  const renderConnections = (node: TreeNode): React.ReactElement[] => {
    const elements: React.ReactElement[] = []

    if (!node.children) return elements

    node.children.forEach((child) => {
      if (child.x === undefined || child.y === undefined || node.x === undefined || node.y === undefined) return

      const parentX = node.x + NODE_WIDTH / 2
      const parentY = node.y + NODE_HEIGHT
      const childX = child.x + NODE_WIDTH / 2
      const childY = child.y

      // Calculate mid point for label
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

      // Draw parent labels on the connection line
      if (child.mother || child.father) {
        const labels: string[] = []
        if (child.mother) labels.push(`母: ${child.mother}`)
        if (child.father) labels.push(`父: ${child.father}`)
        const labelText = labels.join(' ')

        // Calculate text width (approximate)
        const textWidth = labelText.length * 8 + 16

        // Draw label background
        elements.push(
          <rect
            key={`${node.memberId}-${child.memberId}-label-bg`}
            x={childX - textWidth / 2}
            y={midY - 12}
            width={textWidth}
            height="20"
            fill="#fef3c7"
            stroke="#f59e0b"
            strokeWidth="1"
            rx="4"
          />
        )

        // Draw label text
        elements.push(
          <text
            key={`${node.memberId}-${child.memberId}-label`}
            x={childX}
            y={midY + 4}
            textAnchor="middle"
            fontSize="10"
            fill="#92400e"
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

    const isMale = node.gender === 'male'
    const bgColor = isMale ? '#93c5fd' : '#f9a8d4'
    const borderColor = isMale ? '#3b82f6' : '#ec4899'

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
          y={NODE_HEIGHT / 2 - 4}
          textAnchor="middle"
          fontSize="14"
          fontWeight="bold"
          fill="#1f2937"
        >
          {node.name.length > 6 ? node.name.slice(0, 6) + '...' : node.name}
        </text>

        {/* Gender indicator */}
        <text
          x={NODE_WIDTH / 2}
          y={NODE_HEIGHT / 2 + 14}
          textAnchor="middle"
          fontSize="11"
          fill="#6b7280"
        >
          {isMale ? '♂' : '♀'}
        </text>

        {/* Deceased indicator */}
        {node.memberId && (() => {
          const member = members.find(m => m.id === node.memberId)
          if (member?.is_deceased) {
            return (
              <line
                x1="10"
                y1="10"
                x2={NODE_WIDTH - 10}
                y2={NODE_HEIGHT - 10}
                stroke="#ef4444"
                strokeWidth="2"
                opacity="0.6"
              />
            )
          }
          return null
        })()}
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
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.min(Math.max(scale * delta, 0.3), 3)

    // Zoom towards mouse position
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const worldX = viewBox.x + mouseX / scale
    const worldY = viewBox.y + mouseY / scale

    setScale(newScale)
    setViewBox(prev => ({
      x: worldX - mouseX / newScale,
      y: worldY - mouseY / newScale,
      width: prev.width,
      height: prev.height,
    }))
  }

  // Update viewBox when tree changes
  useEffect(() => {
    if (!positionedTree) return

    // Calculate tree bounds
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

  return (
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
        {/* Background grid */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect x={viewBox.x - 1000} y={viewBox.y - 1000} width={viewBox.width + 2000} height={viewBox.height + 2000} fill="url(#grid)" />

        {/* Connections */}
        <g>{renderConnections(positionedTree)}</g>

        {/* Nodes */}
        <g>{renderAllNodes(positionedTree)}</g>
      </svg>
    </div>
  )
}
