import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import builtins from 'rollup-plugin-node-builtins';
import pkg from './package.json';

var dist = `dist`;
export default  [
	// browser-friendly UMD build
	{
		input: './lib.js',
		output: {
			name: 'DVOTC',
			file: pkg.browser,
			format: 'iife',
			globals: {
				"ws" : 'WebSocket',
				"crypto" : "crypto"
			},
		},
		external: ['ws'],
		plugins: [
			commonjs(), // so Rollup can convert `ms` to an ES module
			resolve({ preferBuiltins: false, browser: true }), // so Rollup can find `ms`
			builtins(),
		]
	},

	// CommonJS (for Node) and ES module (for bundlers) build.
	// (We could have three entries in the configuration array
	// instead of two, but it's quicker to generate multiple
	// builds from a single configuration where possible, using
	// an array for the `output` option, where we can specify
	// `file` and `format` for each target)
	{
		input: './lib.js',
        external: ['simple-pubsub', 'ws', 'crypto'],
        plugins: [
        ],
		output: [
			{ file: pkg.main, format: 'cjs' },
			{ file: pkg.module, format: 'es' }
		]
	}
];