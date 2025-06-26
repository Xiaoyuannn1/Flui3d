// src/lib/stl-generator/builder/shapes/circle.ts
import { translate } from '@jscad/modeling/src/operations/transforms/index'
import { cylinder }  from '@jscad/modeling/src/primitives/index'
import { CircleShape } from '../../model/types'

export function buildCircle(shape: CircleShape, segments: number) {
    // 创建圆柱体
    // 重要：shape.center.x和shape.center.y是基于芯片左下角(0,0)的坐标
    // shape.center.z是圆柱体底面的高度
    const cyl = cylinder({
        height: shape.height,
        radius: shape.radius,
        segments: segments
    })

    // 平移到设计中指定的位置
    // 这里的坐标就是JSON中的坐标，都是相对于芯片左下角(0,0,0)的
    // circle数据的"z": 200，指的是当前层elevation高度。circle translate的坐标其实是圆柱体的中心位置，而不是底面中心的位置
    return translate([shape.center.x, shape.center.y, shape.center.z + shape.height / 2], cyl)
}