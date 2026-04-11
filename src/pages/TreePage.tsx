import { useMemo, useState } from "react";
import { useMembers, useCreateMember } from "@/hooks/useMembers";
import { Card, CardContent } from "@/components/ui/card";
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
  TreeDeciduous,
  Search,
} from "lucide-react";

const genderLabelMap = {
  male: "男",
  female: "女",
} as const;

function getGenerationLabel(member: Member) {
  return member.generation ? `第 ${member.generation} 代` : "未设置代系";
}

function getMemberSubtitle(member: Member) {
  const parts = [member.birth_place || null, member.occupation || null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "暂无更多信息";
}

function getInitials(name: string) {
  return name.trim().charAt(0) || "?";
}

export function TreePage() {
  const { data: membersData, isLoading } = useMembers();
  const createMember = useCreateMember();

  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female">("all");
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
    <div className="flex h-full flex-col gap-4 animate-fade-in">
      {/* ─── Toolbar ─── */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-white px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-2 pr-2">
          <TreeDeciduous className="h-5 w-5 text-primary" />
          <span className="text-base font-semibold text-foreground">族谱</span>
        </div>

        <div className="h-5 w-px bg-border" />

        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="搜索姓名、籍贯或职业"
            className="h-9 pl-9 text-sm"
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
          className="h-9 w-[110px] text-sm"
        />

        {(searchKeyword || genderFilter !== "all") && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {filteredMembers.length} / {members.length} 人
          </span>
        )}

        <div className="ml-auto">
          <Button size="sm" onClick={() => setIsCreateOpen(true)} className="h-9">
            <Plus className="h-4 w-4" />
            添加成员
          </Button>
        </div>
      </div>

      {/* ─── Main Content: Canvas + Detail Panel ─── */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        {/* ─── Tree Canvas ─── */}
        <div className="relative h-[calc(100vh-12rem)] overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary animate-pulse">
                  <TreeDeciduous className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">正在加载族谱数据...</p>
              </div>
            </div>
          ) : members.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 text-primary">
                <TreeDeciduous className="h-12 w-12" />
              </div>
              <h3 className="text-xl font-semibold text-foreground">暂无族谱数据</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                先添加家族成员，再逐步完善关系数据，系统即可生成家族谱系展示。
              </p>
              <Button onClick={() => setIsCreateOpen(true)} className="mt-6">
                <Plus className="h-4 w-4" />
                添加第一位成员
              </Button>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Search className="h-10 w-10" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">没有匹配的成员</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                当前筛选条件没有命中任何成员，可以尝试清空关键词或切换性别筛选。
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
            <GenealogyTree
              members={filteredMembers}
              relations={[]}
              onNodeClick={setSelectedMember}
            />
          )}
        </div>

        {/* ─── Detail Panel ─── */}
        <aside className="hidden xl:block">
          <Card className="sticky top-6 border-border shadow-sm">
            <CardContent className="p-0">
              {!selectedMember ? (
                <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                    <User className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-medium text-foreground">选择成员查看详情</p>
                  <p className="mt-1 text-xs text-muted-foreground">点击族谱树中的节点卡片</p>
                </div>
              ) : (
                <div className="space-y-5 p-5">
                  {/* Profile header */}
                  <div className="flex items-start gap-4">
                    <Avatar
                      size="xl"
                      fallback={getInitials(selectedMember.name)}
                      gender={selectedMember.gender as "male" | "female"}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-lg font-semibold text-foreground">
                          {selectedMember.name}
                        </h3>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelectedMember(null)}
                          className="ml-auto h-7 w-7 shrink-0 text-muted-foreground"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant={selectedMember.gender === "male" ? "default" : "danger"}>
                          {genderLabelMap[selectedMember.gender as "male" | "female"] || "未知"}
                        </Badge>
                        <Badge variant="outline">{getGenerationLabel(selectedMember)}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {getMemberSubtitle(selectedMember)}
                      </p>
                    </div>
                  </div>

                  <div className="h-px bg-border" />

                  {/* Info fields */}
                  <div className="space-y-3">
                    <DetailRow
                      icon={<Calendar className="h-4 w-4" />}
                      label="出生日期"
                      value={selectedMember.birth_date}
                    />
                    {selectedMember.death_date && (
                      <DetailRow
                        icon={<Calendar className="h-4 w-4" />}
                        label="逝世日期"
                        value={selectedMember.death_date}
                      />
                    )}
                    <DetailRow
                      icon={<MapPin className="h-4 w-4" />}
                      label="籍贯"
                      value={selectedMember.birth_place}
                    />
                    <DetailRow
                      icon={<Briefcase className="h-4 w-4" />}
                      label="职业"
                      value={selectedMember.occupation}
                    />
                  </div>

                  {/* Biography */}
                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">生平简介</span>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground">
                      {selectedMember.biography ||
                        "暂无生平简介，可在编辑中补充人物经历与重要事件。"}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-1">
                    <Button variant="outline" className="flex-1" size="sm">
                      查看关系
                    </Button>
                    <Button className="flex-1" size="sm">
                      编辑信息
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* ─── Create Member Dialog ─── */}
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

/* ─── Detail Row ─── */

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium text-foreground">{value || "未知"}</p>
      </div>
    </div>
  );
}
