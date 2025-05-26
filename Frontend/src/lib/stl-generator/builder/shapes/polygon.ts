
import { fromPoints } from '@jscad/modeling/src/geometries/geom2'
import { extrudeLinear } from '@jscad/modeling/src/operations/extrusions'
import { translate } from '@jscad/modeling/src/operations/transforms'
import { PolygonShape } from '../../model/types'
import type { Vec2 } from '@jscad/modeling/src/maths/types'



export function buildPolygon(shape: PolygonShape) {
    const points2D = shape.points.map(p => [p.x, p.y]) as Vec2[]
    const poly2D = fromPoints(points2D)
    const height = shape.direction.z
    const solid = extrudeLinear({ height }, poly2D)
    const baseZ = shape.points[0].z
    return translate([0, 0, baseZ], solid)
}