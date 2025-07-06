// src/lib/stl-generator/builder/shapes/circle.ts
import { translate } from '@jscad/modeling/src/operations/transforms/index'
import { cylinder }  from '@jscad/modeling/src/primitives/index'
import { CircleShape } from '../../model/types'

export function buildCircle(shape: CircleShape, segments: number) {
    // Create cylinder
    // shape.center.z is the elevation height
    const cyl = cylinder({
        height: shape.height,
        radius: shape.radius,
        segments: segments
    })

    // Translate to design position
    // ！！circle数据的"z": 200，指的是当前层elevation高度。circle translate的坐标其实是圆柱体的中心位置，而不是底面中心的位置
    return translate([shape.center.x, shape.center.y, shape.center.z + shape.height / 2], cyl)
}