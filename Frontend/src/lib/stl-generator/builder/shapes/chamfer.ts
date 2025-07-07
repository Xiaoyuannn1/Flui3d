
// src/lib/stl-generator/builder/shapes/chamfer.ts

import { cylinderElliptic } from '@jscad/modeling/src/primitives/index'
import { translate } from '@jscad/modeling/src/operations/transforms/index'
import { ChamferShape } from '../../model/types'

export function buildChamfer(shape: ChamferShape, precision: number) {
    const { center, radius, radius_top, height } = shape

    // Validate parameters
    if (radius <= 0 || radius_top <= 0 || height <= 0) {
        console.error('Invalid chamfer parameters:', { radius, radius_top, height })
        return null as any
    }

    // Create chamfer
    let chamfer = cylinderElliptic({
        height: height,
        startRadius: [radius, radius],         // 底部半径 [x方向, y方向]
        endRadius: [radius_top, radius_top],   // 顶部半径 [x方向, y方向]
        segments: precision,
        center: [0, 0, height/2]
    })

    // Translate to specified position
    //chamfer = translate([center.x, center.y, center.z + height/2], chamfer)
    chamfer = translate([center.x, center.y, center.z ], chamfer)

    return chamfer
}