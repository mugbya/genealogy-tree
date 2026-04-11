import { useMemo, useState } from "react";
import { useMembers, useCreateMember } from "@/hooks/useMembers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { GenealogyTree } from "@/components/TreeNode";
import type { Member } from "@/api/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  X,
  User,
  Calendar,
  MapPin,
  Briefcase,
  BookOpen,
  ZoomIn,
  ZoomOut,
  TreeDeciduous,
  Search,
  Users,
  Sparkles,
  Network,
  PanelRightClose,
  PanelRightOpen,
  Filter,
  Crown,
  Heart,
  ArrowRight,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TreeDensity = "comfortable" | "compact";

const genderLabelMap = {
  male: "男",
  female: "女",
} as const;

function getGenerationLabel(member: Member) {
  return member.generation ? `第 ${member.generation} 代` : "未设置代系";
}

function getMemberSubtitle(member: Member) {
  const parts = [member.birth_place || null, member.occupation || null].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "暂无更多基础信息";
}

function getInitials(name: string) {
  return name.trim().charAt(0) || "?";
}

export function TreePage() {
  const { data: membersData, isLoading } = useMembers();
  const createMember = useCreateMember();

  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isDetailCollapsed, setIsDetailCollapsed] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female">("all");
  const [density, setDensity] = useState<TreeDensity>("comfortable");
  const [formData, setFormData] = useState({
    name: "",
    gender: "male",
    generation: "",
  });

  const members = membersData?.data || [];

  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      const matchesKeyword =
        !searchKeyword.trim() ||
        member.name.toLowerCase().includes(searchKeyword.trim().toLowerCase()) ||
        (member.birth_place || "").toLowerCase().includes(searchKeyword.trim().toLowerCase()) ||
        (member.occupation || "").toLowerCase().includes(searchKeyword.trim().toLowerCase());

      const matchesGender = genderFilter === "all" || member.gender === genderFilter;

      return matchesKeyword && matchesGender;
    });
  }, [members, searchKeyword, genderFilter]);

  const stats = useMemo(() => {
    const maleCount = members.filter((member) => member.gender === "male").length;
    const femaleCount = members.filter((member) => member.gender === "female").length;
    const generationSet = new Set(
      members
        .map((member) => member.generation)
        .filter((generation): generation is number => typeof generation === "number"),
    );

    return {
      total: members.length,
      male: maleCount,
      female: femaleCount,
      generations: generationSet.size,
    };
  }, [members]);

  const highlightedMembers = useMemo(() => {
    return [...filteredMembers]
      .sort((a, b) => {
        const generationA = a.generation ?? Number.MAX_SAFE_INTEGER;
        const generationB = b.generation ?? Number.MAX_SAFE_INTEGER;
        if (generationA !== generationB) return generationA - generationB;
        return a.name.localeCompare(b.name, "zh-Hans-CN");
      })
      .slice(0, 6);
  }, [filteredMembers]);

  const selectedMemberInFiltered = selectedMember
    ? filteredMembers.some((member) => member.id === selectedMember.id)
    : false;

  const handleCreateSubmit = async () => {
    if (!formData.name.trim()) return;

    await createMember.mutateAsync({
      name: formData.name.trim(),
      gender: formData.gender,
      generation: formData.generation ? parseInt(formData.generation, 10) : undefined,
    });

    setFormData({ name: "", gender: "male", generation: "" });
    setIsCreateOpen(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(79,70,229,0.12),transparent_32%),radial-gradient(circle_at_top_right,rgba(99,102,241,0.08),transparent_28%)]" />
          <div className="relative flex flex-col gap-6 p-6 lg:flex-row lg:items-start lg:justify-between lg:p-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                家族谱系可视化工作台
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <TreeDeciduous className="h-6 w-6" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground lg:text-3xl">
                      族谱树
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground lg:text-base">
                      以更清晰的层级、节点与详情联动方式，查看整个家族的谱系结构
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-border bg-background/80 p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    成员总数
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-foreground">{stats.total}</div>
                </div>
                <div className="rounded-xl border border-border bg-background/80 p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Crown className="h-3.5 w-3.5" />
                    代系层级
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-foreground">
                    {stats.generations || 0}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-background/80 p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <User className="h-3.5 w-3.5" />
                    男性成员
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-foreground">{stats.male}</div>
                </div>
                <div className="rounded-xl border border-border bg-background/80 p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Heart className="h-3.5 w-3.5" />
                    女性成员
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-foreground">{stats.female}</div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:min-w-[280px] lg:max-w-[320px]">
              <div className="rounded-2xl border border-border bg-background/90 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Info className="h-4 w-4" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">浏览建议</p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      优先从上方代系成员开始浏览，点击节点后可在右侧查看详细资料与基础信息。
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={() => setIsZoomed(!isZoomed)}
                  className="flex-1 min-w-[120px]"
                >
                  {isZoomed ? (
                    <>
                      <ZoomOut className="h-4 w-4" />
                      收起画布
                    </>
                  ) : (
                    <>
                      <ZoomIn className="h-4 w-4" />
                      放大画布
                    </>
                  )}
                </Button>
                <Button onClick={() => setIsCreateOpen(true)} className="flex-1 min-w-[120px]">
                  <Plus className="h-4 w-4" />
                  添加成员
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card className="border-border shadow-sm">
            <CardHeader className="gap-4 border-b border-border pb-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Network className="h-5 w-5 text-primary" />
                    族谱树工作区
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    以稳定、清晰的方式展示家族层级结构，支持筛选后聚焦查看
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant={density === "comfortable" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDensity("comfortable")}
                  >
                    舒适视图
                  </Button>
                  <Button
                    variant={density === "compact" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDensity("compact")}
                  >
                    紧凑视图
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsDetailCollapsed(!isDetailCollapsed)}
                  >
                    {isDetailCollapsed ? (
                      <>
                        <PanelRightOpen className="h-4 w-4" />
                        展开详情
                      </>
                    ) : (
                      <>
                        <PanelRightClose className="h-4 w-4" />
                        收起详情
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_180px_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="搜索姓名、籍贯或职业"
                    className="h-11 pl-10"
                  />
                </div>

                <Select
                  value={genderFilter}
                  onChange={(e) => setGenderFilter(e.target.value as "all" | "male" | "female")}
                  options={[
                    { value: "all", label: "全部性别" },
                    { value: "male", label: "仅男性" },
                    { value: "female", label: "仅女性" },
                  ]}
                  className="h-11"
                />

                <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 text-sm text-muted-foreground">
                  <Filter className="h-4 w-4" />
                  当前显示 {filteredMembers.length} / {members.length} 位成员
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex h-[560px] items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary animate-pulse">
                      <TreeDeciduous className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">正在加载族谱树数据...</p>
                  </div>
                </div>
              ) : members.length === 0 ? (
                <div className="flex h-[560px] flex-col items-center justify-center px-6 text-center">
                  <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <TreeDeciduous className="h-12 w-12" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground">暂无族谱数据</h3>
                  <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    先添加家族成员，再逐步完善关系数据，系统即可生成更完整的家族谱系展示。
                  </p>
                  <Button onClick={() => setIsCreateOpen(true)} className="mt-6">
                    <Plus className="h-4 w-4" />
                    添加第一位成员
                  </Button>
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="flex h-[560px] flex-col items-center justify-center px-6 text-center">
                  <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Search className="h-10 w-10" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">没有匹配的成员</h3>
                  <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    你当前的筛选条件没有命中任何成员，可以尝试清空关键词或切换性别筛选。
                  </p>
                  <Button
                    variant="outline"
                    className="mt-6"
                    onClick={() => {
                      setSearchKeyword("");
                      setGenderFilter("all");
                    }}
                  >
                    重置筛选
                  </Button>
                </div>
              ) : (
                <div className="space-y-0">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">树形结构</Badge>
                      <Badge variant="outline">
                        {density === "comfortable" ? "舒适视图" : "紧凑视图"}
                      </Badge>
                      {selectedMember && selectedMemberInFiltered && (
                        <Badge variant="default">已选中：{selectedMember.name}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      支持拖拽与缩放，点击节点可查看成员详情
                    </p>
                  </div>

                  <div
                    className={cn(
                      "relative overflow-hidden bg-[linear-gradient(to_right,rgba(228,228,231,0.45)_1px,transparent_1px),linear-gradient(to_bottom,rgba(228,228,231,0.45)_1px,transparent_1px)] bg-[size:28px_28px]",
                      density === "comfortable" ? "h-[620px]" : "h-[520px]",
                      isZoomed && (density === "comfortable" ? "h-[760px]" : "h-[660px]"),
                    )}
                  >
                    <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between border-b border-border bg-background/85 px-5 py-3 backdrop-blur">
                      <div>
                        <p className="text-sm font-medium text-foreground">谱系主画布</p>
                        <p className="text-xs text-muted-foreground">
                          当前基于成员数据生成树形结构，后续可接入完整关系数据增强展示
                        </p>
                      </div>
                      <div className="hidden items-center gap-2 md:flex">
                        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
                          <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
                          男性
                        </div>
                        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
                          <span className="inline-block h-2 w-2 rounded-full bg-pink-400" />
                          女性
                        </div>
                      </div>
                    </div>

                    <div className="h-full pt-[68px]">
                      <GenealogyTree
                        members={filteredMembers}
                        relations={[]}
                        onNodeClick={setSelectedMember}
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">推荐浏览成员</CardTitle>
              <p className="text-sm text-muted-foreground">
                按代系与姓名排序，帮助你快速从关键节点开始浏览
              </p>
            </CardHeader>
            <CardContent>
              {highlightedMembers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                  暂无可推荐成员
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {highlightedMembers.map((member) => {
                    const isActive = selectedMember?.id === member.id;

                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => setSelectedMember(member)}
                        className={cn(
                          "group rounded-2xl border p-4 text-left transition-all",
                          isActive
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border bg-card hover:border-primary/30 hover:bg-muted/30",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <Avatar
                            size="lg"
                            fallback={getInitials(member.name)}
                            gender={member.gender as "male" | "female"}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate font-semibold text-foreground">
                                {member.name}
                              </p>
                              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Badge variant={member.gender === "male" ? "default" : "danger"}>
                                {genderLabelMap[member.gender as "male" | "female"] || "未知"}
                              </Badge>
                              <Badge variant="outline">{getGenerationLabel(member)}</Badge>
                            </div>
                            <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
                              {getMemberSubtitle(member)}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {!isDetailCollapsed && (
          <aside className="animate-slide-in">
            <Card className="sticky top-6 border-border shadow-sm">
              <CardHeader className="border-b border-border pb-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">成员详情</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      点击树节点后，在此查看成员基础资料
                    </p>
                  </div>
                  {selectedMember && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedMember(null)}
                      className="text-muted-foreground"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {!selectedMember ? (
                  <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                    <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <User className="h-8 w-8" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">请选择一位成员</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      你可以点击左侧族谱树中的节点，或从下方推荐成员中选择查看详情。
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6 p-6">
                    <div className="rounded-2xl border border-border bg-muted/20 p-5">
                      <div className="flex items-start gap-4">
                        <Avatar
                          size="xl"
                          fallback={getInitials(selectedMember.name)}
                          gender={selectedMember.gender as "male" | "female"}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-xl font-bold text-foreground">
                              {selectedMember.name}
                            </h3>
                            <Badge
                              variant={selectedMember.gender === "male" ? "default" : "danger"}
                            >
                              {genderLabelMap[selectedMember.gender as "male" | "female"] || "未知"}
                            </Badge>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Badge variant="outline">{getGenerationLabel(selectedMember)}</Badge>
                            {selectedMember.birth_date && (
                              <Badge variant="outline">{selectedMember.birth_date}</Badge>
                            )}
                          </div>
                          <p className="mt-4 text-sm leading-6 text-muted-foreground">
                            {getMemberSubtitle(selectedMember)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      <div className="rounded-xl border border-border bg-card p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Calendar className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              出生日期
                            </p>
                            <p className="mt-1 text-sm font-medium text-foreground">
                              {selectedMember.birth_date || "未知"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-border bg-card p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <MapPin className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              籍贯 / 出生地
                            </p>
                            <p className="mt-1 text-sm font-medium text-foreground">
                              {selectedMember.birth_place || "未知"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-border bg-card p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Briefcase className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              职业
                            </p>
                            <p className="mt-1 text-sm font-medium text-foreground">
                              {selectedMember.occupation || "未知"}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-border bg-card p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <User className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              代系
                            </p>
                            <p className="mt-1 text-sm font-medium text-foreground">
                              {getGenerationLabel(selectedMember)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-muted/20 p-5">
                      <div className="mb-3 flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium text-foreground">生平简介</p>
                      </div>
                      <p className="text-sm leading-7 text-muted-foreground">
                        {selectedMember.biography ||
                          "暂无生平简介，可在后续编辑中补充人物经历、家族贡献与重要事件。"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-dashed border-border bg-background p-4">
                      <p className="text-sm font-medium text-foreground">后续可扩展内容</p>
                      <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                        <li>• 配偶、父母、子女等关系链路展示</li>
                        <li>• 关系标签与颜色标识</li>
                        <li>• 节点定位、路径高亮与代系导航</li>
                      </ul>
                    </div>

                    <div className="flex gap-3 border-t border-border pt-4">
                      <Button variant="outline" className="flex-1">
                        查看关系
                      </Button>
                      <Button className="flex-1">编辑信息</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </aside>
        )}
      </section>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Plus className="h-4 w-4" />
              </div>
              添加新成员
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">姓名</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="请输入成员姓名"
                className="h-11"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">性别</label>
                <Select
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  options={[
                    { value: "male", label: "男" },
                    { value: "female", label: "女" },
                  ]}
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">代系</label>
                <Input
                  type="number"
                  value={formData.generation}
                  onChange={(e) => setFormData({ ...formData, generation: e.target.value })}
                  placeholder="如：1"
                  className="h-11"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleCreateSubmit}
              disabled={createMember.isPending || !formData.name.trim()}
            >
              {createMember.isPending ? "添加中..." : "添加成员"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
