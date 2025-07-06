// src/lib/stl-generator/builder/shapes/voronoiCompensation.ts

import { fromPoints } from '@jscad/modeling/src/geometries/geom2'
import { extrudeLinear } from '@jscad/modeling/src/operations/extrusions'
import { translate } from '@jscad/modeling/src/operations/transforms'
import type { Vec2 } from '@jscad/modeling/src/maths/types'

export interface VoronoiCompensationData {
    elevation: number
    regions: VoronoiCompensationRegion[]
}

export interface VoronoiCompensationRegion {
    polygon: { x: number, y: number }[]
    compensation: number
    seedPoint: { x: number, y: number }
    canvasHeight: number
}

// Build single Voronoi compensation region
export function buildVoronoiCompensationRegion(region: VoronoiCompensationRegion, elevation: number): any {
    const { polygon, compensation, canvasHeight } = region

    if (polygon.length < 3 || compensation <= 0) {
        return null
    }

    const stlPoints: Vec2[] = polygon.map(point => [
        point.x * 10,
        (region.canvasHeight - point.y) * 10  // Y轴翻转
    ])

    const correctedPoints = ensureCounterClockwise(stlPoints)


    let poly2D
    try {
        poly2D = fromPoints(correctedPoints)
    } catch (error) {
        console.warn('[VoronoiComp] Failed to create 2D polygon:', error)
        return null
    }


    let solid = extrudeLinear({ height: compensation }, poly2D)

    solid = translate([0, 0, elevation - compensation], solid)
    //console.log(`[VoronoiComp] Region: ${polygon.length}-sided polygon, STL coordinate range ${correctedPoints[0][0].toFixed(0)}-${correctedPoints[correctedPoints.length-1][0].toFixed(0)}, downward ${compensation}μm`)

    return solid
}

//Ensure points counterclockwise
function ensureCounterClockwise(points: Vec2[]): Vec2[] {
    let signedArea = 0
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length
        signedArea += (points[j][0] - points[i][0]) * (points[j][1] + points[i][1])
    }

    if (signedArea > 0) {
        return [...points].reverse()
    }

    return points
}

//Batch build all Voronoi compensation structures
export function buildAllVoronoiCompensation(data: VoronoiCompensationData[]): any[] {
    const compensationStructures: any[] = []
    let totalRegions = 0

    console.log(`[VoronoiComp] Starting to build Voronoi compensation for ${data.length} elevations...`)

    data.forEach((elevationData, elevIndex) => {
        const { elevation, regions } = elevationData
        console.log(`[VoronoiComp] Elevation ${elevation}: processing ${regions.length} regions`)

        regions.forEach((region, regionIndex) => {
            const structure = buildVoronoiCompensationRegion(region, elevation)
            if (structure) {
                compensationStructures.push(structure)
                totalRegions++
            }
            // Output progress every 100 regions
            if ((totalRegions) % 100 === 0) {
                console.log(`[VoronoiComp] Built: ${totalRegions} regions`)
            }
        })
    })

    console.log(`[VoronoiComp] Build completed: ${compensationStructures.length} Voronoi compensation structures`)
    return compensationStructures
}