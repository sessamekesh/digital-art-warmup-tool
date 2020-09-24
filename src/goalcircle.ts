import { Line, Point } from "./data";
import { ExersizeSize } from "./exercisetype";

export type CircleSegmentScore = {
  MaxDistanceToLine: number,
};

export class GoalCircle {
  public TOffset = 0;
  
  constructor(
    public readonly Origin: Point,
    public readonly Radius: number,
    public readonly StartAngle: number) {}

  update(dt: number) {
    this.TOffset += dt * 0.08;
    while (this.TOffset > Math.PI * 2) this.TOffset -= Math.PI * 2;
  }

  scoreSegment(segment: Line): CircleSegmentScore {
    const x = segment.endX - this.Origin.x;
    const y = segment.endY - this.Origin.y;
    const d = Math.sqrt(x ** 2 + y ** 2);

    return {
      MaxDistanceToLine: Math.abs(d - this.Radius),
    };
  }

  static GenerateCircle(
      width: number, height: number, size: ExersizeSize, triesRemaining: number = 1000): GoalCircle {
    const DIST_TO_EDGE = 50;
    if (triesRemaining < 0) {
      alert('Could not generate practice circle after 1000 tries - make canvas larger, or pick smaller exercise size!');
      throw new Error('fail');
    }

    const bounds = GoalCircle.RadiusBounds(size);
    const radius = Math.random() * (bounds[1] - bounds[0]) + bounds[0];

    const workingWidth = width - (DIST_TO_EDGE + radius) * 2;
    const workingHeight = height - (DIST_TO_EDGE + radius) * 2;

    if (workingWidth < 0 || workingHeight < 0) {
      return GoalCircle.GenerateCircle(width, height, size, triesRemaining - 1);
    }

    const ox = Math.random() * workingWidth + radius + DIST_TO_EDGE;
    const oy = Math.random() * workingHeight + radius + DIST_TO_EDGE;

    const startAngle = Math.random() * Math.PI * 2;

    return new GoalCircle({x: ox, y: oy,}, radius, startAngle);
  }

  private static RadiusBounds(size: ExersizeSize): [number, number] {
    switch (size) {
      case ExersizeSize.SMALL: return [50, 150];
      case ExersizeSize.MEDIUM: return [125, 375];
      case ExersizeSize.LARGE: return [350, 1000];
      default: return [50, 1000];
    }
  }
}