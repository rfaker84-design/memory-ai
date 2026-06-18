"use client";
import { useRef, useEffect, useCallback, useState } from "react";
import type { MemoryNode, MemoryEdge, LayoutNode, LayoutEdge } from "../../lib/graph-types";
import { EDGE_COLORS, NODE_EMOTION_COLORS } from "../../lib/graph-types";

interface Props {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
  onNodeClick: (node: MemoryNode) => void;
  onNodeSelect: (nodeIds: string[]) => void;
  selectedIds: string[];
}

const CANVAS_W = 900;
const CANVAS_H = 650;
const NODE_R = 22;
const REPULSION = 2800;
const ATTRACTION = 0.008;
const DAMPING = 0.82;
const EDGE_FLOW_SPEED = 0.6;

export default function MemoryGraphCanvas({ nodes, edges, onNodeClick, onNodeSelect, selectedIds }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<{ lnodes: LayoutNode[]; ledges: LayoutEdge[] }>({ lnodes: [], ledges: [] });
  const dragRef = useRef<{ nodeId: string | null; ox: number; oy: number }>({ nodeId: null, ox: 0, oy: 0 });
  const animRef = useRef(0);
  const flowOffsetRef = useRef(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // ��ʼ������
  const initLayout = useCallback(() => {
    const lnodes: LayoutNode[] = nodes.map((n, i) => {
      const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1);
      const r = Math.min(CANVAS_W, CANVAS_H) * 0.32;
      return {
        id: n.id, data: n,
        x: CANVAS_W / 2 + Math.cos(angle) * r,
        y: CANVAS_H / 2 + Math.sin(angle) * r,
        vx: 0, vy: 0, selected: selectedIds.includes(n.id),
      };
    });

    const ledges: LayoutEdge[] = edges.map(e => ({
      from: e.from, to: e.to, strength: e.strength, relation: e.relation,
    }));

    layoutRef.current = { lnodes, ledges };
  }, [nodes, edges, selectedIds]);

  useEffect(() => { initLayout(); }, [initLayout]);

  // ������ģ�� + ��Ⱦѭ��
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;

    const tick = () => {
      if (!running) return;
      const { lnodes, ledges } = layoutRef.current;
      if (!lnodes.length) { animRef.current = requestAnimationFrame(tick); return; }

      // ������
      for (let i = 0; i < lnodes.length; i++) {
        const a = lnodes[i];
        if (a.fx !== undefined && a.fy !== undefined) { a.x = a.fx; a.y = a.fy; a.vx = 0; a.vy = 0; continue; }

        let fx = 0, fy = 0;

        // ��������
        fx += (CANVAS_W / 2 - a.x) * 0.001;
        fy += (CANVAS_H / 2 - a.y) * 0.001;

        // �ڵ���ų�
        for (let j = 0; j < lnodes.length; j++) {
          if (i === j) continue;
          const b = lnodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = REPULSION / (dist * dist);
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        }

        a.vx = (a.vx + fx) * DAMPING;
        a.vy = (a.vy + fy) * DAMPING;
        a.x += a.vx;
        a.y += a.vy;
      }

      // ������
      for (const edge of ledges) {
        const a = lnodes.find(n => n.id === edge.from);
        const b = lnodes.find(n => n.id === edge.to);
        if (!a || !b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) continue;
        const force = dist * ATTRACTION * edge.strength;
        const fx = (dx / dist) * force, fy = (dy / dist) * force;
        if (a.fx === undefined) { a.vx += fx; a.vy += fy; }
        if (b.fx === undefined) { b.vx -= fx; b.vy -= fy; }
      }

      flowOffsetRef.current += 0.015;

      // ��Ⱦ
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      // ��
      for (const edge of ledges) {
        const a = lnodes.find(n => n.id === edge.from);
        const b = lnodes.find(n => n.id === edge.to);
        if (!a || !b) continue;

        const alpha = 0.12 + edge.strength * 0.25;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = EDGE_COLORS[edge.relation] || "rgba(150,150,200,";
        ctx.strokeStyle = ctx.strokeStyle.replace(/[^,]+\)$/, alpha + ")");
        ctx.lineWidth = 0.5 + edge.strength * 2;
        ctx.stroke();

        // �������
        const t = (flowOffsetRef.current * EDGE_FLOW_SPEED * edge.strength) % 1;
        const fx = a.x + (b.x - a.x) * t;
        const fy = a.y + (b.y - a.y) * t;
        ctx.beginPath();
        ctx.arc(fx, fy, 2, 0, Math.PI * 2);
        ctx.fillStyle = EDGE_COLORS[edge.relation].replace(/[^,]+\)$/, "0.7)");
        ctx.fill();
      }

      // �ڵ�
      for (const node of lnodes) {
        const color = NODE_EMOTION_COLORS[node.data.emotion] || NODE_EMOTION_COLORS.default;
        const isSelected = selectedIds.includes(node.id);
        const isHovered = hoveredId === node.id;
        const r = isSelected || isHovered ? NODE_R + 4 : NODE_R;

        // ����
        if (isSelected || isHovered) {
          const glow = ctx.createRadialGradient(node.x, node.y, r * 0.5, node.x, node.y, r * 2.5);
          glow.addColorStop(0, color + "44");
          glow.addColorStop(1, "transparent");
          ctx.beginPath();
          ctx.arc(node.x, node.y, r * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();
        }

        // �����⻷
        const pulse = 1 + Math.sin(Date.now() * 0.003 + node.data.presenceIntensity * 10) * 0.15;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r * 1.3 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = color + "33";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // ����
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? color + "DD" : isHovered ? color + "AA" : "rgba(20,20,40,0.85)";
        ctx.fill();
        ctx.strokeStyle = isSelected ? color : color + "66";
        ctx.lineWidth = isSelected ? 2.5 : 1;
        ctx.stroke();

        // ����
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = `${isSelected ? 12 : 11}px "PingFang SC", "Microsoft YaHei", sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(node.data.name.slice(0, 4), node.x, node.y + 4);

        // ѡ��ָʾ
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y - r - 8, 4, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
      }

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [selectedIds, hoveredId]);

  // ���/���ؽ���
  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    if ("touches" in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const findNode = (x: number, y: number): LayoutNode | null => {
    return layoutRef.current.lnodes.find(n => {
      const dx = n.x - x, dy = n.y - y;
      return Math.sqrt(dx * dx + dy * dy) < NODE_R + 8;
    }) || null;
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const pos = getCanvasPos(e);
    const node = findNode(pos.x, pos.y);
    if (node) {
      dragRef.current = { nodeId: node.id, ox: node.x - pos.x, oy: node.y - pos.y };
      node.fx = node.x; node.fy = node.y;
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    const pos = getCanvasPos(e);
    const { nodeId, ox, oy } = dragRef.current;
    if (nodeId) {
      const node = layoutRef.current.lnodes.find(n => n.id === nodeId);
      if (node) { node.fx = pos.x + ox; node.fy = pos.y + oy; }
    } else {
      const h = findNode(pos.x, pos.y);
      setHoveredId(h ? h.id : null);
    }
  };

  const handlePointerUp = (e: React.MouseEvent | React.TouchEvent) => {
    const { nodeId } = dragRef.current;
    if (nodeId) {
      const node = layoutRef.current.lnodes.find(n => n.id === nodeId);
      if (node) { node.fx = undefined; node.fy = undefined; }
      dragRef.current = { nodeId: null, ox: 0, oy: 0 };
      return;
    }
    // Click
    const pos = getCanvasPos(e);
    const node = findNode(pos.x, pos.y);
    if (node) {
      const newSelected = selectedIds.includes(node.id)
        ? selectedIds.filter(id => id !== node.id)
        : [...selectedIds, node.id].slice(-3); // ���ѡ3��
      onNodeSelect(newSelected);
      if (!selectedIds.includes(node.id)) onNodeClick(node.data);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      onMouseDown={handlePointerDown}
      onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onMouseLeave={() => { dragRef.current.nodeId = null; setHoveredId(null); }}
      onTouchStart={handlePointerDown}
      onTouchMove={handlePointerMove}
      onTouchEnd={handlePointerUp}
      style={{ width: "100%", height: "100%", cursor: dragRef.current.nodeId ? "grabbing" : hoveredId ? "pointer" : "default", touchAction: "none" }}
    />
  );
}