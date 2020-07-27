## dvotc-websocket-node

This is a sample implementation of the dvotc websocket using nodejs. This uses esm modules so make sure you have type module in your package.json

### Installation

```
npm install --save dvotc-websocket-node

```

### Usage

The below example uses `dotenv` package to load environment variables. However you can pass environment variables without dotenv and it will still work.

#### With .env

Create a config folder and update your credentials in a .env file.

```
WS_URL=wss://demo.dvchain.co/websocket
#WS_URL=wss://prod-deploy.dvchain.co/websocket
API_SECRET=7d753a3324325926618b0b505e318adc
API_KEY=5650bb2a-1ecc-44a6-b0f1-2181440d51ab
```

```javascript
import { DVOTC }  from 'dvotc-websocket-node';
import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv';
import * as uuid from 'uuid';

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
    try {
        var dvotc = new DVOTC({
            url : WS_URL,
            key : API_KEY,
            secret: API_SECRET,
        });

        await dvotc.sessionCreated();

        // let sessionUser = await dvotc.getUserInfo();
        // let userLimits = await dvotc.getUserLimits();
        let symbols = await dvotc.getAvailableSymbols();

        symbols.forEach(symbol => {
            let unsubToken = dvotc.subscribeLevels(symbol, pricesCallback);    
            subscriptions.push(unsubToken);
        });
    
        let order = await dvotc.placeOrder({ 
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

        let cancelStatus = await dvotc.cancelOrder(order._id);

    } catch(err) {
        console.log("Failed to palce order");
        console.error(err);
    }
}

start();
```