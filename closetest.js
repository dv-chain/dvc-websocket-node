import { DVOTC }  from './lib.js';
import uuid from 'uuid';
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs';

let configPath = path.join(process.cwd(), 'config')
let configFile = configPath + '/.env';

if (fs.existsSync(configFile)) {
    console.log('Using .env file from config folder', configFile)
    dotenv.config({ path: configFile })
} 

let WS_URL = process.env['WS_URL'];
let API_KEY = process.env['API_KEY'];
let API_SECRET = process.env['API_SECRET'];

if(!WS_URL || !API_KEY || !API_SECRET) {
    console.warn("Could not load API_KEY, API_SECRET or WS_URL. Use .env file in the config directory or pass them as environment variables")
    process.exit(1);
}

let subscriptions = [];

function pricesCallback(symbol, levels) {
    // console.log(symbol, levels);
}

async function start() {
    var dvotc = new DVOTC({
        url : WS_URL,
        key : API_KEY,
        secret: API_SECRET,
    });

    dvotc.sessionCreated();
    dvotc.subscribeLevels('BTC/USD')
}
