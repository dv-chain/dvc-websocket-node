import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import pkg from './package.json';
import nodePolyfills from 'rollup-plugin-node-polyfills';

var dist = `dist`;
export default  [
	// browser-friendly UMD build
	// {
	// 	input: './lib.js',
	// 	output: {
	// 		name: 'DVOTC',
	// 		file: pkg.browser,
    //         format: 'umd',
    //         globals: {
    //             "ws" : 'Websocket',
    //             "simple-pubsub" : 'SimplePubSub'
    //         }
	// 	},
	// 	plugins: [
    //         nodePolyfills(),
	// 		resolve(), // so Rollup can find `ms`
	// 		commonjs() // so Rollup can convert `ms` to an ES module
	// 	]
	// },

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