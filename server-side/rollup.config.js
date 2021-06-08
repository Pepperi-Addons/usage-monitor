import typescript from 'rollup-plugin-typescript2';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import config from '../addon.config.json'
import json from '@rollup/plugin-json'

export default config.Endpoints.map(endpoint => {
    return {
        input: endpoint,
        output: [
         {
          dir: '../publish/',
          format: 'cjs'
         }
        ],
        external: [
        ],
        plugins: [
         typescript({
             tsconfigOverride: {
                 compilerOptions: {
                     module: "es2015",
                     declaration: false
                 }
             }
          }),
          resolve(),
          commonjs(),
          json()
        ]
       }
    }
 );