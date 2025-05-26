export interface Point3 { x: number; y: number; z: number }

export interface CircleShape {
    type: 'Circle'
    center: Point3
    radius: number
    height: number
    fill?: boolean
}

export interface LineShape {
    type: 'Line'
    start: Point3
    end:   Point3
    width: number
    height: number
    fill?: boolean
}

export interface PolygonShape {
    type: 'Polygon'
    points : Point3[]  // 所有顶点 z 相同
    direction: Point3 //
    fill?: boolean
}

export interface CurveShape {
    type: 'Curve'
    start: Point3
    end: Point3
    center: Point3          // 圆弧圆心
    tangent?: Point3        // 先留字段，未来支持贝塞尔
    width: number
    height: number
    fill?: boolean          // channel 中也可能要 union
}

export type Shape = CircleShape | LineShape | PolygonShape | CurveShape


export interface Channel {shapes: Shape[] }

export interface Component {
    id: string
    shapes: Shape[]
    channels: Channel[]
}

export interface Layer {
    elevation: number
    components: Component[]
    channels: Channel[]
}

export interface ChipJSON {
    layers: Layer[]
    crosslayerConnections?: any[]
    relation?: any[]
    general: {
        length: number
        width: number
        thickness: number
        precision: 'High' | 'Medium' | 'Low'
    }
}