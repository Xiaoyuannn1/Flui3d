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
        segments: segments,
        center: [0, 0, shape.height/2]  // 圆柱体底面在z=0
    })

    // 平移到设计中指定的位置
    // 这里的坐标就是JSON中的坐标，都是相对于芯片左下角(0,0,0)的
    return translate([shape.center.x, shape.center.y, shape.center.z], cyl)
}