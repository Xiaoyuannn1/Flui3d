
import { fromPoints } from '@jscad/modeling/src/geometries/geom2'
import { extrudeLinear } from '@jscad/modeling/src/operations/extrusions'
import { translate } from '@jscad/modeling/src/operations/transforms'
import { PolygonShape } from '../../model/types'
import type { Vec2 } from '@jscad/modeling/src/maths/types'



export function buildPolygon(shape: PolygonShape) {
    let points2D = shape.points.map(p => [p.x, p.y]) as Vec2[]
    // 如果点是顺时针顺序（面积为负），反转为逆时针
    if (shoelace(points2D) < 0) {
        points2D = points2D.reverse()
    }
    const poly2D = fromPoints(points2D)
    const height = shape.direction.z
    const solid = extrudeLinear({ height }, poly2D)
    const baseZ = shape.points[0].z
    return translate([0, 0, baseZ], solid)
}

/**
 * 计算 2D 多边形的有符号面积，* < 0 表示顺时针，* > 0 表示逆时针
 */
function shoelace(pts: Vec2[]): number {
    let sum = 0
    for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i]
        const [x2, y2] = pts[(i + 1) % pts.length]
        sum += x1 * y2 - y1 * x2
    }
    return sum / 2
}