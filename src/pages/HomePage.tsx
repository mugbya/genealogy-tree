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
  Cpu,
  Shield,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { systemApi, SystemInfo, NetworkInterface } from "@/api/client";

// 通过自定义 User-Agent 检测是否为桌面端（WebView）
const isDesktop = typeof window !== 'undefined' &&
  navigator.userAgent.includes('GenealogyDesktop')

// 服务状态类型
interface ServiceStatus {
  type: "free" | "platinum";
  expireDate?: string;
}

export function HomePage() {
  // 系统信息
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

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

  // 复制状态
  const [copied, setCopied] = useState<string | null>(null);

  // 刷新状态
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 获取系统信息
  const fetchSystemInfo = useCallback(async () => {
    setIsRefreshing(true);
    try {
      if (isDesktop) {
        // 桌面端：使用 Tauri invoke
        const info = await invoke<SystemInfo>("get_system_info");
        setSystemInfo(info);
      } else {
        // 网页版：通过 HTTP API 获取服务端系统信息
        const result = await systemApi.getSystemInfo();
        if (result.data) {
          setSystemInfo(result.data);
        } else if (result.error) {
          console.error("Failed to get system info:", result.error);
        }
      }
    } catch (err) {
      console.error("Failed to get system info:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

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

  useEffect(() => {
    fetchSystemInfo();
    fetchNetworkInterfaces();
  }, [fetchSystemInfo, fetchNetworkInterfaces]);

  // 格式化字节数
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

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
                  <h3 className="font-semibold text-gray-900 text-lg">族谱</h3>
                  <p className="text-sm text-muted-foreground">可视化谱系图</p>
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
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-cente-r shadow-lg shadow-amber-500/25">
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
                系统状态
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchSystemInfo}
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
            {/* 系统基本信息 */}
            <div className="grid grid-cols-3 gap-6 mb-6">
              {/* 软件版本 */}
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <Settings className="w-6 h-6 text-gray-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {systemInfo?.version || "-"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">软件版本</p>
              </div>

              {/* 内存 */}
              <div className="text-center">
                <div className="relative w-12 h-12 mx-auto mb-3">
                  <svg className="w-12 h-12 transform -rotate-90">
                    <circle
                      cx="24"
                      cy="24"
                      r="20"
                      strokeWidth="6"
                      className="stroke-gray-200"
                      fill="none"
                    />
                    <circle
                      cx="24"
                      cy="24"
                      r="20"
                      strokeWidth="6"
                      className="stroke-purple-500"
                      fill="none"
                      strokeDasharray={`${(systemInfo?.memory_usage || 0) * 1.26} 126`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-gray-700">
                    {Math.round(systemInfo?.memory_usage || 0)}%
                  </span>
                </div>
                <p className="text-lg font-semibold text-gray-900">内存</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {systemInfo
                    ? `${formatBytes(systemInfo.used_memory)} / ${formatBytes(systemInfo.total_memory)}`
                    : "-"}
                </p>
              </div>

              {/* 平台 */}
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center mx-auto mb-3">
                  <Monitor className="w-6 h-6 text-green-600" />
                </div>
                <p
                  className="text-lg font-bold text-gray-900 truncate"
                  title={systemInfo?.platform || "-"}
                >
                  {systemInfo?.platform?.split(" ")[0] || "-"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {systemInfo?.platform?.split(" ").slice(1).join(" ") || ""}
                </p>
              </div>
            </div>

            {/* CPU 多核心 */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                CPU 核心
              </h4>
              <div className="grid grid-cols-8 gap-2">
                {systemInfo?.cpu_cores.map((core, index) => (
                  <div
                    key={index}
                    className="text-center p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="relative w-10 h-10 mx-auto mb-1">
                      <svg className="w-10 h-10 transform -rotate-90">
                        <circle
                          cx="20"
                          cy="20"
                          r="16"
                          strokeWidth="4"
                          className="stroke-gray-200"
                          fill="none"
                        />
                        <circle
                          cx="20"
                          cy="20"
                          r="16"
                          strokeWidth="4"
                          className={cn(
                            "fill-none",
                            core.usage > 80
                              ? "stroke-red-500"
                              : core.usage > 50
                                ? "stroke-amber-500"
                                : "stroke-green-500",
                          )}
                          strokeDasharray={`${core.usage * 1.0} 100`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-gray-700">
                        {Math.round(core.usage)}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{core.name}</p>
                  </div>
                )) || (
                  <div className="col-span-full text-center text-sm text-gray-500 py-4">
                    加载中...
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 右侧区域 - 占据 1 列 */}
        <div className="space-y-6">
          {/* 服务状态 */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-600" />
                服务状态
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center text-center">
                <div
                  className={cn(
                    "w-20 h-20 rounded-3xl flex items-center justify-center mb-4",
                    serviceStatus.type === "platinum"
                      ? "bg-gradient-to-br from-amber-400 to-yellow-500 shadow-lg shadow-amber-500/30"
                      : "bg-gradient-to-br from-gray-400 to-gray-500 shadow-lg shadow-gray-500/30",
                  )}
                >
                  <Crown className="w-10 h-10 text-white" />
                </div>

                <Badge
                  variant={
                    serviceStatus.type === "platinum" ? "default" : "outline"
                  }
                  className={cn(
                    "px-4 py-1 text-sm font-medium",
                    serviceStatus.type === "platinum" &&
                      "bg-amber-500 hover:bg-amber-600",
                  )}
                >
                  {serviceStatus.type === "free" ? "免费版" : "白金版"}
                </Badge>

                {serviceStatus.type === "free" ? (
                  <p className="text-sm text-muted-foreground mt-4 max-w-[200px]">
                    升级白金版解锁更多功能
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground mt-4">
                    到期时间: {serviceStatus.expireDate || "2026-12-31"}
                  </p>
                )}

                {serviceStatus.type === "free" && (
                  <Button className="mt-4 bg-amber-500 hover:bg-amber-600 gap-2">
                    <Crown className="w-4 h-4" />
                    升级版本
                  </Button>
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
