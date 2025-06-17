
import { ChipJSON, Shape, CircleShape, LineShape, PolygonShape, CurveShape,ChamferShape } from './model/types'
import { precisionMap } from './utils'
import { buildCircle } from './builder/shapes/circle'
import { buildLine } from './builder/shapes/line'
import { buildPolygon } from './builder/shapes/polygon'
import { buildCurve   } from './builder/shapes/curve'
import { merge } from './builder/boolean'
//import { writeStl } from './exporter'
//import { readDesignJson } from './parser/jsonParser'
import { cuboid } from '@jscad/modeling/src/primitives/index'
import { buildChamfer } from './builder/shapes/chamfer'
import { serialize } from '@jscad/stl-serializer'

// export async function generateStl(jsonPath: string, outPath: string) {
//     const design: ChipJSON = readDesignJson(jsonPath)
//     const precKey = design.general.precision ?? 'Medium'
//     const segments = precisionMap[precKey]
//
//     // 芯片尺寸
//     const chipSize = {
//         x: design.general.length,    // 20000
//         y: design.general.width,     // 15000
//         z: design.general.thickness  // 4000
//     }
//
//     // 创建基础芯片立方体
//     // 重要：JSCAD默认把物体中心放在(0,0,0)
//     // 但我们需要芯片的左下角在(0,0,0)，所以要移动中心
//
//     let model = cuboid({
//         size: [chipSize.x, chipSize.y, chipSize.z],
//         center: [chipSize.x/2, chipSize.y/2, chipSize.z/2]
//     })
//
//     // 处理每个形状的函数
//     const handleShape = (shape: Shape) => {
//         let csg
//
//         // 根据形状类型构建3D对象
//         switch (shape.type) {
//             case 'Circle':
//                 csg = buildCircle(shape as CircleShape, segments)
//                 break
//             case 'Line':
//                 csg = buildLine(shape as LineShape)
//                 break
//             case 'Polygon':
//                 csg = buildPolygon(shape as PolygonShape)
//                 break
//             case 'Curve':
//                 csg = buildCurve(shape as CurveShape, segments)
//                 break
//             case "Chamfer":
//                 csg = buildChamfer(shape as ChamferShape, segments)
//                 break
//             default:
//                 console.warn(`Unsupported shape type: ${(shape as any).type}`)
//                 return
//         }
//
//         // 判断是否有fill属性，默认为false（挖空）
//         // Circle可能有fill属性，Line通常没有
//         const fillValue = (shape as any).fill
//         const shouldSubtract = fillValue === undefined ? true : !fillValue
//
//         // 执行布尔运算
//         model = merge(model, csg, shouldSubtract)
//     }
//
//     // 遍历所有层
//     for (const layer of design.layers) {
//         // 处理组件中的形状
//         for (const comp of layer.components) {
//             comp.shapes.forEach(handleShape)
//             // 处理组件内部的通道
//             for (const chan of comp.channels) {
//                 chan.shapes.forEach(handleShape)
//             }
//         }
//         // 处理层级的通道
//         for (const chan of layer.channels) {
//             chan.shapes.forEach(handleShape)
//         }
//     }
//     //遍历所有跨层连接
//     for (const cross of design.crosslayerConnections) {
//         // 处理跨层连接中的形状
//         for (const shape of cross.shapes) {
//             handleShape(shape)
//         }
//     }
//
//     // 导出STL文件
//     return await writeStl(model, outPath)
// }

// 在现有代码末尾添加这个函数
export async function generateStlInBrowser(chipJSON: ChipJSON): Promise<ArrayBuffer> {
    // 这个函数的作用：接收JSON对象，返回STL数据（不涉及文件操作）
    const precKey = chipJSON.general.precision ?? 'Medium'
    const segments = precisionMap[precKey]

    const chipSize = {
        x: chipJSON.general.length,
        y: chipJSON.general.width,
        z: chipJSON.general.thickness
    }

    // 创建基础芯片立方体（复制你现有的逻辑）
    let model = cuboid({
        size: [chipSize.x, chipSize.y, chipSize.z],
        center: [chipSize.x/2, chipSize.y/2, chipSize.z/2]
    })

    const handleShape = (shape: Shape) => {
        let csg

        switch (shape.type) {
            case 'Circle':
                csg = buildCircle(shape as CircleShape, segments)
                break
            case 'Line':
                csg = buildLine(shape as LineShape)
                break
            case 'Polygon':
                csg = buildPolygon(shape as PolygonShape)
                break
            case 'Curve':
                csg = buildCurve(shape as CurveShape, segments)
                break
            case "Chamfer":
                csg = buildChamfer(shape as ChamferShape, segments)
                break
            default:
                console.warn(`Unsupported shape type: ${(shape as {type: string}).type}`)
                return
        }

        const fillValue = (shape as {fill?: boolean}).fill
        const shouldSubtract = fillValue === undefined ? true : !fillValue
        model = merge(model, csg, shouldSubtract)
    }

    // 遍历所有层（完全复制你现有的循环）
    for (const layer of chipJSON.layers) {
        if (layer.compensation) {
            const compensationShape: PolygonShape = {
                type: 'Polygon',
                points: layer.compensation.points,
                direction: layer.compensation.direction,
                fill: layer.compensation.fill
            }
            handleShape(compensationShape)
        }
        for (const comp of layer.components) {
            comp.shapes.forEach(handleShape)
            for (const chan of comp.channels) {
                chan.shapes.forEach(handleShape)
            }
        }
        for (const chan of layer.channels) {
            chan.shapes.forEach(handleShape)
        }
    }

    for (const cross of chipJSON.crosslayerConnections) {
        for (const shape of cross.shapes) {
            handleShape(shape)
        }
    }

    // 简化的序列化部分：
    const rawData = serialize({ binary: false }, model) // 先用ASCII格式
    const stlContent = Array.isArray(rawData) ? rawData.join('') : String(rawData)

    const encoder = new TextEncoder()
    return encoder.encode(stlContent).buffer
}