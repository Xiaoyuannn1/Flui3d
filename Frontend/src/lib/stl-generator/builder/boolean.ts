import { union, subtract } from '@jscad/modeling/src/operations/booleans/index'

export function merge(base: any, part: any, doSubtract: boolean) {
    try {
        if (doSubtract) {
            // 差集：从base中减去part（挖空）
            return subtract(base, part)
        } else {
            // 并集：将part添加到base（填充）
            return union(base, part)
        }
    } catch (error) {
        console.error('Boolean operation failed:', error)
        return base
    }
}
