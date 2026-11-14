"use client";
import { Handle, Position, type NodeProps } from "reactflow";
import { DIAMOND, NODE_H, NODE_W, type DiamondNodeData, type FrameNodeData, type LaneNodeData, type StepNodeData, type TickNodeData } from "@/lib/ui/graphLayout";
import { fmtDay, fmtDow } from "@/lib/ui/format";
import { IconCheck, ModeIcon, MODE_LABEL } from "../icons";
import { TrustGlyph } from "../TrustBadge";

const hidden = "!h-1.5 !w-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent";

/** in/out for forward edges; back-in/back-out for edges drawn back in time. */
function Handles() {
  return (
    <>
      <Handle type="target" position={Position.Left} id="in" isConnectable={false} className={hidden} />
      <Handle type="source" position={Position.Right} id="out" isConnectable={false} className={hidden} />
      <Handle type="target" position={Position.Right} id="back-in" isConnectable={false} className={hidden} />
      <Handle type="source" position={Position.Left} id="back-out" isConnectable={false} className={hidden} />
    </>
  );
}

export function StepNode({ data, selected }: NodeProps<StepNodeData>) {
  const tone = data.done
    ? "border-done-line bg-done-soft text-done"
    : data.deadlocked
      ? "border-dashed border-amber-line bg-raised text-ink"
      : data.unresolved
        ? "border-dashed border-rule-strong bg-paper text-muted"
        : data.critical
          ? "border-accent bg-raised text-ink"
          : "border-rule-strong bg-raised text-ink";
  const ring = selected ? "ring-[3px] ring-accent/30" : "";
  return (
    <div
      style={{ width: NODE_W, height: NODE_H }}
      className={`group relative flex cursor-pointer flex-col justify-between rounded-md px-2.5 py-1.5 transition-shadow hover:shadow-[0_2px_8px_rgba(22,24,29,0.12)] ${data.critical && !data.done ? "border-2" : "border"} ${tone} ${ring}`}
      title={data.title}
    >
      <Handles />
      <p className={`line-clamp-2 text-[15px] font-medium leading-[18px] ${data.critical && !data.done ? "text-accent" : ""}`}>{data.title}</p>
      <div className="flex items-center gap-1.5 text-[14px] leading-4 text-muted">
        {data.done ? <IconCheck className="h-4 w-4 text-done" /> : <ModeIcon mode={data.mode} className="h-4 w-4 shrink-0" />}
        <span className="num truncate">
          {data.done ? "Already done" : data.unresolved ? "Not found" : data.startDate ? `${fmtDow(data.startDate)} ${fmtDay(data.startDate)}${data.estimated ? "*" : ""}` : MODE_LABEL[data.mode]}
        </span>
        <span className="ml-auto text-ink">
          <TrustGlyph trust={data.trust} />
        </span>
      </div>
      {data.conflict && (
        <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full border-2 border-raised bg-amber-dot" title="Sources disagree on this step" />
      )}
    </div>
  );
}

export function AnyOfNode({ data, selected }: NodeProps<DiamondNodeData>) {
  const tone = data.critical ? "border-accent bg-accent-soft" : "border-ink bg-raised";
  return (
    <div style={{ width: DIAMOND, height: DIAMOND }} className="relative cursor-pointer" title={`${data.label}: any one of these is enough`}>
      <Handles />
      <div className={`absolute inset-[3px] rotate-45 border-[1.5px] ${tone} ${selected ? "ring-[3px] ring-accent/30" : ""}`} />
      <div className="pointer-events-none absolute left-1/2 top-full mt-1 w-[150px] -translate-x-1/2 text-center text-[14px] leading-4 text-ink">
        <span className="block font-semibold uppercase tracking-[0.06em] text-muted">any of</span>
        {data.label !== "any of" && <span className="block">{data.label}</span>}
      </div>
    </div>
  );
}

export function LaneNode({ data }: NodeProps<LaneNodeData>) {
  return (
    <div style={{ width: data.width, height: data.height }} className={`border-t border-rule ${data.shade ? "bg-sunk/50" : ""}`}>
      <p className="w-[124px] px-3 pt-2 text-[14px] font-semibold leading-tight text-muted">{data.label}</p>
    </div>
  );
}

export function TickNode({ data }: NodeProps<TickNodeData>) {
  return (
    <div style={{ width: NODE_W, height: data.height }} className="relative">
      <p className="num text-[14px] font-semibold text-ink">
        <span className="text-muted">{fmtDow(data.label)}</span> {fmtDay(data.label)}
      </p>
      <div className="absolute bottom-0 left-0 top-6 border-l border-dashed border-rule-strong" />
    </div>
  );
}

export function FrameNode({ data }: NodeProps<FrameNodeData>) {
  return (
    <div style={{ width: data.width, height: data.height }} className="relative rounded-lg border border-dashed border-ink/40">
      <span className="absolute -bottom-[9px] right-2 bg-paper px-1 text-[14px] font-medium leading-4 text-muted">{data.label}</span>
    </div>
  );
}

export const nodeTypes = { step: StepNode, anyof: AnyOfNode, lane: LaneNode, tick: TickNode, frame: FrameNode };
