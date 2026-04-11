import { Link } from "react-router-dom";
import { useState } from "react";
import {
  ArrowRight,
  Calendar,
  ChevronRight,
  Edit,
  Heart,
  MoreHorizontal,
  Plus,
  Tag,
  Trash2,
  TreeDeciduous,
  Users,
} from "lucide-react";

import { useHealthCheck, useMembers, useCreateMember } from "@/hooks/useMembers";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type QuickEntry = {
  to: string;
  title: string;
  description: string;
  icon: typeof Users;
  accentClassName: string;
};

type SummaryCard = {
  title: string;
  value: React.ReactNode;
  description: string;
  icon: typeof Users;
  iconClassName: string;
  valueClassName?: string;
};

const quickEntries: QuickEntry[] = [
  {
    to: "/tree",
    title: "族谱树",
    description: "查看可视化谱系图",
    icon: TreeDeciduous,
    accentClassName: "bg-indigo-50 text-indigo-700 border-indigo-100",
  },
  {
    to: "/members",
    title: "成员管理",
    description: "维护成员基础信息",
    icon: Users,
    accentClassName: "bg-blue-50 text-blue-700 border-blue-100",
  },
  {
    to: "/relations",
    title: "关系管理",
    description: "维护家族关系记录",
    icon: ArrowRight,
    accentClassName: "bg-violet-50 text-violet-700 border-violet-100",
  },
  {
    to: "/tags",
    title: "标签管理",
    description: "配置关系与身份标签",
    icon: Tag,
    accentClassName: "bg-rose-50 text-rose-700 border-rose-100",
  },
];

export function HomePage() {
  const { data: healthData, isLoading: healthLoading } = useHealthCheck();
  const { data: membersData, isLoading: membersLoading } = useMembers();
  const createMember = useCreateMember();

  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    gender: "male",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    setIsAdding(true);
    try {
      await createMember.mutateAsync(formData);
      setFormData({ name: "", gender: "male" });
    } finally {
      setIsAdding(false);
    }
  };

  const members = membersData?.data ?? [];
  const memberCount = members.length;
  const isSystemOnline = Boolean(healthData?.data);
  const treeStatusText = memberCount > 0 ? "已生成" : "待创建";
  const treeDescription = memberCount > 0 ? `已形成 ${memberCount} 个节点` : "添加成员后开始构建";
  const relationCount = 0;

  const summaryCards: SummaryCard[] = [
    {
      title: "家族成员",
      value: membersLoading ? <Skeleton className="h-8 w-16" /> : memberCount,
      description: memberCount > 0 ? `当前已录入 ${memberCount} 位成员` : "当前尚未录入成员",
      icon: Users,
      iconClassName: "bg-blue-50 text-blue-700 border-blue-100",
      valueClassName: "text-zinc-950",
    },
    {
      title: "族谱树",
      value: membersLoading ? <Skeleton className="h-8 w-24" /> : treeStatusText,
      description: treeDescription,
      icon: TreeDeciduous,
      iconClassName: "bg-indigo-50 text-indigo-700 border-indigo-100",
      valueClassName: "text-zinc-950",
    },
    {
      title: "关系数量",
      value: membersLoading ? <Skeleton className="h-8 w-12" /> : relationCount,
      description: relationCount > 0 ? "已建立家族关系记录" : "尚未建立关系记录",
      icon: ArrowRight,
      iconClassName: "bg-emerald-50 text-emerald-700 border-emerald-100",
      valueClassName: "text-zinc-950",
    },
    {
      title: "系统状态",
      value: healthLoading ? (
        <Skeleton className="h-8 w-20" />
      ) : (
        <span className="inline-flex items-center gap-2">
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              isSystemOnline ? "bg-emerald-500" : "bg-red-500",
            )}
          />
          {isSystemOnline ? "在线" : "离线"}
        </span>
      ),
      description: isSystemOnline ? "本地服务连接正常" : "请检查本地服务连接状态",
      icon: Heart,
      iconClassName: "bg-rose-50 text-rose-700 border-rose-100",
      valueClassName: isSystemOnline ? "text-emerald-700" : "text-red-700",
    },
  ];

  return (
    <div className="space-y-6 lg:space-y-8">
      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-col gap-6 p-6 lg:flex-row lg:items-start lg:justify-between lg:p-8">
          <div className="max-w-3xl space-y-4">
            <div className="space-y-2">
              <div className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                家族总览
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 lg:text-4xl">
                  欢迎回来
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-zinc-600 lg:text-base">
                  在这里查看当前家族数据概览、快速录入成员，并继续进入族谱树、成员管理、关系管理与标签管理。
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <p className="text-xs font-medium text-zinc-500">当前成员数</p>
                <p className="mt-1 text-xl font-semibold text-zinc-950">
                  {membersLoading ? <Skeleton className="h-7 w-14" /> : memberCount}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <p className="text-xs font-medium text-zinc-500">族谱状态</p>
                <p className="mt-1 text-xl font-semibold text-zinc-950">
                  {membersLoading ? <Skeleton className="h-7 w-20" /> : treeStatusText}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <p className="text-xs font-medium text-zinc-500">系统连接</p>
                <p
                  className={cn(
                    "mt-1 text-xl font-semibold",
                    healthLoading
                      ? "text-zinc-950"
                      : isSystemOnline
                        ? "text-emerald-700"
                        : "text-red-700",
                  )}
                >
                  {healthLoading ? (
                    <Skeleton className="h-7 w-16" />
                  ) : isSystemOnline ? (
                    "在线"
                  ) : (
                    "离线"
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-70">
            <Link to="/tree">
              <Button className="h-10 w-full justify-center gap-2 lg:w-auto" variant="default">
                <TreeDeciduous className="h-4 w-4" />
                进入族谱树
              </Button>
            </Link>
            <Link to="/members">
              <Button className="h-10 w-full justify-center gap-2 lg:w-auto" variant="outline">
                <Users className="h-4 w-4" />
                管理成员
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((item) => {
          const Icon = item.icon;

          return (
            <Card key={item.title} className="border-zinc-200 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-zinc-500">{item.title}</p>
                      <div
                        className={cn("text-2xl font-semibold tracking-tight", item.valueClassName)}
                      >
                        {item.value}
                      </div>
                    </div>
                    <p className="text-sm leading-6 text-zinc-600">{item.description}</p>
                  </div>

                  <div
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border",
                      item.iconClassName,
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,8fr)_minmax(280px,4fr)]">
        <Card className="border-zinc-200 shadow-sm">
          <CardHeader className="border-b border-zinc-100 pb-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-lg text-zinc-950">快速添加成员</CardTitle>
                <CardDescription>
                  保持现有快捷录入方式，先录入姓名与性别，后续再补充完整成员资料。
                </CardDescription>
              </div>
              <Badge variant={createMember.isSuccess ? "success" : "outline"}>
                {createMember.isSuccess ? "添加成功" : "快捷入口"}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 p-6">
            <form
              onSubmit={handleSubmit}
              className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_120px_120px]"
            >
              <div className="space-y-2">
                <label htmlFor="member-name" className="text-sm font-medium text-zinc-700">
                  成员姓名
                </label>
                <Input
                  id="member-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="请输入成员姓名"
                  className="h-10"
                  disabled={isAdding}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="member-gender" className="text-sm font-medium text-zinc-700">
                  性别
                </label>
                <Select
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  options={[
                    { value: "male", label: "男" },
                    { value: "female", label: "女" },
                  ]}
                  className="h-10 w-full"
                  disabled={isAdding}
                />
              </div>

              <div className="space-y-2">
                <span className="block text-sm font-medium text-transparent">操作</span>
                <Button
                  type="submit"
                  disabled={isAdding || !formData.name}
                  className="h-10 w-full gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {isAdding ? "添加中..." : "添加成员"}
                </Button>
              </div>
            </form>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
              建议先完成基础录入，再前往“成员管理”补充出生日期、代系、出生地、工作与照片等详细信息。
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 shadow-sm">
          <CardHeader className="border-b border-zinc-100 pb-4">
            <CardTitle className="text-lg text-zinc-950">快捷入口</CardTitle>
            <CardDescription>保持原有模块入口，便于继续处理家族数据。</CardDescription>
          </CardHeader>

          <CardContent className="grid gap-3 p-6">
            {quickEntries.map((item) => {
              const Icon = item.icon;

              return (
                <Link key={item.to} to={item.to} className="group">
                  <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
                        item.accentClassName,
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-900">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">{item.description}</p>
                    </div>

                    <ChevronRight className="h-4 w-4 text-zinc-400 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="border-zinc-200 shadow-sm">
          <CardHeader className="border-b border-zinc-100 pb-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg text-zinc-950">家族成员</CardTitle>
                  <Badge variant="outline">{memberCount}</Badge>
                </div>
                <CardDescription>
                  展示最近可见成员摘要，保持原有列表信息与查看全部入口。
                </CardDescription>
              </div>

              <Link to="/members">
                <Button
                  variant="ghost"
                  className="h-9 gap-1 px-0 text-sm text-primary hover:bg-transparent"
                >
                  查看全部
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            {membersLoading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[...Array(6)].map((_, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-4"
                  >
                    <Skeleton variant="circular" className="h-12 w-12" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                  </div>
                ))}
              </div>
            ) : members.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {members.slice(0, 6).map((member) => (
                  <div
                    key={member.id}
                    className="group rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                  >
                    <div className="flex items-start gap-4">
                      <Avatar
                        size="lg"
                        fallback={member.name.charAt(0)}
                        gender={member.gender as "male" | "female"}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-zinc-950">
                              {member.name}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Badge variant={member.gender === "male" ? "default" : "danger"}>
                                {member.gender === "male" ? "男" : "女"}
                              </Badge>
                              {member.generation && (
                                <span className="text-xs text-zinc-500">
                                  第 {member.generation} 代
                                </span>
                              )}
                            </div>
                          </div>

                          <Dropdown
                            trigger={
                              <button className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900">
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            }
                            align="right"
                          >
                            <DropdownItem icon={<Edit className="h-4 w-4" />}>
                              编辑信息
                            </DropdownItem>
                            <DropdownItem icon={<Users className="h-4 w-4" />}>
                              查看关系
                            </DropdownItem>
                            <DropdownSeparator />
                            <DropdownItem icon={<Trash2 className="h-4 w-4" />} danger>
                              删除成员
                            </DropdownItem>
                          </Dropdown>
                        </div>

                        <div className="mt-4 space-y-2 text-sm text-zinc-600">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-zinc-400" />
                            <span>成员编号：{member.id}</span>
                          </div>

                          {member.birth_date ? (
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-zinc-400" />
                              <span>{member.birth_date}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-zinc-400" />
                              <span>暂未填写出生日期</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-14 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-zinc-200 bg-white">
                  <Users className="h-8 w-8 text-zinc-400" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-zinc-950">暂无成员</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-600">
                  当前还没有家族成员数据。您可以先通过上方快捷录入添加第一位成员，再逐步补充完整家谱信息。
                </p>
                <div className="mt-6 flex justify-center">
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    添加成员
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
