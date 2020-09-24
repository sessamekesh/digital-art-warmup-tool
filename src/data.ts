export type Line = {
  startX: number,
  startY: number,
  endX: number,
  endY: number,
};

export type Circle = {
  x: number,
  y: number,
  radius: number,
};

export type Ellipse = {
  x: number,
  y: number,
  xrad: number,
  yrad: number,
  rot: number,
};

export type Point = {
  x: number,
  y: number,
};

export enum StrokeScore {
  PERFECT,
  GOOD,
  OKAY,
  MISS,
};

export type Stroke = {
  x: number,
  y: number,
  color: string,
  width: number,
  score: StrokeScore,
};