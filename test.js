/**
 * Copyright (C) Peter Torelli
 *
 * Licensed under Apache 2.0
 * 
 * Just a test area.
 */

 let
	visa = require('./ni-visa.js'),
	vcon = require('./ni-visa-constants.js'),
	n6705b = require('./n6705b.js'),
	pause = require('./pause.js')

let sampleTime = 6;
async function main_p () {
	try {
		let ks = new n6705b();
		ks.init();
		[actualVolts, actualPeriodS] = await ks.setup_p(3.0, 1/20e-6);
		actualTimeS = await ks.timeAcquire_p(sampleTime);
		ks.selfTrigger();
		await pause(11);
		ks.off();
		await pause(1);
		let data = ks.downloadData();
		console.log('Total bytes sampled', data.length);
		console.log('Total samples', data.length / 4);
		ks.close();
		console.log(`Voltage ${actualVolts} V, Period ${actualPeriodS * 1e6} usec.`);
		let energy = 0;
		// why always 1 byte off
		for (let i=0, j=0; i<data.length-4; i+=4, j+=actualPeriodS) {
			//console.log(i, j, data.readFloatBE(i));
			energy += (actualVolts * data.readFloatBE(i)) * actualPeriodS;
		}
		console.log(data.length);
		console.log((energy * 1e6).toPrecision(3), (data.length / 4 * actualPeriodS).toPrecision(3));
	} catch (error) {
		console.error(error.stack);
	}
}

// 12   sec @ 1 khz = 300   ms
//  3.0 sec @ 1 khz = 102   ms
//  1.5 sec @ 1 khz =  66.6 ms
main_p();
