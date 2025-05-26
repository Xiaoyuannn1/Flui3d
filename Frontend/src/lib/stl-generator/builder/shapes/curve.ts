import { union } from '@jscad/modeling/src/operations/booleans'
import { LineShape, CurveShape } from '../../model/types'
import { buildLine } from './line'

export function buildCurve(shape: CurveShape, segments:number) {
    // ① 圆弧半径与角度
    const cx = shape.center.x, cy = shape.center.y
    const r  = Math.hypot(shape.start.x - cx, shape.start.y - cy)
    const a0 = Math.atan2(shape.start.y - cy, shape.start.x - cx)
    const a1 = Math.atan2(shape.end  .y - cy, shape.end  .x - cx)

    // ② 均分弧度
    const N = segments      // 32 / 64 与精度保持一致
    const da = (a1 - a0) / N

    const parts = []
    for (let i=0;i<N;i++){
        const t0 = a0 + i*da, t1 = a0 + (i+1)*da
        const p0 = { x: cx + r*Math.cos(t0), y: cy + r*Math.sin(t0), z: shape.start.z }
        const p1 = { x: cx + r*Math.cos(t1), y: cy + r*Math.sin(t1), z: shape.start.z }

        const seg: LineShape = {
            type:'Line',
            start:p0, end:p1,
            width:shape.width, height:shape.height
        }
        parts.push(buildLine(seg))
    }
    return union(...parts)
}
