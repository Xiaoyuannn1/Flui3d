import { translate } from '@jscad/modeling/src/operations/transforms/index'
import { cylinder }  from '@jscad/modeling/src/primitives/index'
import { CircleShape } from '../../model/types'

export function buildCircle(s: CircleShape, segments: number){
    const cyl = cylinder({
        height:  s.height,
        radius:  s.radius,
        segments
    })
    /* JSCAD cylinder 默认中心在原点中点，需平移 */
    return translate(
        [s.center.x, s.center.y, s.center.z - s.height / 2],
        cyl
    )
}
