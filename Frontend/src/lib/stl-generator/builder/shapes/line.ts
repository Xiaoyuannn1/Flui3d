import { cuboid }  from '@jscad/modeling/src/primitives/index'
import { translate, rotate } from '@jscad/modeling/src/operations/transforms/index'
import { LineShape } from '../../model/types'
import { yawLen }    from '../../utils'

export function buildLine(s: LineShape){
    const { len, yaw } = yawLen(s.start, s.end)
    const box = cuboid({ size: [len, s.width, s.height] })
    const rotated = rotate([0,0,yaw], box)

    return translate(
        [
            s.start.x + (len/2)*Math.cos(yaw),
            s.start.y + (len/2)*Math.sin(yaw),
            s.start.z - s.height/2
        ],
        rotated
    )
}
