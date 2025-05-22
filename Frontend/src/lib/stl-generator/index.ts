import { readDesignJson } from './parser/jsonParser'
import { ChipJSON, Shape } from './model/types'
import { precisionMap, yawLen } from './utils'
import { buildCircle } from './builder/shapes/circle'
import { buildLine }   from './builder/shapes/line'
import { merge }       from './builder/boolean'
import { writeStl }    from './exporter'
import { cuboid }      from '@jscad/modeling/src/primitives/index'

export async function generateStl(jsonPath: string, outPath: string) {
    const design: ChipJSON = readDesignJson(jsonPath)
    const precKey          = design.general.precision ?? 'Medium'
    const segments         = precisionMap[precKey]

    /* 1. 创建整体芯片立方体（布尔起始体，fill = true） */
    const chip = cuboid({
        size: [
            design.general.length,
            design.general.width,
            design.general.thickness
        ]
    })

    /* 2. 遍历所有层/组件/通道/形状，逐个布尔合并 */
    let model: any = chip

    const handleShape = (shape: Shape) => {
        const csg =
            shape.type === 'Circle'
                ? buildCircle(shape, segments)
                : buildLine(shape)
        /* fill=false ⇒ subtract；fill=true ⇒ union (默认 false) */
        model = merge(model, csg, !(shape as any).fill)
    }

    for (const layer of design.layers) {
        for (const comp of layer.components) {
            comp.shapes.forEach(handleShape)
        }
        for (const chan of layer.channels) {
            chan.shapes.forEach(handleShape)
        }
    }

    /* 3. 写 STL */
    await writeStl(model, outPath)
}
