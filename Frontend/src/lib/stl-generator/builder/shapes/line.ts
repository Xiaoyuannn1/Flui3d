
import { cuboid }  from '@jscad/modeling/src/primitives/index'
import { translate, rotate } from '@jscad/modeling/src/operations/transforms/index'
import { LineShape } from '../../model/types'

/**
 * 检查是否为桥结构中的Line（Z坐标有变化）
 */
function isBridgeLine(shape: LineShape): boolean {
    const zDiff = Math.abs(shape.start.z - shape.end.z)
    return zDiff > 1e-6
}

/**
 * 构建平面Line（原有逻辑，完全不变）
 */
function buildFlatLine(shape: LineShape) {
    const { start, end, width, height } = shape

    // 计算XY平面的长度和角度
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.sqrt(dx * dx + dy * dy)
    const angle = Math.atan2(dy, dx)

    // 创建长方体
    let box = cuboid({
        size: [length, width, height],
        center: [length/2, 0, height/2]
    })

    // 旋转到正确方向
    if (Math.abs(angle) > 1e-6) {
        box = rotate([0, 0, angle], box)
    }

    // 平移到起点位置
    return translate([start.x, start.y, start.z - height / 2], box)
}

/**
 * 构建桥结构Line（简单的3D长方体）
 */
function buildBridgeLine(shape: LineShape) {
    console.log('Building bridge line - simple 3D approach')

    const { start, end, width, height } = shape

    // 1. 计算3D距离和方向
    const dx = end.x - start.x
    const dy = end.y - start.y
    const dz = end.z - start.z

    const length3D = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const lengthXY = Math.sqrt(dx * dx + dy * dy)

    // 2. 计算旋转角度
    const yawAngle = Math.atan2(dy, dx)           // 绕Z轴旋转角度
    const pitchAngle = -Math.atan2(dz, lengthXY)   // 绕Y轴旋转角度

    console.log('Bridge line params:', {
        length3D: length3D.toFixed(2),
        yawAngle: (yawAngle * 180 / Math.PI).toFixed(1) + '°',
        pitchAngle: (pitchAngle * 180 / Math.PI).toFixed(1) + '°'
    })

    // 3. 创建长方体 - 沿X轴，长度为3D距离
    let box = cuboid({
        size: [length3D, width, height],
        center: [length3D/2, 0, height/2]
    })

    // 4. 旋转：先pitch（倾斜），后yaw（转向）
    if (Math.abs(pitchAngle) > 1e-6) {
        box = rotate([0, pitchAngle, 0], box)
    }

    if (Math.abs(yawAngle) > 1e-6) {
        box = rotate([0, 0, yawAngle], box)
    }

    // 5. 平移到起点
    return translate([start.x, start.y, start.z - height / 2], box)
}

export function buildLine(shape: LineShape) {
    if (isBridgeLine(shape)) {
        return buildBridgeLine(shape)
    } else {
        return buildFlatLine(shape)
    }
}
