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
	pause = require('./pause.js'),
	sprintf = require('sprintf-js').sprintf

let status;
let sesn;

[status, sesn] = visa.viOpenDefaultRM();
console.log("testing resource scan");
visa.vhListResources(sesn).forEach(address => {
	console.log(address)
	try {
	[status, vi] = visa.viOpen(sesn, address);
	resp = visa.vhQuery(vi, '*IDN?');
	console.log(resp.trim(), address);
	visa.viClose(vi);
	} catch (err) {
	}
});

console.log("testing parse resource");
let x, y;
let name = 'USB0::0x16D0::0x0E88::000722::RAW';
[status, x, y] = visa.viParseRsrc(sesn, name);
console.log(status, vcon.decodeStatus(status), x, y);

let a, b, c;
[status, x, y] = visa.viParseRsrcEx(sesn, 'USB0::0x0957::0x0F07::MY53004564::INSTR');
console.log(status, vcon.decodeStatus(status), x, y, a, b, c);
