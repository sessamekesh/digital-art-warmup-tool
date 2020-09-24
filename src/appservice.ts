import { CardContent } from "@material-ui/core";
import { Point, Stroke, StrokeScore } from "./data";
import { ExerciseType, ExersizeSize } from "./exercisetype";
import { GoalCircle } from "./goalcircle";
import { GoalLine, LineSegmentScore } from "./goalline";

enum PenState {
  UP,
  HOVER,
  DOWN,
};

// TODO (sessamekesh): This is a good idea, but you have problems:
// - On Firefox, the pressure isn't registered at all: https://bugzilla.mozilla.org/show_bug.cgi?id=1487509

/**
 * Next steps:
 * 
 * Store last observed pointer position
 * 
 * On Move
 *  - Greater than 50px: Set current position without stroking
 *  - Greater than 5px: Draw a line (see below) with the current pressure from last pos to current
 *                      position. Update the current position (last endpoint).
 *  - Less than 2px: Ignore
 * 
 * Draw Line
 *  - Split "draw line" into logical lines of distance 1px (floats, as opposed to int input)
 *  - Use the current pressure to determine width (0->25)
 *  - Distance of furthest endpoint from goal line...
 *    + <2: Green (color based on thickness score)
 *    + 10: Yellow
 *    + 50: Red
 *    + Interpolate RGB color based on the distance: e.g., 35 would be yellow-red mix.
 *  - Add to segments of the goal line covered
 * 
 * On Lift
 *  - Line coverage: % of line segments (max 2px) that are hit, - % that are overshot - % that are double-covered
 *  - Segment coverage: % of line segments that fit into a bucket (<2px, <5px <10px, <15px, <20px, >20px)
 *  - Score the line
 *    + PERFECT: Line is 98% or more covered, 100% of line segments are <2px off (green)
 *    + EXCELLENT: Line is 95% or more covered, 97.5% of line segments are <2px off, rest are <5px
 *    + GREAT: Line is 95% or more covered, 90% of line segments are <2px off, rest are <5px
 *    + GOOD: Line is 90% or more covered, 50% of line segments are <5px off, 40% are <10px, rest are <15px
 *    + OKAY: Line is 80% or more covered, 50% of line segments are <10px off, rest are <20px
 *    + MISS: Line is <80% covered
 *    + BAD: Line has segments that are >20px off
 *  - Repeat for any line that is worse than the acceptable quality (default: "OKAY")
 * 
 * Fade out previously drawn line when it finishes - color it, 50% opacity, keep 1s, fade out 2s
 * 
 * Goal line: draw points and a dotted line between them that moves from A to B. Actual drawing
 *            doesn't care if it starts at A or B, just cares that it covers segments.
 * 
 * When a line is drawn, it is projected onto the goal line, and a segment is registered against the
 *   goal line along those points. These goal lines are what determine the final scoring. The
 *   scoring of this intermediate line also determines the coloring of the drawn segment.
 * 
 * Spawning lines:
 *  + Pick random point A further than {small: 200, medium: 500, large: 1000} from furthest edge and
 *    further than 100 from the nearest edge.
 *  + Pick length:
 *    - Small: random between 200-500
 *    - Medium: random between 500-1000
 *    - Large: random between 1000-2000
 *    - Anything goes: random between 200-2000
 *  + Pick angle:
 *    - Confirm that at least one viable angle exists: make sure at least one corner is far enough
 *    - Pick angles at random until a viable candidate is found
 *  + Establish line based on initial point, angle, and length
 */

// Adapted from http://perfectionkills.com/exploring-canvas-drawing-techniques/
function midPoint(p1: Point, p2: Point): Point {
  return {
    x: p1.x + (p2.x - p1.x) / 2,
    y: p1.y + (p2.y - p1.y) / 2
  };
}

type Color = {r: number, g: number, b: number};
const RED = {r: 214, g: 30, b: 38};
const ORANGE = {r: 249, g: 166, b: 28};
const GREEN = {r: 66, g: 237, b: 1};
const GREY = {r:51, g: 56, b: 56};
const BLACK = {r:5,g:5,b:5};

function Lerp(a: number, b: number, t: number) {
  t = Math.min(1, Math.max(0, t));
  return a * (1 - t) + b * t;
}

function LerpColor(a: Color, b: Color, t: number): Color {
  return {
    r: Lerp(a.r, b.r, t),
    g: Lerp(a.g, b.g, t),
    b: Lerp(a.b, b.b, t),
  };
}

function HexComponent(n: number) {
  return ('00' + `${Math.round(n).toString(16)}`).substr(-2);
}

function HexString(c: Color): string {
  return `#${HexComponent(c.r)}${HexComponent(c.g)}${HexComponent(c.b)}`;
}

type ScoreMessage = {
  FadeTime: number,
  FadeRemaining: number,
  Score: StrokeScore,
};

type OldLine = {
  FadeTime: number,
  FadeRemaining: number,
  Points: Stroke[],
};

export class AppService {
  private exerciseType: ExerciseType = ExerciseType.LINES;
  private exersizeSize: ExersizeSize = ExersizeSize.ANYTHING_GOES;
  private isRunning: boolean = false;
  private animationFrameHandle_: number|undefined;

  private penState: PenState = PenState.UP;
  private penPos: Point = {x: 0, y: 0};
  private penPressure: number = 0;

  private nextGoal: GoalLine|GoalCircle|undefined;

  private oldLines: OldLine[] = [];
  private currentLine: Stroke[] = [];
  private scoreMessages: ScoreMessage[] = [];
  private attemptsLeft = 5;

  constructor(private ctx: CanvasRenderingContext2D) {}

  hover(point: Point) {
    this.penState = PenState.HOVER;
    this.penPos = point;
  }
  lift(point: Point) {
    this.penState = PenState.UP;
    this.penPos = point;

    if (this.currentLine.length > 1) {
      this.oldLines.push({
        FadeRemaining: 0.8,
        FadeTime: 0.8,
        Points: this.currentLine.map(k=>{return {...k};}),
      });

      if (this.isRunning) {
        const score = this.scoreCurrentLine(this.currentLine);
        this.scoreMessages.push({
          FadeRemaining: 4,
          FadeTime: 4,
          Score: score,
        });
        this.attemptsLeft--;
        if (this.attemptsLeft <= 0) {
          this.attemptsLeft = 5;
          this.generateGoalObject();
        }
      }
    }

    this.currentLine = [];
  }
  down(point: Point) {
    this.penState = PenState.DOWN;
    this.penPos = point;

    this.currentLine = [{...point, color: '', width: 0, score: StrokeScore.PERFECT}];
  }
  move(point: Point, pressure: number) {
    this.penPos = point;
    this.penPressure = pressure;

    if (this.penState === PenState.DOWN) {
      const pointColorAndScore = this.getNewPointColorAndScore(point);
      this.currentLine.push({
        ...point,
        color: pointColorAndScore[0],
        width: this.penPressure * 20,
        score: pointColorAndScore[1],
      });
    }
  }

  //
  // Logic
  //
  startExercise(exerciseType: ExerciseType, exerciseSize: ExersizeSize) {
    this.exerciseType = exerciseType;
    this.exersizeSize = exerciseSize;
    this.isRunning = true;
    this.generateGoalObject();
  }
  stopExercies() {
    this.isRunning = false;
    this.nextGoal = undefined;
  }

  private generateGoalObject() {
    switch (this.exerciseType) {
      case ExerciseType.LINES:
        this.nextGoal = GoalLine.GenerateLine(
          this.ctx.canvas.width, this.ctx.canvas.height, this.exersizeSize);
        break;
      case ExerciseType.CIRCLES:
        this.nextGoal = GoalCircle.GenerateCircle(
          this.ctx.canvas.width, this.ctx.canvas.height, this.exersizeSize);
        break;
      default:
        throw new Error('Unsported');
    }
  }

  //
  // Rendering
  //

  update(dt: number) {
    if (this.nextGoal instanceof GoalLine || this.nextGoal instanceof GoalCircle) {
      this.nextGoal.update(dt);
    }

    this.oldLines = this.oldLines
      .map(ol=>{ol.FadeRemaining -= dt; return {...ol};})
      .filter(ol=>ol.FadeRemaining>0);
    this.scoreMessages = this.scoreMessages
      .map(sm=>{sm.FadeRemaining -= dt; return {...sm};})
      .filter(sm=>sm.FadeRemaining>0);
  }

  render() {
    this.ctx.canvas.width = this.ctx.canvas.clientWidth;
    this.ctx.canvas.height = this.ctx.canvas.clientHeight;
    this.clear();
    this.drawOldLinePoints();
    this.drawGoalObject();
    this.drawCurrentLinePoints();
    this.drawCursor();
    this.drawMessages();
  }

  private clear() {
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
  }

  start() {
    let lastFrameTime = performance.now();
    const frame = () => {
      let thisFrame = performance.now();
      let dt = (thisFrame - lastFrameTime) / 1000;
      lastFrameTime = thisFrame;
      this.update(dt);
      this.render();
      this.animationFrameHandle_ = requestAnimationFrame(frame);
    };
    this.animationFrameHandle_ = requestAnimationFrame(frame);
  }

  stop() {
    if (this.animationFrameHandle_) {
      cancelAnimationFrame(this.animationFrameHandle_);
      this.animationFrameHandle_ = undefined;
    }
  }

  clearDrawings() {
    this.oldLines = [];
    this.currentLine = [];
  }

  private drawCursor() {
    if (this.penState == PenState.UP) return;

    const c = this.ctx;
    c.strokeStyle = '#101030';
    c.lineWidth = 2;
    c.beginPath();
    if (this.penState == PenState.HOVER) {
      c.arc(this.penPos.x, this.penPos.y, 10, 0, Math.PI * 2);
    } else {
      c.arc(this.penPos.x, this.penPos.y, this.penPressure * 10, 0, Math.PI * 2);
    }
    c.stroke();
  }

  private drawOldLinePoints() {
    const c = this.ctx;
    // Algorithm from https://www.tutorialspoint.com/Drawing-lines-with-continuously-varying-line-width-on-HTML-canvas

    for (let i = 0; i < this.oldLines.length; i++) {
      const pts = this.oldLines[i].Points;
      c.globalAlpha = this.oldLines[i].FadeRemaining / this.oldLines[i].FadeTime;

      c.lineCap = 'round';
      if (pts.length > 1) {
        c.moveTo(pts[0].x, pts[0].y);
  
        // Algorithm from https://www.tutorialspoint.com/Drawing-lines-with-continuously-varying-line-width-on-HTML-canvas
        for (let j = 2; j < pts.length; j++) {
          c.lineWidth = pts[j].width;
          c.strokeStyle = pts[j].color;
          c.beginPath();
  
          const p0 = pts[j - 2];
          const p1 = pts[j - 1];
          const p2 = pts[j];
          const x0 = (p0.x + p1.x) / 2;
          const x1 = (p1.x + p2.x) / 2;
          const y0 = (p0.y + p1.y) / 2;
          const y1 = (p1.y + p2.y) / 2;
  
          c.moveTo(x0, y0);
          c.quadraticCurveTo(p1.x, p1.y, x1, y1);
          c.stroke();
        }
        c.beginPath();
        c.lineWidth = pts[pts.length - 1].width;
        c.strokeStyle = pts[pts.length - 1].color;
        c.lineWidth = pts[pts.length - 1].width;
        c.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        c.stroke();
      }
    }
    c.globalAlpha = 1;
  }

  private drawCurrentLinePoints() {
    const c = this.ctx;

    c.lineCap = 'round';
    let pts = this.currentLine;
    if (pts.length > 1) {
      c.moveTo(pts[0].x, pts[0].y);

      // Algorithm from https://www.tutorialspoint.com/Drawing-lines-with-continuously-varying-line-width-on-HTML-canvas
      for (let j = 2; j < pts.length; j++) {
        c.lineWidth = pts[j].width;
        c.strokeStyle = pts[j].color;
        c.beginPath();

        const p0 = pts[j - 2];
        const p1 = pts[j - 1];
        const p2 = pts[j];
        const x0 = (p0.x + p1.x) / 2;
        const x1 = (p1.x + p2.x) / 2;
        const y0 = (p0.y + p1.y) / 2;
        const y1 = (p1.y + p2.y) / 2;

        c.moveTo(x0, y0);
        c.quadraticCurveTo(p1.x, p1.y, x1, y1);
        c.stroke();
      }
      c.beginPath();
      c.lineWidth = pts[pts.length - 1].width;
      c.strokeStyle = pts[pts.length - 1].color;
      c.lineWidth = pts[pts.length - 1].width;
      c.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      c.stroke();
    }
  }

  private drawMessages() {
    const c = this.ctx;
    for (let i = 0; i < this.scoreMessages.length; i++) {
      const ypct = this.scoreMessages[i].FadeRemaining / this.scoreMessages[i].FadeTime;
      const startY = 50;
      const endY = 500;

      let text = '';
      let color = '';
      switch (this.scoreMessages[i].Score) {
        case StrokeScore.PERFECT: text = 'Perfect!'; color = HexString(GREEN); break;
        case StrokeScore.GOOD: text = 'Good'; color = HexString(ORANGE); break;
        case StrokeScore.OKAY: text = 'Okay'; color = HexString(GREY); break;
        case StrokeScore.MISS: text = 'Miss'; color = HexString(RED); break;
      }

      c.globalAlpha = ypct;
      c.fillStyle = color;
      c.font = '30px Arial';
      c.fillText(text, 50, Lerp(startY, endY, ypct));
      c.globalAlpha = 1;
    }
  }

  private drawGoalObject() {
    const c = this.ctx;

    if (this.nextGoal instanceof GoalLine) {
      // Endpoints - filled circles
      c.fillStyle = HexString(BLACK);
      c.beginPath();
      c.moveTo(this.nextGoal.line.startX, this.nextGoal.line.startY);
      c.arc(this.nextGoal.line.startX, this.nextGoal.line.startY, 6, 0, Math.PI * 2);
      c.moveTo(this.nextGoal.line.endX, this.nextGoal.line.endY);
      c.arc(this.nextGoal.line.endX, this.nextGoal.line.endY, 6, 0, Math.PI * 2);
      c.fill();

      // In between line:
      const dashData = this.nextGoal.dashedLineData();
      c.strokeStyle = HexString(BLACK);
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(dashData.x0, dashData.y0);
      c.setLineDash(dashData.dash);
      c.lineTo(dashData.x1, dashData.y1);
      c.stroke();
    } else if (this.nextGoal instanceof GoalCircle) {
      // Start position
      c.strokeStyle = HexString(BLACK);
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(this.nextGoal.Origin.x + Math.sin(this.nextGoal.StartAngle) * this.nextGoal.Radius + 3,
              this.nextGoal.Origin.y + Math.cos(this.nextGoal.StartAngle) * this.nextGoal.Radius);
      c.arc(
        this.nextGoal.Origin.x + Math.sin(this.nextGoal.StartAngle) * this.nextGoal.Radius,
        this.nextGoal.Origin.y + Math.cos(this.nextGoal.StartAngle) * this.nextGoal.Radius,
        3,
        0, 2 * Math.PI);
      c.stroke();

      // Surrounding: dotted line:
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(
        this.nextGoal.Origin.x + Math.cos(this.nextGoal.StartAngle + this.nextGoal.TOffset) * this.nextGoal.Radius,
        this.nextGoal.Origin.y + Math.sin(this.nextGoal.StartAngle + this.nextGoal.TOffset) * this.nextGoal.Radius);
      c.setLineDash([10, 10]);
      c.arc(this.nextGoal.Origin.x, this.nextGoal.Origin.y, this.nextGoal.Radius, this.nextGoal.StartAngle + this.nextGoal.TOffset,
        this.nextGoal.StartAngle + this.nextGoal.TOffset + 0.01, true);
      c.stroke();
    }

    c.setLineDash([]);
  }

  private getNewPointColorAndScore(pt: Point): [string, StrokeScore] {
    if (!this.isRunning || this.currentLine.length < 3) {
      return [HexString(GREY), StrokeScore.PERFECT];
    }

    const lastPt = this.currentLine[this.currentLine.length - 1];

    if (this.nextGoal instanceof GoalLine) {
      const score = this.nextGoal.scoreSegment({
        startX: lastPt.x,
        startY: lastPt.y,
        endX: pt.x,
        endY: pt.y,
      });

      if (score.tStart < 0 || score.tEnd > 1) {
        return [HexString(RED), StrokeScore.MISS];
      }

      if (score.MaxDistToLine < 2) {
        return [HexString(GREEN), StrokeScore.PERFECT];
      } else if (score.MaxDistToLine < 25) {
        return [HexString(LerpColor(GREEN, ORANGE, (score.MaxDistToLine - 2) / 23)), StrokeScore.GOOD];
      } else if (score.MaxDistToLine < 50) {
        return [HexString(LerpColor(ORANGE, RED, (score.MaxDistToLine - 25) / 25)), StrokeScore.OKAY];
      } else {
        return [HexString(RED), StrokeScore.MISS];
      }
    } else if (this.nextGoal instanceof GoalCircle) {
      const dist = this.nextGoal.scoreSegment({
        startX: lastPt.x,
        startY: lastPt.y,
        endX: pt.x,
        endY: pt.y,
      });

      if (dist.MaxDistanceToLine < 5) {
        return [HexString(GREEN), StrokeScore.PERFECT];
      } else if (dist.MaxDistanceToLine < 30) {
        return [HexString(LerpColor(GREEN, ORANGE, (dist.MaxDistanceToLine - 5) / 25)), StrokeScore.GOOD];
      } else if (dist.MaxDistanceToLine < 60) {
        return [HexString(LerpColor(ORANGE, RED, (dist.MaxDistanceToLine - 30) / 30)), StrokeScore.OKAY];
      } else {
        return [HexString(RED), StrokeScore.MISS];
      }
    }

    return [HexString(GREY), StrokeScore.MISS];
  }

  private scoreCurrentLine(strokes: Stroke[]): StrokeScore {
    if (this.nextGoal instanceof GoalLine) {
      const coverage = this.nextGoal.coverage(strokes);
      let accuracy = StrokeScore.MISS;

      const missPCt = strokes.filter(s=>s.score===StrokeScore.MISS).length / strokes.length;
      const okayPct = strokes.filter(s=>s.score===StrokeScore.OKAY).length / strokes.length;
      const goodPCt = strokes.filter(s=>s.score===StrokeScore.GOOD).length / strokes.length;

      if (missPCt > 0.1) {
        accuracy = StrokeScore.MISS;
      } else if (missPCt > 0.02 || okayPct > 0.1) {
        accuracy = StrokeScore.OKAY;
      } else if (okayPct > 0.02 || goodPCt > 0.1) {
        accuracy = StrokeScore.GOOD;
      } else {
        accuracy = StrokeScore.PERFECT;
      }

      if (accuracy === StrokeScore.MISS || coverage === StrokeScore.MISS) {
        return StrokeScore.MISS;
      } else if (accuracy === StrokeScore.OKAY || coverage === StrokeScore.OKAY) {
        return StrokeScore.OKAY;
      } else if (accuracy === StrokeScore.GOOD || coverage === StrokeScore.GOOD) {
        return StrokeScore.GOOD;
      }
      return StrokeScore.PERFECT;
    } else if (this.nextGoal instanceof GoalCircle) {
      let accuracy = StrokeScore.MISS;

      const missPCt = strokes.filter(s=>s.score===StrokeScore.MISS).length / strokes.length;
      const okayPct = strokes.filter(s=>s.score===StrokeScore.OKAY).length / strokes.length;
      const goodPCt = strokes.filter(s=>s.score===StrokeScore.GOOD).length / strokes.length;

      if (missPCt > 0.1) {
        accuracy = StrokeScore.MISS;
      } else if (missPCt > 0.02 || okayPct > 0.1) {
        accuracy = StrokeScore.OKAY;
      } else if (okayPct > 0.02 || goodPCt > 0.1) {
        accuracy = StrokeScore.GOOD;
      } else {
        accuracy = StrokeScore.PERFECT;
      }

      return accuracy;
    }

    return StrokeScore.MISS;
  }
}