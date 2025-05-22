export const precisionMap = { High: 64, Medium: 32, Low: 16 } as const

/* 计算两点间距离和水平旋转角（弧度） */
export function yawLen(
    p1: {x:number;y:number},
    p2: {x:number;y:number}
){
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const len = Math.hypot(dx, dy)
    const yaw = Math.atan2(dy, dx)
    return { len, yaw }
}
