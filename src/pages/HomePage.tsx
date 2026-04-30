import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TreeDeciduous,
  Users,
  Settings,
  Monitor,
  Wifi,
  Crown,
  Copy,
  Check,
  Shield,
  RefreshCw,
  User,
  UsersRound,
  GitBranch,
  Key,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { systemApi, membersApi, NetworkInterface, licenseApi, LicenseInfo } from "@/api/client";

// 通过自定义 User-Agent 检测是否为桌面端（WebView）
const isDesktop = typeof window !== 'undefined' &&
  navigator.userAgent.includes('GenealogyDesktop')

// 服务状态类型
interface ServiceStatus {
  type: "free" | "platinum";
  expireDate?: string;
}

// 家族统计类型
interface FamilyStats {
  totalMembers: number;
  maleCount: number;
  femaleCount: number;
  deceasedCount: number;
  generationCount: number;
  surnameCounts: { surname: string; count: number }[];
}

// 检查授权是否过期
function isExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  const expDate = new Date(expiresAt);
  return expDate < new Date();
}

// 计算剩余天数
function parseDate(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

function getRemainingDays(expiresAt?: string | null): number | null {
  const date = parseDate(expiresAt);
  if (!date) return null;
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export function HomePage() {
  // 网络接口
  const [networkInterfaces, setNetworkInterfaces] = useState<
    NetworkInterface[]
  >([]);

  // 公网域名 (从配置读取 - TODO: 后续从配置中心读取)
  const [publicDomain] = useState<string>("");

  // 服务状态
  const [serviceStatus] = useState<ServiceStatus>({
    type: "free",
  });

  // 授权信息
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);

  // 家族统计
  const [familyStats, setFamilyStats] = useState<FamilyStats>({
    totalMembers: 0,
    maleCount: 0,
    femaleCount: 0,
    deceasedCount: 0,
    generationCount: 0,
    surnameCounts: [],
  });

  // 复制状态
  const [copied, setCopied] = useState<string | null>(null);

  // 刷新状态
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 获取网络接口
  const fetchNetworkInterfaces = useCallback(async () => {
    try {
      if (isDesktop) {
        // 桌面端：使用 Tauri invoke
        const ifaces = await invoke<NetworkInterface[]>("get_network_interfaces");
        setNetworkInterfaces(ifaces);
      } else {
        // 网页版：通过 HTTP API 获取服务端网络接口
        const result = await systemApi.getNetworkInterfaces();
        if (result.data) {
          setNetworkInterfaces(result.data);
        } else if (result.error) {
          console.error("Failed to get network interfaces:", result.error);
        }
      }
    } catch (err) {
      console.error("Failed to get network interfaces:", err);
    }
  }, []);

  // 获取授权信息
  const fetchLicenseInfo = useCallback(async () => {
    try {
      const result = await licenseApi.getInfo();
      if (result.data) {
        setLicenseInfo(result.data);
      }
    } catch (err) {
      console.error("Failed to get license info:", err);
    }
  }, []);

  // 获取家族统计
  const fetchFamilyStats = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const result = await membersApi.list();
      if (result.data) {
        const members = result.data;
        const maleCount = members.filter(m => m.gender === 'male').length;
        const femaleCount = members.filter(m => m.gender === 'female').length;
        const deceasedCount = members.filter(m => m.is_deceased).length;

        // 姓氏统计
        const surnameMap = new Map<string, number>();
        members.forEach(m => {
          const surname = m.surname || '未知';
          surnameMap.set(surname, (surnameMap.get(surname) || 0) + 1);
        });
        const surnameCounts = Array.from(surnameMap.entries())
          .map(([surname, count]) => ({ surname, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        // 代数统计：找出最大的代数
        let maxGeneration = 0;
        members.forEach(m => {
          if (m.generation) {
            const genNum = parseInt(m.generation, 10);
            if (!isNaN(genNum) && genNum > maxGeneration) {
              maxGeneration = genNum;
            }
          }
        });

        setFamilyStats({
          totalMembers: members.length,
          maleCount,
          femaleCount,
          deceasedCount,
          generationCount: maxGeneration,
          surnameCounts,
        });
      }
    } catch (err) {
      console.error("Failed to get family stats:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchNetworkInterfaces();
    fetchFamilyStats();
    fetchLicenseInfo();
  }, [fetchNetworkInterfaces, fetchFamilyStats, fetchLicenseInfo]);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  // 构建访问地址列表
  const lanAccessList = networkInterfaces
    .filter((iface) => !iface.is_loopback && iface.ip !== "127.0.0.1")
    .map((iface) => ({
      name: iface.name,
      url: iface.ip,
      port: 8080,
    }));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 顶部导航卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link to="/tree">
          <Card className="border-0 shadow-sm card card-hover cursor-pointer">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                  <TreeDeciduous className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg">祖谱</h3>
                  <p className="text-sm text-muted-foreground">祖谱信息与成员</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/users">
          <Card className="border-0 shadow-sm card card-hover cursor-pointer">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                  <Users className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg">
                    平台用户
                  </h3>
                  <p className="text-sm text-muted-foreground">管理用户账号</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/security">
          <Card className="border-0 shadow-sm card card-hover cursor-pointer">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/25">
                  <Shield className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg">
                    安全中心
                  </h3>
                  <p className="text-sm text-muted-foreground">账号安全设置</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/config">
          <Card className="border-0 shadow-sm card card-hover cursor-pointer">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                  <Settings className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg">
                    配置中心
                  </h3>
                  <p className="text-sm text-muted-foreground">系统参数设置</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* 中间区域：系统状态 + 服务状态 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 系统状态 - 占据 2 列 */}
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Monitor className="w-5 h-5 text-gray-600" />
                家族分布
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchFamilyStats}
                disabled={isRefreshing}
                className="gap-1"
              >
                <RefreshCw
                  className={cn("w-4 h-4", isRefreshing && "animate-spin")}
                />
                刷新
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* 基础统计 */}
            <div className="grid grid-cols-5 gap-4 mb-6">
              <div className="text-center p-4 rounded-xl bg-blue-50">
                <UsersRound className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900">{familyStats.totalMembers}</p>
                <p className="text-sm text-muted-foreground">总人数</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-amber-50">
                <GitBranch className="w-8 h-8 text-amber-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900">{familyStats.generationCount}</p>
                <p className="text-sm text-muted-foreground">代数</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-indigo-50">
                <User className="w-8 h-8 text-indigo-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900">{familyStats.maleCount}</p>
                <p className="text-sm text-muted-foreground">男</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-pink-50">
                <User className="w-8 h-8 text-pink-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900">{familyStats.femaleCount}</p>
                <p className="text-sm text-muted-foreground">女</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-gray-100">
                <Users className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900">{familyStats.deceasedCount}</p>
                <p className="text-sm text-muted-foreground">已故</p>
              </div>
            </div>

            {/* 姓氏分布 */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">姓氏分布</h4>
              {familyStats.surnameCounts.length > 0 ? (
                <div className="space-y-3">
                  {familyStats.surnameCounts.map((item, index) => {
                    const percentage = familyStats.totalMembers > 0
                      ? (item.count / familyStats.totalMembers * 100)
                      : 0;
                    return (
                      <div key={index} className="flex items-center gap-3">
                        <span className="w-16 text-sm font-medium text-gray-700">{item.surname}</span>
                        <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-500"
                            style={{ width: `${Math.round(percentage)}%` }}
                          />
                        </div>
                        <span className="w-12 text-sm text-gray-500 text-right">
                          {item.count}人 ({Math.round(percentage)}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center text-sm text-gray-500 py-8">
                  暂无家族成员数据
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 右侧区域 - 占据 1 列 */}
        <div className="space-y-6">
          {/* 服务状态 */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-600" />
                授权状态
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center text-center">
                <div
                  className={cn(
                    "w-20 h-20 rounded-3xl flex items-center justify-center mb-4",
                    licenseInfo?.is_valid
                      ? licenseInfo?.is_trial
                        ? "bg-gradient-to-br from-blue-500 to-cyan-600 shadow-lg shadow-blue-500/30"
                        : "bg-gradient-to-br from-amber-400 to-yellow-500 shadow-lg shadow-amber-500/30"
                      : "bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/30",
                  )}
                >
                  {licenseInfo?.is_valid ? (
                    licenseInfo?.is_trial ? (
                      <RefreshCw className="w-10 h-10 text-white" />
                    ) : (
                      <Crown className="w-10 h-10 text-white" />
                    )
                  ) : (
                    <Shield className="w-10 h-10 text-white" />
                  )}
                </div>

                <Badge
                  variant={licenseInfo?.is_valid ? "default" : "danger"}
                  className={cn(
                    "px-4 py-1 text-sm font-medium",
                    licenseInfo?.is_trial && licenseInfo?.is_valid
                      ? "bg-blue-500 hover:bg-blue-600"
                      : licenseInfo?.is_valid
                        ? "bg-amber-500 hover:bg-amber-600"
                        : "bg-red-500 hover:bg-red-600",
                  )}
                >
                  {!licenseInfo?.license_key
                    ? "未激活"
                    : licenseInfo?.is_trial
                      ? "试用版"
                      : licenseInfo?.license_type === "year"
                        ? "年度版"
                        : licenseInfo?.license_type === "permanent"
                          ? "永久版"
                          : licenseInfo?.is_valid
                            ? "已激活"
                            : "已过期"}
                </Badge>

                {/* 授权信息 */}
                <div className="w-full mt-4 space-y-2 text-sm">
                  {licenseInfo?.license_key && (
                    <div className="flex justify-between items-center p-2 rounded-lg bg-gray-50">
                      <span className="text-gray-500">许可证</span>
                      <span className="font-mono text-xs text-right">
                        {licenseInfo.license_key}
                      </span>
                    </div>
                  )}
                  {licenseInfo?.expires_at && (
                    <div className="flex justify-between items-center p-2 rounded-lg bg-gray-50">
                      <span className="text-gray-500">
                        {licenseInfo?.is_trial ? "试用到期" : licenseInfo?.license_type === "permanent" ? "有效期" : "到期时间"}
                      </span>
                      <span
                        className={cn(
                          licenseInfo?.license_type === "permanent"
                            ? "text-green-600 font-medium"
                            : licenseInfo?.is_valid ? "text-gray-700" : "text-red-600",
                        )}
                      >
                        {licenseInfo?.license_type === "permanent"
                          ? "永久有效"
                          : licenseInfo.expires_at}
                      </span>
                    </div>
                  )}
                  {!licenseInfo?.expires_at && licenseInfo?.license_type === "permanent" && (
                    <div className="flex justify-between items-center p-2 rounded-lg bg-gray-50">
                      <span className="text-gray-500">有效期</span>
                      <span className="text-green-600 font-medium">永久有效</span>
                    </div>
                  )}
                  {licenseInfo?.is_trial &&
                    licenseInfo?.trial_remaining_days !== undefined &&
                    licenseInfo?.trial_remaining_days !== null && (
                      <div className="flex justify-between items-center p-2 rounded-lg bg-gray-50">
                        <span className="text-gray-500">剩余</span>
                        <span
                          className={cn(
                            licenseInfo?.is_valid
                              ? "text-blue-600 font-medium"
                              : "text-red-600",
                          )}
                        >
                          {licenseInfo.is_valid
                            ? `${licenseInfo.trial_remaining_days} 天`
                            : "已过期"}
                        </span>
                      </div>
                    )}
                  {licenseInfo?.license_type === "year" && licenseInfo?.expires_at && (
                    <div className="flex justify-between items-center p-2 rounded-lg bg-gray-50">
                      <span className="text-gray-500">剩余天数</span>
                      <span
                        className={cn(
                          isExpired(licenseInfo.expires_at)
                            ? "text-red-600"
                            : "text-green-600 font-medium",
                        )}
                      >
                        {isExpired(licenseInfo.expires_at)
                          ? "已过期"
                          : `${getRemainingDays(licenseInfo.expires_at)} 天`}
                      </span>
                    </div>
                  )}
                </div>

                {/* 未激活或过期时显示提示 */}
                {!licenseInfo?.is_valid && licenseInfo?.license_key && (
                  <p className="text-sm text-red-600 mt-3">
                    授权已过期，请重新激活
                  </p>
                )}
                {!licenseInfo?.license_key && (
                  <p className="text-sm text-muted-foreground mt-3">
                    请激活授权以解锁全部功能
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 访问地址 */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Wifi className="w-5 h-5 text-gray-600" />
                访问地址
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 局域网访问 */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  局域网访问
                </h4>
                {lanAccessList.length > 0 ? (
                  <div className="space-y-2">
                    {lanAccessList.map((item, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <Wifi className="w-4 h-4 text-blue-600" />
                          <span className="font-medium text-gray-900 text-sm">
                            {item.url}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() =>
                              copyToClipboard(`http://${item.url}:${item.port}`)
                            }
                            className="w-7 h-7 rounded-lg hover:bg-white flex items-center justify-center transition-colors"
                            title="复制地址"
                          >
                            {copied === `http://${item.url}:${item.port}` ? (
                              <Check className="w-3.5 h-3.5 text-green-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-gray-500" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-sm text-gray-500 py-3 bg-gray-50 rounded-xl">
                    暂无可用的局域网地址
                  </div>
                )}
              </div>

              {/* 公网域名 */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  公网域名
                </h4>
                {publicDomain ? (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors group">
                    <div className="flex items-center gap-2">
                      <Wifi className="w-4 h-4 text-green-600" />
                      <span className="font-medium text-gray-900 text-sm">
                        {publicDomain}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          copyToClipboard(`http://${publicDomain}:8080`)
                        }
                        className="w-7 h-7 rounded-lg hover:bg-white flex items-center justify-center transition-colors"
                        title="复制地址"
                      >
                        {copied === `http://${publicDomain}:8080` ? (
                          <Check className="w-3.5 h-3.5 text-green-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-gray-500" />
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-sm text-gray-500 py-3 bg-gray-50 rounded-xl">
                    暂未配置公网域名
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
