// src/lib/stl-generator/builder/shapes/compensation.ts

import { cuboid } from '@jscad/modeling/src/primitives/index'
import { translate } from '@jscad/modeling/src/operations/transforms/index'

export interface CompensationBlock {
    x: number           // 像素坐标X
    y: number           // 像素坐标Y
    elevation: number   // 所在elevation高度
    precision: number   // 精度值（20/28/36）
    compensation: number // 补偿值（向上取整后）
    canvasHeight: number  // 新增：画布高度
}


export function buildCompensationBlock(block: CompensationBlock): any {
    const { x, y, elevation, precision, compensation, canvasHeight } = block  // 确保解构了canvasHeight


    const realX = x * 10
    //const realY = y * 10
    const realY = (canvasHeight - y) * 10
    const realZ = elevation


    const width = precision * 10
    const height = precision * 10
    const depth = compensation

    if (depth <= 0) {
        return null
    }


    let compensationBox = cuboid({
        size: [width, height, depth],
        center: [0, 0, -depth/2]
    })

    compensationBox = translate([realX, realY, realZ], compensationBox)


    return compensationBox
}


export function buildAllCompensationBlocks(blocks: CompensationBlock[]): any[] {
    const compensationStructures: any[] = []


    blocks.forEach((block, index) => {
        const structure = buildCompensationBlock(block)
        if (structure) {
            compensationStructures.push(structure)
        }

        // 每50个输出一次进度
        if ((index + 1) % 50 === 0) {
            console.log(`[Compensation] 已构建: ${index + 1}/${blocks.length}`)
        }
    })

    console.log(`[Compensation] 成功构建 ${compensationStructures.length} 个补偿结构`)
    return compensationStructures
}