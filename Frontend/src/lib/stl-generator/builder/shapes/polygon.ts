
// src/lib/stl-generator/builder/shapes/polygon.ts

import { fromPoints } from '@jscad/modeling/src/geometries/geom2'
import { extrudeLinear } from '@jscad/modeling/src/operations/extrusions'
import { translate, rotate } from '@jscad/modeling/src/operations/transforms'
import { PolygonShape } from '../../model/types'
import type { Vec2 } from '@jscad/modeling/src/maths/types'
import { mirror } from '@jscad/modeling/src/operations/transforms'



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

/**
 * 检查是否为垂直polygon（Z坐标不全相同）
 */
function isVerticalPolygon(shape: PolygonShape): boolean {
    const firstZ = shape.points[0].z
    return shape.points.some(p => Math.abs(p.z - firstZ) > 1e-6)
}

/**
 * 构建平面Polygon（原有逻辑，完全不变）
 */
function buildFlatPolygon(shape: PolygonShape) {
    console.log('Building flat polygon (XY plane)')

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
 * 构建垂直Polygon - 在XY平面创建，然后旋转到正确位置
 * 类似Line的简单方法：创建 → 旋转 → 平移
 */
function buildVerticalPolygon(shape: PolygonShape) {
    console.log('Building vertical polygon - XY plane + rotation approach')

    const { points, direction } = shape

    console.log('Vertical polygon points:', points.map(p =>
        `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`
    ))
    console.log('Direction vector:',
        `(${direction.x.toFixed(1)}, ${direction.y.toFixed(1)}, ${direction.z.toFixed(1)})`
    )

    // 1. 确定主要的垂直平面方向
    // 找到XY平面投影距离最大的两个点
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

    console.log('Main direction points:',
        `(${point1.x.toFixed(1)}, ${point1.y.toFixed(1)}, ${point1.z.toFixed(1)}) → ` +
        `(${point2.x.toFixed(1)}, ${point2.y.toFixed(1)}, ${point2.z.toFixed(1)})`
    )

    // 2. 计算垂直平面的方向角
    const pathDirX = point2.x - point1.x
    const pathDirY = point2.y - point1.y
    const planeAngle = Math.atan2(pathDirY, pathDirX)

    console.log('Plane angle:', (planeAngle * 180 / Math.PI).toFixed(1) + '°')

    // 3. 将所有点投影到一个标准的垂直平面（XZ平面）
    // 以point1为原点，建立局部坐标系
    const planeX_x = Math.cos(planeAngle)
    const planeX_y = Math.sin(planeAngle)

    function to2D(point: {x: number, y: number, z: number}) {
        const relX = point.x - point1.x
        const relY = point.y - point1.y
        const relZ = point.z - point1.z

        // u: 沿垂直平面的水平方向，v: 垂直方向(Z)
        const u = relX * planeX_x + relY * planeX_y
        const v = relZ
        return [u, v] as Vec2
    }

    let points2D = points.map(to2D)

    console.log('2D projected points:', points2D.map(p =>
        `(${p[0].toFixed(1)}, ${p[1].toFixed(1)})`
    ))

    // 4. 检查和修正点的顺序
    if (shoelace(points2D) < 0) {
        points2D = points2D.reverse()
    }

    // 5. 验证多边形有效性
    if (points2D.length < 3) {
        return null as any
    }

    const area = Math.abs(shoelace(points2D))
    if (area < 1e-6) {
        console.error('Polygon is degenerate (zero area):', area)
        return null as any
    }

    // 6. 在XY平面创建2D多边形
    const poly2D = fromPoints(points2D)

    // 7. 计算拉伸高度
    const extrudeHeight = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z)
    console.log('Extrude height:', extrudeHeight.toFixed(2))

    // 8. 沿Z轴拉伸（这是extrudeLinear的正确用法）
    let solid = extrudeLinear({ height: extrudeHeight }, poly2D)

    // 9. 旋转到正确的垂直平面方向
    // 首先绕Y轴旋转90°，让拉伸方向从Z轴变成X轴
    solid = rotate([Math.PI/2, 0, 0], solid)
    solid = rotate([0, 0,Math.PI/2], solid)

    // 然后绕Z轴旋转到正确的水平方向
    if (Math.abs(planeAngle) > 1e-6) {
        solid = rotate([0, 0, planeAngle], solid)
    }

    // 10. 计算direction的方向并调整
    const dirAngle = Math.atan2(direction.y, direction.x)
    if (Math.abs(dirAngle - planeAngle) > 1e-6) {
        // 如果direction不沿着垂直平面方向，需要额外旋转
        const additionalRotation = dirAngle - planeAngle
        solid = rotate([0, 0, additionalRotation], solid)
        console.log('Additional direction rotation:', (additionalRotation * 180 / Math.PI).toFixed(1) + '°')
    }



    // 11. 平移到起点位置
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