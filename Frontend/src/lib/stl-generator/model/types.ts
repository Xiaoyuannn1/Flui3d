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
    tangent?: Point3        // 先留字段
    width: number
    height: number
    fill?: boolean          // channel 中也可能要 union
}

export interface ChamferShape {
    type: 'Chamfer'
    center: Point3
    radius: number       // 底部半径
    radius_top: number   // 顶部半径
    height: number
    fill?: boolean
}

export type Shape = CircleShape | LineShape | PolygonShape | CurveShape | ChamferShape


export interface Channel {
    shapes: Shape[]
}

export interface Component {
    id: string
    shapes: Shape[]
    channels: Channel[]
}

export interface CompensationPolygon {
    type: 'Polygon'
    points : Point3[]
    direction: Point3
    fill?: boolean
}
export interface Layer {
    elevation: number
    components: Component[]
    channels: Channel[]
    compensation?: CompensationPolygon
}

export interface CrossLayerConnection {
    shapes: Shape[]
}

export interface ChipJSON {
    layers: Layer[]
    crosslayerConnections: CrossLayerConnection[]
    relation?: any[]
    general: {
        length: number
        width: number
        thickness: number
        precision: 'High' | 'Medium' | 'Low'
    }
}