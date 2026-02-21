import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import replace from '@rollup/plugin-replace';
import postcss from 'rollup-plugin-postcss';

process.env.SASS_SILENCE_DEPRECATIONS = 'legacy-js-api';
export default {
  input: 'src/calendar-card.ts',
  output: {
    file: 'dist/calendar-card.js',
    format: 'es',
    sourcemap: 'inline',
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
  ],
};
