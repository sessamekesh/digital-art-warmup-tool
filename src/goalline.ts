import { Line, Stroke, StrokeScore } from "./data";
import { ExersizeSize } from './exercisetype';

export type LineSegmentScore = {
  MaxDistToLine: number,
  tStart: number,
  tEnd: number,
};

export class GoalLine {
  public TOffset = 0;

  constructor(public readonly line: Line) {}

  update(dt: number) {
    this.TOffset += dt * 0.45;
    while (this.TOffset > 1) this.TOffset -= 1;
  }

  dashedLineData() {
    const dX = this.line.endX - this.line.startX;
    const dY = this.line.endY - this.line.startY;
    const ll = Math.sqrt(dX ** 2 + dY ** 2);
    const nX = dX / ll;
    const nY = dY / ll;

    return {
      x0: this.line.startX + nX * this.TOffset * 20,
      y0: this.line.startY + nY * this.TOffset * 20,
      x1: this.line.endX,
      y1: this.line.endY,
      dash: [10, 10],
    };
  }

  scoreSegment(segment: Line): LineSegmentScore {
    const dX = this.line.endX - this.line.startX;
    const dY = this.line.endY - this.line.startY;
    const ll = Math.sqrt(dX ** 2 + dY ** 2);
    const nX = dX / ll;
    const nY = dY / ll;

    const tsX = segment.startX - this.line.startX;
    const tsY = segment.startY - this.line.startY;
    const tsll = Math.sqrt(tsX ** 2 + tsY ** 2);
    const nsX = tsX / tsll;
    const nsY = tsY / tsll;
    const tStart = nsX * nX + nsY * nY;

    const teX = segment.endX - this.line.endX;
    const teY = segment.endY - this.line.endY;
    const tell = Math.sqrt(teX ** 2 + teY ** 2);
    const neX = teX / tell;
    const neY = teY / tell;
    const tEnd = 1.0 - (neX * -nX + neY * -nY);

    const endDist = Math.abs(
      dY * segment.endX - dX * segment.endY
        + this.line.endX * this.line.startY
        - this.line.endY * this.line.startX
      ) / ll;

    return {
      MaxDistToLine: endDist,
      tStart, tEnd,
    };
  }

  coverage(strokes: Stroke[]) {
    const dX = this.line.endX - this.line.startX;
    const dY = this.line.endY - this.line.startY;
    const ll = Math.sqrt(dX ** 2 + dY ** 2);
    const nX = dX / ll;
    const nY = dY / ll;

    let start = 0;
    let end = 1;

    for (let i = 1; i < strokes.length; i++) {
      const sold = strokes[i - 1];
      const segment = strokes[i];
      const tsX = sold.x - this.line.startX;
      const tsY = sold.y - this.line.startY;
      const tsll = Math.sqrt(tsX ** 2 + tsY ** 2);
      const nsX = tsX / tsll;
      const nsY = tsY / tsll;
      const tStart = nsX * nX + nsY * nY;
  
      const teX = segment.x - this.line.endX;
      const teY = segment.y - this.line.endY;
      const tell = Math.sqrt(teX ** 2 + teY ** 2);
      const neX = teX / tell;
      const neY = teY / tell;
      const tEnd = 1.0 - (neX * -nX + neY * -nY);

      start = Math.max(start, tStart);
      end = Math.min(end, tEnd);
    }

    if (end < 0.01 && start > 0.99) {
      return StrokeScore.PERFECT;
    } else if (end < 0.05 && start > 0.95) {
      return StrokeScore.GOOD;
    } else if (end < 0.1 && start > 0.9) {
      return StrokeScore.OKAY;
    }
    return StrokeScore.MISS;
  }

  static GenerateLine(width: number, height: number, size: ExersizeSize, triesRemaining: number = 1000): GoalLine {
    if (triesRemaining > 1000) {
      alert('Could not generate practice line after 1000 tries - make canvas larger, or pick smaller exercise size!');
      throw new Error('fail');
    }

    const DIST_TO_EDGE = 50;
    const workingWidth = width - DIST_TO_EDGE * 2;
    const workingHeight = height - DIST_TO_EDGE * 2;
    
    const lineSizeBounds = GoalLine.LineLengthBounds(size);
    const lineLength = Math.random() * (lineSizeBounds[1] - lineSizeBounds[0]) + lineSizeBounds[0];

    const x0 = Math.random() * workingWidth;
    const y0 = Math.random() * workingHeight;

    const angle = Math.random() * Math.PI * 2;

    const x1 = x0 + Math.cos(angle) * lineLength;
    const y1 = x1 + Math.sin(angle) * lineLength;

    if (x1 < 0 || x1 > workingWidth || y1 < 0 || y1 > workingHeight) {
      return GoalLine.GenerateLine(width, height, size, triesRemaining - 1);
    }

    return new GoalLine({
      startX: x0 + DIST_TO_EDGE, startY: y0 + DIST_TO_EDGE,
      endX: x1 + DIST_TO_EDGE, endY: y1 + DIST_TO_EDGE,
    });
  }

  private static LineLengthBounds(size: ExersizeSize): [number, number] {
    switch (size) {
      case ExersizeSize.SMALL: return [200, 500];
      case ExersizeSize.MEDIUM: return [400, 800];
      case ExersizeSize.LARGE: return [700, 2000];
      default: return [200, 2000];
    }
  }
}