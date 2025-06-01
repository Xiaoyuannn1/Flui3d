// ✅ 简化的桥结构Curve实现
// src/lib/stl-generator/builder/shapes/curve.ts

import { fromPoints }   from '@jscad/modeling/src/geometries/geom2'
import { extrudeLinear } from '@jscad/modeling/src/operations/extrusions'
import { translate, rotate }     from '@jscad/modeling/src/operations/transforms'
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

/**
 * 检查是否为桥结构curve
 */
function isBridgeCurve(shape: CurveShape): boolean {
    const { start, end, center } = shape

    const zDiffStartEnd = Math.abs(start.z - end.z)
    const zDiffStartCenter = Math.abs(start.z - center.z)
    const zDiffEndCenter = Math.abs(end.z - center.z)

    const maxZDiff = Math.max(zDiffStartEnd, zDiffStartCenter, zDiffEndCenter)
    return maxZDiff > 1e-6
}

/**
 * 构建平面Curve（原有逻辑，完全不变）
 */
function buildFlatCurve(shape: CurveShape, precision: number): Geom3 {
    const { start, end, center, tangent, width, height } = shape

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
    if (shoelace(pts2D) < 0) {
        pts2D = pts2D.reverse()
    }

    const shape2d: Geom2 = fromPoints(pts2D)
    let solid: Geom3 = extrudeLinear({ height }, shape2d)
    solid = translate([0, 0, start.z - height/2], solid)

    return solid
}

/**
 * 构建桥结构Curve - 在垂直平面内画圆弧，然后沿法向量拉伸
 */
function buildBridgeCurve(shape: CurveShape, precision: number): Geom3 {
    console.log('Building bridge curve - vertical plane approach')

    const { start, end, center, tangent, width, height } = shape

    // 1. 确定垂直平面
    // 垂直平面包含start和end点，垂直于XY平面
    const pathDirX = end.x - start.x
    const pathDirY = end.y - start.y
    const pathLength = Math.sqrt(pathDirX * pathDirX + pathDirY * pathDirY)

    if (pathLength < 1e-6) {
        console.log('Vertical curve detected - path length too small')
        return null as any
    }

    // 垂直平面的X轴方向（标准化）
    const planeX_x = pathDirX / pathLength
    const planeX_y = pathDirY / pathLength
    // 垂直平面的Y轴方向就是Z轴
    const planeY_x = 0, planeY_y = 0, planeY_z = 1

    console.log('Vertical plane X-axis:', `(${planeX_x.toFixed(3)}, ${planeX_y.toFixed(3)}, 0)`)

    // 2. 将3D点转换到垂直平面的2D坐标系
    function to2D(point: {x: number, y: number, z: number}) {
        // 以start为原点
        const relX = point.x - start.x
        const relY = point.y - start.y
        const relZ = point.z - start.z

        // 在垂直平面内的坐标
        const u = relX * planeX_x + relY * planeX_y  // 沿路径方向
        const v = relZ                                // 沿Z轴方向
        return { u, v }
    }

    const start2D = to2D(start)      // (0, 0)
    const end2D = to2D(end)          // (pathLength, end.z - start.z)
    const center2D = to2D(center)    // 转换后的圆心

    console.log('2D coordinates:', {
        start2D: `(${start2D.u.toFixed(1)}, ${start2D.v.toFixed(1)})`,
        end2D: `(${end2D.u.toFixed(1)}, ${end2D.v.toFixed(1)})`,
        center2D: `(${center2D.u.toFixed(1)}, ${center2D.v.toFixed(1)})`
    })

    // 3. 在2D垂直平面内计算圆弧参数
    const ru = start2D.u - center2D.u
    const rv = start2D.v - center2D.v
    const radius = Math.sqrt(ru * ru + rv * rv)

    if (radius < 1e-6) {
        console.error('Radius too small in vertical plane:', radius)
        return null as any
    }

    const ang0 = Math.atan2(rv, ru)
    const ang1 = Math.atan2(end2D.v - center2D.v, end2D.u - center2D.u)

    // 4. 简化的角度扫掠计算
    let sweep = ang1 - ang0
    if (Math.abs(sweep) > Math.PI) {
        sweep += sweep > 0 ? -2 * Math.PI : 2 * Math.PI
    }

    console.log('2D arc parameters:', {
        radius: radius.toFixed(2),
        startAngle: (ang0 * 180 / Math.PI).toFixed(1) + '°',
        endAngle: (ang1 * 180 / Math.PI).toFixed(1) + '°',
        sweep: (sweep * 180 / Math.PI).toFixed(1) + '°'
    })

    // 5. 在2D垂直平面内构造环扇形多边形
    const frac = Math.abs(sweep) / (Math.PI * 2)
    const N = Math.max(8, Math.ceil(precision * frac * 1.2))

    const outer: [number,number][] = []
    const inner: [number,number][] = []
    const rOut = radius + width/2, rIn = radius - width/2

    for (let i = 0; i <= N; i++) {
        const θ = ang0 + sweep * (i / N)
        // 在2D垂直平面内的点
        const u_outer = center2D.u + rOut * Math.cos(θ)
        const v_outer = center2D.v + rOut * Math.sin(θ)
        const u_inner = center2D.u + rIn * Math.cos(θ)
        const v_inner = center2D.v + rIn * Math.sin(θ)

        outer.push([u_outer, v_outer])
        inner.unshift([u_inner, v_inner])
    }

    // 6. 组合点并检查方向
    let pts2D = outer.concat(inner) as [number,number][]
    if (shoelace(pts2D) < 0) {
        pts2D = pts2D.reverse()
    }

    // 7. 创建2D形状并拉伸
    const shape2d: Geom2 = fromPoints(pts2D)
    let solid: Geom3 = extrudeLinear({ height }, shape2d)

    // 8. 旋转到正确的垂直平面方向
    const planeAngle = Math.atan2(planeX_y, planeX_x)  // 垂直平面的方向角
    if (Math.abs(planeAngle) > 1e-6) {
        solid = rotate([0, 0, planeAngle], solid)
    }

    // 9. 平移到起点位置
    solid = translate([start.x, start.y, start.z - height/2], solid)

    return solid
}

export function buildCurve(shape: CurveShape, precision: number): Geom3 {
    const { start, end, center, tangent, width, height } = shape
    if (width <= 0 || height <= 0) return null as any

    if (isBridgeCurve(shape)) {
        console.log('Detected bridge curve')
        return buildBridgeCurve(shape, precision)
    } else {
        console.log('Using flat curve')
        return buildFlatCurve(shape, precision)
    }
}