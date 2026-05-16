// node.model.ts
export type NodeType = 'log' | 'color';

export interface FlowNode {
  id: string;
  type: 'log' | 'color';
  x: number;
  y: number;
  data: {
    text?: string;
    color?: string;
  };
}
export interface Edge {
  from: string;
  to: string;
}