// import { union } from '@jscad/modeling/src/operations/booleans'
// import { LineShape, CurveShape } from '../../model/types'
// import { buildLine } from './line'
//
// /**
//  * 把圆弧离散成 N 条小线段，再复用 buildLine
//  * @param shape   JSON 中 Curve 对象
//  * @param segments 建模精度（Medium=32 等），决定离散条数基线
//  */
// export function buildCurve(shape: CurveShape, segments: number) {
//     const { start, end, center, width, height } = shape
//
//     /* ==== 1. 计算半径 / 起止角 ==== */
//     const rsx = start.x - center.x, rsy = start.y - center.y
//     const radius = Math.hypot(rsx, rsy)
//     const ang0 = Math.atan2(rsy, rsx)
//     let ang1 = Math.atan2(end.y - center.y, end.x - center.x)
//
//     /* ==== 2. 用切向量判断方向 ==== */
//     const tan = shape.tangent ?? { x: -(rsy), y: rsx } // 若没填，默认逆时针
//     const cross = rsx * tan.y - rsy * tan.x            // z 分量
//
//     if (cross > 0) {          // CCW
//         if (ang1 <= ang0) ang1 += 2 * Math.PI
//     } else {                  // CW
//         if (ang1 >= ang0) ang1 -= 2 * Math.PI
//     }
//     const sweep = ang1 - ang0          // 正 = CCW，负 = CW
//
//     /* ==== 3. 决定离散条数 N ==== */
//     const N = Math.max(4, Math.ceil(Math.abs(sweep) / (Math.PI / segments)))
//
//     /* ==== 4. 生成 N 条小 Line cuboid ==== */
//     const parts = []
//     for (let i = 0; i < N; i++) {
//         const a0 = ang0 + (sweep * i)     / N
//         const a1 = ang0 + (sweep * (i+1)) / N
//
//         const p0 = { x: center.x + radius * Math.cos(a0),
//             y: center.y + radius * Math.sin(a0),
//             z: start.z }                 // z 仍是“中心高度”
//
//         const p1 = { x: center.x + radius * Math.cos(a1),
//             y: center.y + radius * Math.sin(a1),
//             z: start.z }
//
//         const seg: LineShape = {
//             type: 'Line',
//             start: p0,
//             end  : p1,
//             width,
//             height
//         }
//         parts.push(buildLine(seg))
//     }
//
//     /* ==== 5. 并集为完整弧形通道 ==== */
//     return union(...parts)
// }

// src/lib/stl-generator/builder/shapes/curve.ts

import { fromPoints }   from '@jscad/modeling/src/geometries/geom2'
import { extrudeLinear } from '@jscad/modeling/src/operations/extrusions'
import { translate }     from '@jscad/modeling/src/operations/transforms'
import type { Geom2, Geom3 } from '@jscad/modeling/src/geometries/types'
import { CurveShape }     from '../../model/types'

/**
 * 计算多边形的有符号面积，< 0 表示顺时针，> 0 表示逆时针
 */
function shoelace(pts: [number, number][]): number {
    let sum = 0
    for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i]
        const [x2, y2] = pts[(i + 1) % pts.length]
        sum += x1 * y2 - y1 * x2
    }
    return sum / 2
}

export function buildCurve(shape: CurveShape, precision: number): Geom3 {
    const { start, end, center, tangent, width, height } = shape
    if (width <= 0 || height <= 0) return null as any

    // 1. 计算圆弧参数
    const rx = start.x - center.x, ry = start.y - center.y
    const r0 = Math.hypot(rx, ry)
    if (r0 < 1e-6) return null as any
    const ang0 = Math.atan2(ry, rx)
    let ang1 = Math.atan2(end.y - center.y, end.x - center.x)

    // 2. 判定顺/逆时针
    const tan = tangent ?? { x:-ry, y:rx, z:0 }
    const crossZ = rx * tan.y - ry * tan.x
    if (crossZ > 0) { if (ang1 <= ang0) ang1 += 2*Math.PI }
    else           { if (ang1 >= ang0) ang1 -= 2*Math.PI }
    let sweep = ang1 - ang0
    if (Math.abs(sweep) > Math.PI) sweep += sweep>0 ? -2*Math.PI : 2*Math.PI

    // 3. 采样点数
    const full = Math.PI*2
    const frac = Math.abs(sweep) / full
    const N = Math.max(8, Math.ceil(precision * frac * 1.2))

    // 4. 构造环扇形多边形（外弧 + 内弧）
    const outer: [number,number][] = []
    const inner: [number,number][] = []
    const rOut = r0 + width/2, rIn = r0 - width/2
    for (let i = 0; i <= N; i++) {
        const θ = ang0 + sweep * (i / N)
        outer.push([ center.x + rOut * Math.cos(θ), center.y + rOut * Math.sin(θ) ])
        inner.unshift([ center.x + rIn  * Math.cos(θ), center.y + rIn  * Math.sin(θ) ])
    }

    // 5. 组合点并检查方向
    let pts2D = outer.concat(inner) as [number,number][]

    // 6. 修正多边形方向：确保是逆时针（正面积）
    if (shoelace(pts2D) < 0) {
        pts2D = pts2D.reverse()
        // console.log('Curve: 修正多边形方向（顺时针 -> 逆时针）')
    }

    const shape2d: Geom2 = fromPoints(pts2D)

    // 7. 一次性挤出成3D管道
    let solid: Geom3 = extrudeLinear({ height }, shape2d)

    // 8. 抬升到正确底面高度：start.z - height/2
    solid = translate([0, 0, start.z - height/2], solid)

    return solid
}