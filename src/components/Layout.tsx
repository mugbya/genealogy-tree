import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Home,
  TreeDeciduous,
  Users,
  Settings,
  Tag,
  Link2,
  Menu,
  X,
  Bell,
  Search,
  ChevronRight,
  Shield,
  LogOut,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores'
import { Dropdown, DropdownItem } from '@/components/ui/dropdown'

const navItems = [
  { path: '/', label: '首页', icon: Home },
  { path: '/tree', label: '族谱树', icon: TreeDeciduous },
  { path: '/members', label: '成员', icon: Users },
  { path: '/relations', label: '关系', icon: Link2 },
  { path: '/tags', label: '标签', icon: Tag },
  { path: '/users', label: '用户管理', icon: Shield, adminOnly: true },
]

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, isAdmin, logout } = useAuthStore()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-zinc-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center gap-3 group">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25 group-hover:shadow-xl group-hover:shadow-indigo-500/30 transition-shadow">
                  <TreeDeciduous className="w-5 h-5 text-white" />
                </div>
                <div className="hidden sm:block">
                  <h1 className="font-semibold text-zinc-900 text-[0.9375rem] leading-none">族谱</h1>
                  <p className="text-[0.6875rem] text-zinc-500 mt-0.5">Family Tree</p>
                </div>
              </Link>

              {/* Desktop Nav */}
              <nav className="hidden lg:flex items-center gap-1 ml-8 pl-8 border-l border-zinc-200">
                {navItems
                  .filter((item) => !item.adminOnly || isAdmin)
                  .map((item) => {
                    const Icon = item.icon
                    const active = location.pathname === item.path
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                          active
                            ? "bg-zinc-100 text-zinc-900"
                            : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        {item.label}
                      </Link>
                    )
                  })}
              </nav>
            </div>

            {/* Right */}
            <div className="flex items-center gap-2">
              <button className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors">
                <Search className="w-4 h-4" />
              </button>
              <button className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors relative">
                <Bell className="w-4 h-4" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
              </button>

              <div className="w-px h-5 bg-zinc-200 mx-1 hidden sm:block" />

              {/* User */}
              <Dropdown
                trigger={
                  <button className="hidden sm:flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-zinc-100 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-medium">
                      {user?.username?.charAt(0).toUpperCase() || 'A'}
                    </div>
                    <div className="text-left hidden xl:block">
                      <p className="text-sm font-medium text-zinc-900 leading-none">
                        {user?.username || '未登录'}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {user?.role === 'admin' ? '管理员' : '普通用户'}
                      </p>
                    </div>
                  </button>
                }
                align="right"
              >
                <DropdownItem icon={<LogOut className="w-4 h-4" />} onClick={handleLogout}>
                  退出登录
                </DropdownItem>
              </Dropdown>

              {/* Settings */}
              <Link
                to="/settings"
                className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center transition-colors",
                  location.pathname === '/settings'
                    ? "bg-zinc-100 text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
                )}
              >
                <Settings className="w-4 h-4" />
              </Link>

              {/* Mobile menu button */}
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-zinc-100 transition-colors"
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={() => setMobileOpen(false)} />
          <div className="fixed top-16 left-0 right-0 z-50 bg-white border-b border-zinc-200 lg:hidden animate-fade-in">
            <nav className="max-w-7xl mx-auto px-4 py-3 space-y-1">
              {navItems
                .filter((item) => !item.adminOnly || isAdmin)
                .map((item) => {
                  const Icon = item.icon
                  const active = location.pathname === item.path
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                        active
                          ? "bg-zinc-100 text-zinc-900"
                          : "text-zinc-600 hover:bg-zinc-50"
                      )}
                    >
                      <Icon className="w-5 h-5" />
                      {item.label}
                      {active && <ChevronRight className="w-4 h-4 ml-auto text-zinc-400" />}
                    </Link>
                  )
                })}
            </nav>
          </div>
        </>
      )}

      {/* Main */}
      <main className="w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {children}
      </main>
    </div>
  )
}
