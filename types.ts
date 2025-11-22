
export type ToolMode = 
  | 'select' 
  | 'pen' 
  | 'eraser' 
  | 'text' 
  | 'ruler' 
  | 'protractor' 
  | 'compass' 
  | 'triangle';

export interface Point {
  x: number;
  y: number;
}

export type StrokeStyle = 'solid' | 'dashed' | 'dotted' | 'marker';

export interface Stroke {
  id: string;
  type: 'stroke';
  points: Point[];
  color: string;
  width: number;
  strokeStyle?: StrokeStyle; // Added style
}

export interface Widget {
  id: string;
  type: 'ruler' | 'protractor' | 'compass' | 'triangle' | 'image' | 'text';
  x: number;
  y: number;
  angle: number; // degrees
  scale: number;
  selected: boolean;
  visible?: boolean; // Controls visibility without deletion
  // Specific properties
  text?: string;
  src?: string; // for images
  width?: number;
  height?: number;
  radius?: number;
  drawAngle?: number; // for compass animation/state
}

export type CanvasItem = Stroke | Widget;

export interface AIResult {
  ocr: string;
  solution: string;
}

export enum MathType {
  BBT = 'bbt',
  GRAPH = 'graph',
  CHART = 'chart'
}