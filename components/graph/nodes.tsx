"use client";
import { Handle, Position, type NodeProps } from "reactflow";
import { DIAMOND, NODE_W, type DiamondNodeData, type FrameNodeData, type LaneNodeData, type StepNodeData, type TickNodeData } from "@/lib/ui/graphLayout";
import { fmtDay, fmtDow } from "@/lib/ui/format";
import { IconCheck, ModeIcon, MODE_LABEL } from "../icons";
import { TrustGlyph } from "../TrustBadge";

const hidden = "!h-1.5 !w-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent";

function Handles() {
  return (
    <>
      <Handle type="target" position={Position.Left} id="in" isConnectable={false} className={hidden} />
      <Handle type="source" position={Position.Right} id="out" isConnectable={false} className={hidden} />
    </>
  );
}

type Extra = { faded?: boolean };

export function StepNode({ data, selected }: NodeProps<StepNodeData & Extra>) {
  const critical = data.critical && !data.done;
  const tone = data.done
    ? "border-done-line bg-done-soft text-done"
    : data.deadlocked
      ? "border-dashed border-amber-line bg-raised text-ink"
      : data.unresolved
        ? "border-dashed border-rule-strong bg-paper text-muted"
        : critical
          ? "border-accent bg-raised text-ink"
          : "border-rule bg-raised text-ink";
  return (
    <div
      style={{ width: NODE_W, height: data.height }}
      className={`relative flex cursor-pointer flex-col justify-between rounded-[5px] px-2.5 py-1.5 transition-[opacity,box-shadow] duration-150 ${critical ? "border-2" : "border"} ${tone} ${
        selected ? "shadow-[0_0_0_3px_rgba(0,53,128,0.25)]" : "hover:shadow-[0_1px_6px_rgba(22,24,29,0.12)]"
      } ${data.faded ? "opacity-45" : ""}`}
      title={data.title}
    >
      <Handles />
      <p className={`line-clamp-2 text-[15px] font-semibold leading-[18px] ${critical ? "text-accent" : ""}`}>{data.label}</p>
      <div className="flex items-center gap-1.5 text-[14px] leading-4 text-muted">
        {data.done ? <IconCheck className="h-4 w-4 text-done" /> : <ModeIcon mode={data.mode} className="h-4 w-4 shrink-0" />}
        <span className="num truncate">
          {data.done
            ? "Already done"
            : data.unresolved
              ? "Not found"
              : data.startDate
                ? `${fmtDow(data.startDate)} ${fmtDay(data.startDate)}${data.estimated ? "*" : ""}`
                : MODE_LABEL[data.mode]}
        </span>
        <span className="ml-auto text-ink">
          <TrustGlyph trust={data.trust} />
        </span>
      </div>
      {data.conflict && (
        <span className="absolute -right-2 -top-2 h-4 w-4 rounded-full border-2 border-raised bg-amber-dot" title="Sources disagree here: open the step to see why" />
      )}
    </div>
  );
}

export function AnyOfNode({ data, selected }: NodeProps<DiamondNodeData & Extra>) {
  const tone = data.critical ? "border-accent bg-accent-soft" : "border-ink bg-raised";
  return (
    <div
      style={{ width: DIAMOND, height: DIAMOND }}
      className={`relative cursor-pointer transition-opacity duration-150 ${data.faded ? "opacity-45" : ""}`}
      title={`${data.label || "This step"}: either one is enough`}
    >
      <Handles />
      <div className={`absolute inset-[3px] rotate-45 border-[1.5px] ${tone} ${selected ? "shadow-[0_0_0_3px_rgba(0,53,128,0.25)]" : ""}`} />
      {/* Opaque tag above the diamond, clear of the lines (they enter and leave at mid-height). */}
      <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-[4px] border border-rule-strong bg-paper px-1.5 py-0.5 text-[14px] leading-4 text-ink">
        {data.label ? `${data.label}: either one is enough` : "Either one is enough"}
      </span>
    </div>
  );
}

export function LaneNode({ data }: NodeProps<LaneNodeData>) {
  return (
    <div style={{ width: data.width, height: data.height }} className="border-t border-rule/70">
      <p className="w-[124px] px-3 pt-4 text-[14px] font-semibold leading-tight text-muted">{data.label}</p>
    </div>
  );
}

export function TickNode({ data }: NodeProps<TickNodeData>) {
  return (
    <div style={{ width: NODE_W, height: data.height }} className="relative">
      <p className="num text-[14px] text-muted">
        {fmtDow(data.label)} <span className="font-semibold text-ink">{fmtDay(data.label)}</span>
      </p>
      <div className="absolute bottom-0 left-0 top-6 border-l border-dotted border-rule-strong" />
    </div>
  );
}

export function FrameNode({ data }: NodeProps<FrameNodeData>) {
  return (
    <div style={{ width: data.width, height: data.height }} className="relative rounded-[7px] border border-dashed border-ink/35">
      <span className="absolute -bottom-[9px] right-2 bg-paper px-1 text-[14px] leading-4 text-muted">{data.label}</span>
    </div>
  );
}

export const nodeTypes = { step: StepNode, anyof: AnyOfNode, lane: LaneNode, tick: TickNode, frame: FrameNode };
