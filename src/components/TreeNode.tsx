import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Tree from "react-d3-tree";
import { Crosshair, Maximize2, Minimize2, Minus, Plus, Users } from "lucide-react";
import type { Member, MemberRelation } from "@/api/client";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface TreeNodeDatum {
  name: string;
  children?: TreeNodeDatum[];
  memberId?: number;
  gender?: string;
  generation?: number;
  birthPlace?: string;
  occupation?: string;
  spouseNames?: string[];
  isVirtualRoot?: boolean;
}

interface GenealogyTreeProps {
  members: Member[];
  relations: MemberRelation[];
  onNodeClick?: (member: Member) => void;
}

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const CARD_W = 260;
const CARD_H = 120;
const CARD_RX = 16;
const HALF_W = CARD_W / 2; // 130
const HALF_H = CARD_H / 2; // 60

const DEFAULT_ZOOM = 0.75;
const ZOOM_STEP = 0.15;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function getInitial(name: string): string {
  return name.trim().charAt(0) || "?";
}

function getGenerationLabel(gen?: number): string {
  return gen != null ? `第${gen}代` : "未设代系";
}

function getMeta(birthPlace?: string, occupation?: string): string {
  return [birthPlace, occupation].filter(Boolean).join(" · ");
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/* ================================================================== */
/*  Build tree data (core logic preserved)                             */
/* ================================================================== */

function buildTreeData(members: Member[], relations: MemberRelation[]): TreeNodeDatum | null {
  if (members.length === 0) return null;

  const memberMap = new Map<number, Member>();
  members.forEach((m) => memberMap.set(m.id, m));

  const childRelations = relations.filter(
    (r) => r.relation_type === "son" || r.relation_type === "daughter",
  );
  const spouseRelations = relations.filter((r) => r.relation_type === "spouse");

  const childIds = new Set<number>();
  childRelations.forEach((r) => {
    if (memberMap.has(r.to_member_id)) childIds.add(r.to_member_id);
  });

  const rootMembers = members.filter((m) => !childIds.has(m.id));
  const visited = new Set<number>();

  const getSpouseNames = (id: number): string[] =>
    spouseRelations
      .flatMap((r) => {
        if (r.from_member_id === id) return [r.to_member_id];
        if (r.to_member_id === id) return [r.from_member_id];
        return [];
      })
      .map((sid) => memberMap.get(sid)?.name)
      .filter((n): n is string => Boolean(n));

  const getChildren = (id: number): Member[] => {
    const ids = new Set<number>();
    childRelations.forEach((r) => {
      if (r.from_member_id === id && memberMap.has(r.to_member_id)) ids.add(r.to_member_id);
    });
    return Array.from(ids)
      .map((cid) => memberMap.get(cid))
      .filter((m): m is Member => Boolean(m))
      .sort((a, b) => {
        const ga = a.generation ?? Number.MAX_SAFE_INTEGER;
        const gb = b.generation ?? Number.MAX_SAFE_INTEGER;
        if (ga !== gb) return ga - gb;
        return a.name.localeCompare(b.name, "zh-Hans-CN");
      });
  };

  const buildNode = (member: Member): TreeNodeDatum => {
    if (visited.has(member.id)) {
      return {
        name: member.name,
        memberId: member.id,
        gender: member.gender,
        generation: member.generation,
        birthPlace: member.birth_place,
        occupation: member.occupation,
        spouseNames: getSpouseNames(member.id),
      };
    }
    visited.add(member.id);
    const children = getChildren(member.id).map(buildNode);
    return {
      name: member.name,
      memberId: member.id,
      gender: member.gender,
      generation: member.generation,
      birthPlace: member.birth_place,
      occupation: member.occupation,
      spouseNames: getSpouseNames(member.id),
      children: children.length > 0 ? children : undefined,
    };
  };

  const sortedRoots = (rootMembers.length > 0 ? rootMembers : [members[0]]).sort((a, b) => {
    const ga = a.generation ?? Number.MAX_SAFE_INTEGER;
    const gb = b.generation ?? Number.MAX_SAFE_INTEGER;
    if (ga !== gb) return ga - gb;
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });

  if (sortedRoots.length === 1) return buildNode(sortedRoots[0]);

  return {
    name: "家族谱系",
    isVirtualRoot: true,
    children: sortedRoots.map(buildNode),
  };
}

/* ================================================================== */
/*  Fullscreen hook                                                    */
/* ================================================================== */

function useFullscreen(ref: React.RefObject<HTMLDivElement | null>) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onChange = () => setActive(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [ref]);

  const toggle = useCallback(async () => {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      await document.exitFullscreen();
    } else if (!document.fullscreenElement) {
      await el.requestFullscreen();
    }
  }, [ref]);

  return { isFullscreen: active, toggleFullscreen: toggle };
}

/* ================================================================== */
/*  Smooth curved path for connections (cubic bezier "smooth-step")    */
/* ================================================================== */

function smoothStepPath(
  link: {
    source: { x: number; y: number };
    target: { x: number; y: number };
  },
  _orientation: string,
): string {
  const { source, target } = link;
  const midY = (source.y + target.y) / 2;
  return [
    `M${source.x},${source.y}`,
    `C${source.x},${midY}`,
    `${target.x},${midY}`,
    `${target.x},${target.y}`,
  ].join(" ");
}

/* ================================================================== */
/*  Main Component                                                     */
/* ================================================================== */

export function GenealogyTree({ members, relations, onNodeClick }: GenealogyTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [size, setSize] = useState({ w: 1200, h: 720 });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [treeKey, setTreeKey] = useState(0);
  const { isFullscreen, toggleFullscreen } = useFullscreen(containerRef);

  /* ---- derived data --------------------------------------------- */

  const memberMap = useMemo(() => {
    const m = new Map<number, Member>();
    members.forEach((mb) => m.set(mb.id, mb));
    return m;
  }, [members]);

  const treeData = useMemo(() => buildTreeData(members, relations), [members, relations]);

  /* ---- resize observer ------------------------------------------ */

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const sync = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(r.width, 640), h: Math.max(r.height, 480) });
    };
    sync();
    const obs = new ResizeObserver(sync);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const translate = useMemo(() => ({ x: size.w / 2, y: 64 }), [size.w]);

  /* ---- toolbar handlers ----------------------------------------- */

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(+(z + ZOOM_STEP).toFixed(2), MAX_ZOOM));
    setTreeKey((k) => k + 1);
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(+(z - ZOOM_STEP).toFixed(2), MIN_ZOOM));
    setTreeKey((k) => k + 1);
  }, []);

  const handleCenter = useCallback(() => {
    setZoom(DEFAULT_ZOOM);
    setTreeKey((k) => k + 1);
  }, []);

  /* ---- node renderer -------------------------------------------- */

  const renderNode = ({
    nodeDatum,
    toggleNode,
  }: {
    nodeDatum: TreeNodeDatum;
    toggleNode: () => void;
  }) => {
    /* ---------- virtual root node ---------- */
    if (nodeDatum.isVirtualRoot) {
      return (
        <g>
          <defs>
            <linearGradient id="vroot-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6366F1" stopOpacity={0.1} />
              <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.18} />
            </linearGradient>
          </defs>
          <rect
            x={-84}
            y={-26}
            width={168}
            height={52}
            rx={26}
            fill="url(#vroot-grad)"
            stroke="#C7D2FE"
            strokeWidth={1.5}
          />
          <text
            x={0}
            y={1}
            fill="#4F46E5"
            fontSize="14"
            fontWeight="600"
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ letterSpacing: "0.04em", textRendering: "geometricPrecision" }}
          >
            {nodeDatum.name}
          </text>
        </g>
      );
    }

    /* ---------- regular member card ---------- */

    const member = nodeDatum.memberId ? memberMap.get(nodeDatum.memberId) : undefined;
    const id = nodeDatum.memberId ?? 0;
    const hovered = hoveredId === id;
    const selected = selectedId === id;
    const female = nodeDatum.gender === "female";

    /* --- colour palette --- */
    const accent = female ? "#E11D48" : "#4F46E5";
    const accentLight = female ? "#FFF1F2" : "#EEF2FF";
    const grad1 = female ? "#FB7185" : "#818CF8";
    const grad2 = female ? "#E11D48" : "#4338CA";

    /* --- state-driven visuals --- */
    const shadowStd = selected ? "14" : hovered ? "10" : "7";
    const shadowDy = selected ? "5" : hovered ? "3" : "2";
    const shadowColor = selected ? "rgba(79,70,229,0.18)" : "rgba(0,0,0,0.07)";
    const borderColor = selected ? accent : hovered ? (female ? "#FDA4AF" : "#A5B4FC") : "#F4F4F5";
    const borderW = selected ? 2 : hovered ? 1.5 : 1;

    /* --- content --- */
    const initial = getInitial(nodeDatum.name);
    const genLabel = getGenerationLabel(nodeDatum.generation);
    const meta = getMeta(nodeDatum.birthPlace, nodeDatum.occupation);
    const spouseText =
      nodeDatum.spouseNames && nodeDatum.spouseNames.length > 0
        ? `配偶：${nodeDatum.spouseNames.join("、")}`
        : "";

    /* --- layout coordinates --- */
    const avCx = -HALF_W + 34;
    const avCy = -8;
    const avR = 18;

    const nameX = avCx + avR + 14;
    const nameY = -18;

    const pillX = nameX;
    const pillY = 0;
    const pillW = Math.max(genLabel.length * 10 + 16, 52);
    const pillH = 20;

    const metaX = -HALF_W + 18;
    const metaY = HALF_H - 18;

    const handleClick = () => {
      toggleNode();
      setSelectedId(id);
      if (member && onNodeClick) onNodeClick(member);
    };

    return (
      <g
        onClick={handleClick}
        onMouseEnter={() => setHoveredId(id)}
        onMouseLeave={() => setHoveredId((cur) => (cur === id ? null : cur))}
        style={{ cursor: "pointer" }}
      >
        {/* ---- per-node defs ---- */}
        <defs>
          <clipPath id={`clip-${id}`}>
            <rect x={-HALF_W} y={-HALF_H} width={CARD_W} height={CARD_H} rx={CARD_RX} />
          </clipPath>

          <linearGradient id={`av-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={grad1} />
            <stop offset="100%" stopColor={grad2} />
          </linearGradient>

          <filter id={`sh-${id}`} x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy={shadowDy} stdDeviation={shadowStd} floodColor={shadowColor} />
          </filter>
        </defs>

        {/* ---- shadow layer ---- */}
        <rect
          x={-HALF_W}
          y={-HALF_H}
          width={CARD_W}
          height={CARD_H}
          rx={CARD_RX}
          fill="#FFFFFF"
          filter={`url(#sh-${id})`}
        />

        {/* ---- clipped content: white fill + accent bar ---- */}
        <g clipPath={`url(#clip-${id})`}>
          <rect x={-HALF_W} y={-HALF_H} width={CARD_W} height={CARD_H} fill="#FFFFFF" />
          <rect x={-HALF_W} y={-HALF_H} width={CARD_W} height={3} fill={accent} />
        </g>

        {/* ---- border (rendered on top of clip for clean edges) ---- */}
        <rect
          x={-HALF_W}
          y={-HALF_H}
          width={CARD_W}
          height={CARD_H}
          rx={CARD_RX}
          fill="none"
          stroke={borderColor}
          strokeWidth={borderW}
          style={{ transition: "stroke .2s ease, stroke-width .2s ease" }}
        />

        {/* ---- avatar circle with gradient ---- */}
        <circle cx={avCx} cy={avCy} r={avR} fill={`url(#av-${id})`} />
        <text
          x={avCx}
          y={avCy}
          fill="#FFFFFF"
          fontSize="13"
          fontWeight="500"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ textRendering: "geometricPrecision" }}
        >
          {initial}
        </text>

        {/* ---- name ---- */}
        <text
          x={nameX}
          y={nameY}
          fill="#18181B"
          fontSize="14"
          fontWeight="500"
          dominantBaseline="middle"
          style={{ textRendering: "geometricPrecision" }}
        >
          {truncate(nodeDatum.name, 8)}
        </text>

        {/* ---- generation pill ---- */}
        <rect x={pillX} y={pillY} width={pillW} height={pillH} rx={pillH / 2} fill={accentLight} />
        <text
          x={pillX + pillW / 2}
          y={pillY + pillH / 2 + 1}
          fill={accent}
          fontSize="10"
          fontWeight="400"
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ textRendering: "geometricPrecision" }}
        >
          {genLabel}
        </text>

        {/* ---- meta: birthplace · occupation ---- */}
        {meta && (
          <text
            x={metaX}
            y={metaY}
            fill="#71717A"
            fontSize="11"
            fontWeight="400"
            style={{ textRendering: "geometricPrecision" }}
          >
            {truncate(meta, 20)}
          </text>
        )}

        {/* ---- spouse (fade-in on hover, rendered below the card) ---- */}
        {spouseText && (
          <text
            x={0}
            y={HALF_H + 20}
            fill="#A1A1AA"
            fontSize="10"
            fontWeight="400"
            textAnchor="middle"
            opacity={hovered ? 1 : 0}
            style={{ transition: "opacity .2s ease", textRendering: "geometricPrecision" }}
          >
            {truncate(spouseText, 24)}
          </text>
        )}
      </g>
    );
  };

  /* ================================================================ */
  /*  Empty state                                                      */
  /* ================================================================ */

  if (!treeData) {
    return (
      <div className="flex h-full min-h-96 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-white">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-50">
          <Users className="h-7 w-7 text-zinc-300" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">暂无族谱数据</p>
          <p className="mt-1 text-xs text-muted-foreground">请先添加家族成员，开始构建族谱</p>
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  Main render                                                      */
  /* ================================================================ */

  return (
    <div
      ref={containerRef}
      className={[
        "relative h-full w-full overflow-hidden bg-white",
        isFullscreen ? "fixed inset-0 z-50" : "rounded-2xl border border-border",
      ].join(" ")}
    >
      {/* ---- subtle dot grid background ---- */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle, #d4d4d8 0.75px, transparent 0.75px)",
          backgroundSize: "24px 24px",
          opacity: 0.4,
        }}
      />

      {/* ---- tree canvas (full area, no header offset) ---- */}
      <div
        key={treeKey}
        className={[
          "absolute inset-0",
          "[&_.rd3t-link]:stroke-zinc-300",
          "[&_.rd3t-link]:stroke-[1.5px]",
          "[&_.rd3t-link]:[stroke-linecap:round]",
          "[&_.rd3t-node]:outline-none",
        ].join(" ")}
      >
        <Tree
          data={treeData}
          orientation="vertical"
          pathFunc={smoothStepPath as any}
          translate={translate}
          nodeSize={{ x: 320, y: 200 }}
          separation={{ siblings: 1.2, nonSiblings: 1.4 }}
          renderCustomNodeElement={renderNode as any}
          zoomable
          draggable
          collapsible
          initialDepth={5}
          zoom={zoom}
          scaleExtent={{ min: MIN_ZOOM, max: MAX_ZOOM }}
          enableLegacyTransitions
          transitionDuration={300}
        />
      </div>

      {/* ---- floating toolbar (bottom-center, glassmorphism) ---- */}
      <div className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2">
        <div className="flex items-center gap-1 rounded-full border border-zinc-200/60 bg-white/80 px-4 py-2 shadow-lg backdrop-blur-xl">
          {/* gender legend */}
          <div className="flex items-center gap-3 pr-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" />男
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />女
            </span>
          </div>

          <Separator />

          {/* zoom out */}
          <ToolbarButton onClick={handleZoomOut} title="缩小">
            <Minus className="h-3.5 w-3.5" />
          </ToolbarButton>

          {/* zoom in */}
          <ToolbarButton onClick={handleZoomIn} title="放大">
            <Plus className="h-3.5 w-3.5" />
          </ToolbarButton>

          <Separator />

          {/* fit to center */}
          <ToolbarButton onClick={handleCenter} title="回到中心">
            <Crosshair className="h-3.5 w-3.5" />
          </ToolbarButton>

          {/* fullscreen */}
          <ToolbarButton onClick={toggleFullscreen} title={isFullscreen ? "退出全屏" : "全屏"}>
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </ToolbarButton>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Tiny private sub-components for the toolbar                        */
/* ================================================================== */

function Separator() {
  return <div className="mx-1.5 h-4 w-px bg-zinc-200" />;
}

function ToolbarButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
    >
      {children}
    </button>
  );
}
