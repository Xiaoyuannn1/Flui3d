import { cuboid }  from '@jscad/modeling/src/primitives/index'
import { translate, rotate } from '@jscad/modeling/src/operations/transforms/index'
import { LineShape } from '../../model/types'
import { yawLen }    from '../../utils'

export function buildLine(shape: LineShape) {
    // 计算线段长度和旋转角度
    const { len, yaw } = yawLen(shape.start, shape.end)

    // 创建长方体
    // 初始时长方体沿X轴方向，起点在原点
    const box = cuboid({
        size: [len, shape.width, shape.height],
        center: [len/2, 0, shape.height/2]  // 让起点在(0,0,0)，底面在z=0
    })

    // 绕Z轴旋转到正确方向
    const rotated = rotate([0, 0, yaw], box)

    // 平移到起点位置
    // shape.start.x, shape.start.y 是基于芯片左下角(0,0)的坐标
    // shape.start.z 是通道底面的高度
    return translate([shape.start.x, shape.start.y, shape.start.z], rotated)
}