
// src/lib/stl-generator/builder/shapes/polygon.ts

import { fromPoints } from '@jscad/modeling/src/geometries/geom2'
import { extrudeLinear } from '@jscad/modeling/src/operations/extrusions'
import { translate, rotate } from '@jscad/modeling/src/operations/transforms'
import { PolygonShape } from '../../model/types'
import type { Vec2 } from '@jscad/modeling/src/maths/types'
import { mirror } from '@jscad/modeling/src/operations/transforms'



function shoelace(pts: Vec2[]): number {
    let sum = 0
    for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i]
        const [x2, y2] = pts[(i + 1) % pts.length]
        sum += x1 * y2 - y1 * x2
    }
    return sum / 2
}

function isVerticalPolygon(shape: PolygonShape): boolean {
    const firstZ = shape.points[0].z
    return shape.points.some(p => Math.abs(p.z - firstZ) > 1e-6)
}



function buildFlatPolygon(shape: PolygonShape) {
    console.log('Building flat polygon (XY plane)')

    let points2D = shape.points.map(p => [p.x, p.y]) as Vec2[]
    if (shoelace(points2D) < 0) {
        points2D = points2D.reverse()
    }

    const poly2D = fromPoints(points2D)
    const height = shape.direction.z
    const solid = extrudeLinear({ height }, poly2D)
    const baseZ = shape.points[0].z
    return translate([0, 0, baseZ], solid)
}


function buildVerticalPolygon(shape: PolygonShape) {
    console.log('Building vertical polygon - XY plane + rotation approach')

    const { points, direction } = shape

    // Find the longest edge in XY projection to determine main plane orientation
    let maxDistance = 0
    let point1 = points[0], point2 = points[1]

    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            const dx = points[j].x - points[i].x
            const dy = points[j].y - points[i].y
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist > maxDistance) {
                maxDistance = dist
                point1 = points[i]
                point2 = points[j]
            }
        }
    }


    const pathDirX = point2.x - point1.x
    const pathDirY = point2.y - point1.y
    const planeAngle = Math.atan2(pathDirY, pathDirX)

    console.log('Plane angle:', (planeAngle * 180 / Math.PI).toFixed(1) + '°')

    // Project 3D polygon to 2D vertical plane
    const planeX_x = Math.cos(planeAngle)
    const planeX_y = Math.sin(planeAngle)

    function to2D(point: {x: number, y: number, z: number}) {
        const relX = point.x - point1.x
        const relY = point.y - point1.y
        const relZ = point.z - point1.z

        // u = horizontal distance along plane, v = vertical (Z)
        const u = relX * planeX_x + relY * planeX_y
        const v = relZ
        return [u, v] as Vec2
    }

    let points2D = points.map(to2D)

    if (shoelace(points2D) < 0) {
        points2D = points2D.reverse()
    }

    if (points2D.length < 3) {
        return null as any
    }

    const area = Math.abs(shoelace(points2D))
    if (area < 1e-6) {
        console.error('Polygon is degenerate (zero area):', area)
        return null as any
    }

    const poly2D = fromPoints(points2D)

    const extrudeHeight = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z)

    let solid = extrudeLinear({ height: extrudeHeight }, poly2D)

    solid = rotate([Math.PI/2, 0, 0], solid)
    solid = rotate([0, 0,Math.PI/2], solid)


    if (Math.abs(planeAngle) > 1e-6) {
        solid = rotate([0, 0, planeAngle], solid)
    }

    // Additional rotation to align with direction vector
    const dirAngle = Math.atan2(direction.y, direction.x)
    if (Math.abs(dirAngle - planeAngle) > 1e-6) {
        const additionalRotation = dirAngle - planeAngle
        solid = rotate([0, 0, additionalRotation], solid)
        console.log('Additional direction rotation:', (additionalRotation * 180 / Math.PI).toFixed(1) + '°')
    }


    solid = translate([point1.x, point1.y, point1.z], solid)

    return solid
}

export function buildPolygon(shape: PolygonShape) {
    if (isVerticalPolygon(shape)) {
        return buildVerticalPolygon(shape)
    } else {
        return buildFlatPolygon(shape)
    }
}