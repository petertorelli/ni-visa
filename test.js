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
		//for (let i=0, j=0; i<data.length-4; i+=4, j+=actualPeriodS) {
		for (let i=0, j=0; i<40; i+=4, j+=actualPeriodS) {
			console.log(i, j, data.readUInt32BE(i).toString(16));
			energy += (actualVolts * data.readFloatBE(i)) * actualPeriodS;
		}
		console.log(data.length);
		console.log((energy * 1e6).toPrecision(3), (data.length / 4 * actualPeriodS).toPrecision(3));
	} catch (error) {
		console.error(error.stack);
	}
}
/*
0 0 '35211000'
4 0.00002048 '3442c000'
8 0.00004096 '34b6c000'
12 0.00006144000000000001 '351af000'
16 0.00008192 '35060000'
20 0.0001024 'b407c000'
24 0.00012288 '337b0000'
28 0.00014335999999999998 '351cb000'
32 0.00016383999999999998 '34a1e000'
36 0.00018431999999999997 '34eb0000'
*/
async function main2_p () {
	try {
		let ks = new n6705b();
		ks.init();
		[actualVolts, actualPeriodS] = await ks.setup_p(3.0, 1/20e-6);
		/*
		actualTimeS = await ks.timeAcquire_p(sampleTime);
		ks.selfTrigger();
		await pause(11);
		ks.off();
		*/
		await pause(1);
		let data = ks.downloadData2();
	} catch (error) {
		console.error(error.stack);
	}
}

// 12   sec @ 1 khz = 300   ms
//  3.0 sec @ 1 khz = 102   ms
//  1.5 sec @ 1 khz =  66.6 ms
main2_p();
