import { union, subtract } from '@jscad/modeling/src/operations/booleans/index'

export function merge(base: any, part: any, doSubtract: boolean){
    return doSubtract ? subtract(base, part) : union(base, part)
}
