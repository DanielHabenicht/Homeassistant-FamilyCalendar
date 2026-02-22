import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import replace from '@rollup/plugin-replace';
import postcss from 'rollup-plugin-postcss';
import serve from 'rollup-plugin-serve';

process.env.SASS_SILENCE_DEPRECATIONS = 'legacy-js-api';
const isDevServer = process.env.ROLLUP_DEV_SERVER === 'true';

export default {
  input: 'src/familycalendar-card.ts',
  output: {
    file: 'dist/familycalendar-card.js',
    format: 'es',
    sourcemap: true,
  },
  plugins: [
    replace({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
      preventAssignment: true,
    }),
    resolve({
      browser: true,
      preferBuiltins: false,
    }),
    commonjs(),
    postcss({
      extensions: ['.scss', '.css'],
      use: [['sass', { api: 'modern' }]],
      inject: false,
      extract: false,
      minimize: true,
    }),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: false,
      declarationMap: false,
    }),
    isDevServer &&
      serve({
        contentBase: ['dist'],
        host: '0.0.0.0',
        port: 4000,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
      }),
  ],
};
