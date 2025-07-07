// src/lib/stl-generator/builder/shapes/line.ts
import { cuboid }  from '@jscad/modeling/src/primitives/index'
import { translate, rotate } from '@jscad/modeling/src/operations/transforms/index'
import { LineShape } from '../../model/types'


function isBridgeLine(shape: LineShape): boolean {
    const zDiff = Math.abs(shape.start.z - shape.end.z)
    return zDiff > 1e-6
}

function buildFlatLine(shape: LineShape) {
    const { start, end, width, height } = shape

    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.sqrt(dx * dx + dy * dy)
    const angle = Math.atan2(dy, dx)

    // Create box aligned with X-axis, then rotate体
    let box = cuboid({
        size: [length, width, height],
        center: [length/2, 0, height/2]
    })

    if (Math.abs(angle) > 1e-6) {
        box = rotate([0, 0, angle], box)
    }

    // Translate so bottom face is at start.z
    return translate([start.x, start.y, start.z-height/2], box)
}


function rotatePointByPitchThenYaw(
    point: [number, number, number],
    pitch: number,
    yaw: number
): [number, number, number] {
    const [x, y, z] = point

    // Pitch rotation (around Y-axis)
    const cosP = Math.cos(pitch)
    const sinP = Math.sin(pitch)
    const x1 =  x * cosP + z * sinP
    const z1 = -x * sinP + z * cosP
    const y1 =  y

    // Pitch rotation (around Y-axis)
    const cosY = Math.cos(yaw)
    const sinY = Math.sin(yaw)
    const x2 = x1 * cosY - y1 * sinY
    const y2 = x1 * sinY + y1 * cosY
    const z2 = z1

    return [x2, y2, z2]
}



function buildBridgeLine(shape: LineShape) {

    const { start, end, width, height } = shape

    const dx = end.x - start.x
    const dy = end.y - start.y
    const dz = end.z - start.z

    const length3D = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const lengthXY = Math.sqrt(dx * dx + dy * dy)

    // Calculate 3D orientation angles
    const yawAngle = Math.atan2(dy, dx)           // 绕Z轴
    const pitchAngle = -Math.atan2(dz, lengthXY)   // 绕Y轴


    let box = cuboid({
        size: [length3D, width, height],
        center: [length3D/2, 0, height/2]
    })

    // Apply 3D rotations
    if (Math.abs(pitchAngle) > 1e-6) {
        box = rotate([0, pitchAngle, 0], box)
    }

    if (Math.abs(yawAngle) > 1e-6) {
        box = rotate([0, 0, yawAngle], box)
    }

    //start偏移量
    const startDiffLocal: [number, number, number] = [0, 0, height / 2]
    const [rotX, rotY, rotZ] = rotatePointByPitchThenYaw(
        startDiffLocal,
        pitchAngle,
        yawAngle
    )

    return translate([start.x-rotX, start.y-rotY, start.z-rotZ], box)
}

export function buildLine(shape: LineShape) {
    if (isBridgeLine(shape)) {
        return buildBridgeLine(shape)
    } else {
        return buildFlatLine(shape)
    }
}
