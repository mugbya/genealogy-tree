import { useMemo } from 'react'
import Tree from 'react-d3-tree'
import type { Member, MemberRelation } from '@/api/client'

interface TreeNode {
  name: string
  attributes?: Record<string, string | number | boolean>
  children?: TreeNode[]
  memberId?: number
  gender?: string
}

interface GenealogyTreeProps {
  members: Member[]
  relations: MemberRelation[]
  onNodeClick?: (member: Member) => void
}

export function GenealogyTree({ members, relations, onNodeClick }: GenealogyTreeProps) {
  const treeData = useMemo(() => {
    if (members.length === 0) return null

    const memberMap = new Map<number, Member>()
    members.forEach(m => memberMap.set(m.id, m))

    const childRelations = relations.filter(
      r => r.relation_type === 'son' || r.relation_type === 'daughter'
    )

    const childMemberIds = new Set(childRelations.map(r => r.to_member_id))
    const rootMembers = members.filter(m => !childMemberIds.has(m.id))

    const buildTree = (member: Member): TreeNode => {
      const children: TreeNode[] = []
      const spouseRelations = relations.filter(
        r => r.from_member_id === member.id && r.relation_type === 'spouse'
      )

      childRelations
        .filter(r => r.from_member_id === member.id || r.to_member_id === member.id)
        .forEach(rel => {
          const childId = rel.from_member_id === member.id ? rel.to_member_id : rel.from_member_id
          const child = memberMap.get(childId)
          if (child && !children.some(c => c.memberId === childId)) {
            children.push(buildTree(child))
          }
        })

      return {
        name: member.name,
        attributes: {
          '代系': member.generation || '-',
          '性别': member.gender === 'male' ? '男' : '女',
          '配偶': spouseRelations
            .map(r => {
              const spouseId = r.from_member_id === member.id ? r.to_member_id : r.from_member_id
              const spouse = memberMap.get(spouseId)
              return spouse?.name || ''
            })
            .filter(Boolean)
            .join(', ') || '无',
        } as Record<string, string | number | boolean>,
        children: children.length > 0 ? children : undefined,
        memberId: member.id,
        gender: member.gender,
      }
    }

    if (rootMembers.length === 0) {
      return buildTree(members[0])
    }

    if (rootMembers.length === 1) {
      return buildTree(rootMembers[0])
    }

    return {
      name: '家族',
      children: rootMembers.map(m => buildTree(m)),
    }
  }, [members, relations])

  const renderCustomNode = (props: { nodeDatum: TreeNode; toggleNode: () => void }) => {
    const { nodeDatum, toggleNode } = props
    return (
      <g onClick={() => {
        toggleNode()
        if (onNodeClick && nodeDatum.memberId) {
          const member = members.find(m => m.id === nodeDatum.memberId)
          if (member) onNodeClick(member)
        }
      }}>
        <circle
          r="25"
          fill={nodeDatum.gender === 'male' ? '#93c5fd' : '#f9a8d4'}
          stroke="#374151"
          strokeWidth="2"
        />
        <text fill="#1f2937" fontSize="12" textAnchor="middle" dy="4">
          {nodeDatum.name}
        </text>
        {nodeDatum.attributes && (
          <text fill="#6b7280" fontSize="10" textAnchor="middle" dy="40">
            {String(nodeDatum.attributes['代系'])}代
          </text>
        )}
      </g>
    )
  }

  if (!treeData) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        暂无族谱数据，请先添加成员
      </div>
    )
  }

  return (
    <div className="w-full h-96 border rounded-lg overflow-hidden">
      <Tree
        data={treeData}
        orientation="vertical"
        pathFunc="step"
        nodeSize={{ x: 100, y: 120 }}
        separation={{ siblings: 2, nonSiblings: 2 }}
        renderCustomNodeElement={renderCustomNode}
        zoomable
        draggable
      />
    </div>
  )
}
