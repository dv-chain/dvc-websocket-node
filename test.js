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

    await dvotc.sessionCreated();

    // await dvotc.getUserInfo();
    // await dvotc.getUserLimits();

    let symbols = await dvotc.getAvailableSymbols();

    symbols.forEach(symbol => {
        let unsubToken = dvotc.subscribeLevels(symbol, pricesCallback);    
        subscriptions.push(unsubToken);
    });

    setInterval(async ()=> {
        console.log("Sending order");
        try {
            let result = await dvotc.placeOrder({ 
                "quoteId": uuid.v4(), // not required for limit orders, this should be the actuall quote id received, just sending uuid for sample to make it fail
                "orderType" : "market", //quote id is mandatory for order type market
                "side": "Sell",
                "qty": 1,
                "price": 55527.51,
                "asset": "XRP", 
                "clientTag" : "c54aca46-d166-4a98-bdc3-b3169cbba622",
                "counterAsset": "USD"
            });
            console.log("result ", result);
        } catch(err) {
            console.log("Failed to palce order");
            console.error(err);
        }

    }, 5000);

    try {
        let result = await dvotc.cancelOrder(uuid.v4()) //send actual orderid instead of uuid.v4()
        console.log(result);
    }catch(err) {
        console.error(err);
    }
    
}
start();