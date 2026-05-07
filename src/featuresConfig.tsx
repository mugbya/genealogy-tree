import { FileText, Printer } from 'lucide-react'

export interface FeatureConfig {
  name: string  // 后端 LicenseFeature 的名称
  displayName: string  // 按钮显示名称
  icon: React.ReactNode  // 图标
  description: string  // 描述
  disabledIfNoAuth?: boolean  // 无授权时是否禁用按钮
}

// 功能按钮配置 - 在这里添加/删除需要授权的功能按钮
export const featuresConfig: FeatureConfig[] = [
  {
    name: 'export_html',
    displayName: '导出HTML',
    icon: <FileText className="w-4 h-4" />,
    description: '导出族谱为HTML格式',
    disabledIfNoAuth: true,
  },
  {
    name: 'export_word',
    displayName: '导出Word',
    icon: <Printer className="w-4 h-4" />,
    description: '导出族谱为Word格式',
    disabledIfNoAuth: false, // Word导出暂未实现
  },
  {
    name: 'export_volume',
    displayName: '分册导出',
    icon: <FileText className="w-4 h-4" />,
    description: '分册导出族谱',
    disabledIfNoAuth: true,
  },
]
