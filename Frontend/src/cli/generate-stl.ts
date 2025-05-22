import path from 'path'

import { generateStl } from '../lib/stl-generator/index'

/* 用法：
   npm run generate [jsonPath] [outPath]
   jsonPath 缺省为 data/sample.json
   outPath  缺省为 output/result.stl
*/
const [, , jsonArg, outArg] = process.argv
const jsonPath = jsonArg ?? 'data/sample.json'
const outPath  = outArg  ?? 'output/result.stl'

const absJson = path.resolve(jsonPath)
const absOut  = path.resolve(outPath)

generateStl(absJson, absOut)
    .then(() => console.log('STL 生成完成:', absOut))
    .catch(e => console.error(' STL生成失败:', e))
