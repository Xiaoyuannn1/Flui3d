
// src/lib/stl-generator/builder/shapes/curve.ts

import { fromPoints }   from '@jscad/modeling/src/geometries/geom2'
import { extrudeLinear } from '@jscad/modeling/src/operations/extrusions'
import { translate, rotate }     from '@jscad/modeling/src/operations/transforms'
import type { Geom2, Geom3 } from '@jscad/modeling/src/geometries/types'
import { CurveShape }     from '../../model/types'


// Calculate signed area of polygon: < 0 clockwise, > 0 counterclockwise
function shoelace(pts: [number, number][]): number {
    let sum = 0
    for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i]
        const [x2, y2] = pts[(i + 1) % pts.length]
        sum += x1 * y2 - y1 * x2
    }
    return sum / 2
}

// Check if curve is bridge structure (has Z)
function isBridgeCurve(shape: CurveShape): boolean {
    const { start, end, center } = shape

    const zDiffStartEnd = Math.abs(start.z - end.z)
    const zDiffStartCenter = Math.abs(start.z - center.z)
    const zDiffEndCenter = Math.abs(end.z - center.z)

    const maxZDiff = Math.max(zDiffStartEnd, zDiffStartCenter, zDiffEndCenter)
    return maxZDiff > 1e-6
}

// Build flat curve
function buildFlatCurve(shape: CurveShape, precision: number): Geom3 {
    const { start, end, center, tangent, width, height } = shape

    // Calculate arc parameters
    const rx = start.x - center.x, ry = start.y - center.y
    const r0 = Math.hypot(rx, ry)
    if (r0 < 1e-6) return null as any
    const ang0 = Math.atan2(ry, rx)
    let ang1 = Math.atan2(end.y - center.y, end.x - center.x)

    // Determine clockwise/counterclockwise direction
    const tan = tangent ?? { x:-ry, y:rx, z:0 }
    const crossZ = rx * tan.y - ry * tan.x
    if (crossZ > 0) { if (ang1 <= ang0) ang1 += 2*Math.PI }
    else           { if (ang1 >= ang0) ang1 -= 2*Math.PI }
    let sweep = ang1 - ang0
    if (Math.abs(sweep) > Math.PI) sweep += sweep>0 ? -2*Math.PI : 2*Math.PI

    // Calculate sample points
    const full = Math.PI*2
    const frac = Math.abs(sweep) / full
    const N = Math.max(8, Math.ceil(precision * frac * 1.2))

    // Build ring sector polygon (outer + inner arc)
    const outer: [number,number][] = []
    const inner: [number,number][] = []
    const rOut = r0 + width/2, rIn = r0 - width/2
    for (let i = 0; i <= N; i++) {
        const θ = ang0 + sweep * (i / N)
        outer.push([ center.x + rOut * Math.cos(θ), center.y + rOut * Math.sin(θ) ])
        inner.unshift([ center.x + rIn  * Math.cos(θ), center.y + rIn  * Math.sin(θ) ])
    }

    // Combine points and check direction
    let pts2D = outer.concat(inner) as [number,number][]
    if (shoelace(pts2D) < 0) {
        pts2D = pts2D.reverse()
    }

    const shape2d: Geom2 = fromPoints(pts2D)
    let solid: Geom3 = extrudeLinear({ height }, shape2d)
    solid = translate([0, 0, start.z - height/2], solid)

    return solid
}

// Build bridge curve with unified vertical plane approach
function buildBridgeCurve(shape: CurveShape, precision: number): Geom3 {
    const { start, end, center, tangent, width, height } = shape


    if (!tangent) {
        console.error('Bridge curve requires tangent vector')
        return null as any
    }

    const tangentLength = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y)
    if (tangentLength < 1e-6) {
        console.error('Tangent vector too small')
        return null as any
    }

    // Build coordinate system for vertical plane containing the 3D arc
    const uAxisX = tangent.x / tangentLength
    const uAxisY = tangent.y / tangentLength
    const uAxisZ = 0

    const vAxisX = 0, vAxisY = 0, vAxisZ = 1

    // Normal to the vertical plane
    const wAxisX = uAxisY * vAxisZ - uAxisZ * vAxisY  // = uAxisY
    const wAxisY = uAxisZ * vAxisX - uAxisX * vAxisZ  // = -uAxisX
    const wAxisZ = uAxisX * vAxisY - uAxisY * vAxisX  // = 0

    const X_bias= wAxisX * height/2 //-0.8944*200
    const Y_bias= wAxisY * height/2 //-0.4472*200

    console.log('Unified coordinate system (based on tangent):', {
        tangent: `(${tangent.x.toFixed(3)}, ${tangent.y.toFixed(3)}, ${tangent.z})`,
        uAxis: `(${uAxisX.toFixed(3)}, ${uAxisY.toFixed(3)}, ${uAxisZ})`,
        vAxis: `(${vAxisX}, ${vAxisY}, ${vAxisZ})`,
        wAxis: `(${wAxisX.toFixed(3)}, ${wAxisY.toFixed(3)}, ${wAxisZ})`
    })

    // Project 3D points onto the vertical plane
    function to2D(point: {x: number, y: number, z: number}) {
        // 相对于start的偏移
        const relX = point.x - start.x
        const relY = point.y - start.y
        const relZ = point.z - start.z

        // 在垂直平面内的坐标
        const u = relX * uAxisX + relY * uAxisY + relZ * uAxisZ
        const v = relX * vAxisX + relY * vAxisY + relZ * vAxisZ
        return { u, v }
    }

    const start2D = to2D(start)      // (0, 0)
    const end2D = to2D(end)
    const center2D = to2D(center)

    console.log('2D coordinates:', {
        start2D: `(${start2D.u.toFixed(1)}, ${start2D.v.toFixed(1)})`,
        end2D: `(${end2D.u.toFixed(1)}, ${end2D.v.toFixed(1)})`,
        center2D: `(${center2D.u.toFixed(1)}, ${center2D.v.toFixed(1)})`
    })

    // Calculate arc in 2D projected plane
    const ru = start2D.u - center2D.u
    const rv = start2D.v - center2D.v
    const radius = Math.sqrt(ru * ru + rv * rv)

    if (radius < 1e-6) {
        console.error('Radius too small:', radius)
        return null as any
    }

    const ang0 = Math.atan2(rv, ru)
    const ang1 = Math.atan2(end2D.v - center2D.v, end2D.u - center2D.u)

    // 扫掠计算
    let sweep = ang1 - ang0
    if (Math.abs(sweep) > Math.PI) {
        sweep += sweep > 0 ? -2 * Math.PI : 2 * Math.PI
    }

    console.log('2D arc parameters:', {
        radius: radius.toFixed(2),
        sweep: (sweep * 180 / Math.PI).toFixed(1) + '°'
    })

    // Generate ring profile in 2D plane
    const frac = Math.abs(sweep) / (Math.PI * 2)
    const N = Math.max(8, Math.ceil(precision * frac * 1.2))

    const outer: [number,number][] = []
    const inner: [number,number][] = []
    const rOut = radius + width/2, rIn = radius - width/2  // 注意：这里height是通道高度

    for (let i = 0; i <= N; i++) {
        const θ = ang0 + sweep * (i / N)
        const u_outer = center2D.u + rOut * Math.cos(θ)
        const v_outer = center2D.v + rOut * Math.sin(θ)
        const u_inner = center2D.u + rIn * Math.cos(θ)
        const v_inner = center2D.v + rIn * Math.sin(θ)

        outer.push([u_outer, v_outer])
        inner.unshift([u_inner, v_inner])
    }

    let pts2D = outer.concat(inner) as [number,number][]
    if (shoelace(pts2D) < 0) {
        pts2D = pts2D.reverse()
    }

    const shape2d: Geom2 = fromPoints(pts2D)

    let solid: Geom3 = extrudeLinear({ height: height }, shape2d)

    // 90°
    solid = rotate([Math.PI/2, 0, 0], solid)

    // Transform from 2D plane to 3D space
    const planeAngle = Math.atan2(uAxisY, uAxisX)  // tangent的角度
    if (Math.abs(planeAngle) > 1e-6) {
        solid = rotate([0, 0, planeAngle], solid)
        console.log('Applied unified plane rotation:', (planeAngle * 180 / Math.PI).toFixed(1) + '°')
    }

    solid = translate([start.x- X_bias, start.y-Y_bias, start.z], solid)

    return solid
}

export function buildCurve(shape: CurveShape, precision: number): Geom3 {
    const { start, end, center, tangent, width, height } = shape
    if (width <= 0 || height <= 0) return null as any

    if (isBridgeCurve(shape)) {
        return buildBridgeCurve(shape, precision)
    } else {
        return buildFlatCurve(shape, precision)
    }
}