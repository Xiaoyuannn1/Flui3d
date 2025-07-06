import path from 'path'
import { generateStl } from '../lib/stl-generator/index'

const [, , jsonArg, outArg] = process.argv
const jsonPath = jsonArg ?? 'data/sample.json'
const outPath  = outArg  ?? 'output/result.stl'

const absJson = path.resolve(jsonPath)
const absOut  = path.resolve(outPath)

generateStl(absJson, absOut)
    .then(finalPath => console.log('STL generation completed:', finalPath))
    .catch(e => console.error('STL generation failed:', e));