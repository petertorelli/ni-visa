/**
 * Copyright (C) Peter Torelli
 *
 * Licensed under Apache 2.0
 * 
 * Interface implementation for Keysight N6705B
 */

/**
 * TODO List:
 *
 * TODO: How do we turn off the emon after sampling automatically?
 * TODO: Should there be checks to prevent triggering if init() hasn't been
 *       called? (e.g., this.ready)
 * TODO: SCPI error-handling is dodgy: rather than send a RESP, I have to check
 *       the panel of the Keysight for an error. Really?
 */

const
	visa = require('./ni-visa.js'),
	vcon = require('./ni-visa-constants.js'),
	pause = require('./pause.js'),
	debug = require('debug')('emon'),
	util = require('util')

const MIN_PERIOD_S = 20e-6;
const DEFAULT_LOG_FILE = 'internal:\\data1.dlog';

function KeysightN6705B () {
	this.inst;
	this.n6781;
	this.n6731;
	this.periodS;
	this.voltageV;
}

/**
 * Searches for the 6781 and 6731, assigning them to there respective member
 * values.
 */
KeysightN6705B.prototype.init = function () {
	debug('init');
	let sesn;
	let vi;
	let resp;
	let status;

	// Clean up if re-init
	if (this.inst) {
		visa.viClose(this.inst);
		this.inst = undefined;
	}
	this.n6731 = undefined;
	this.n6781 = undefined;
	this.periodS = undefined;
	this.voltageV = undefined;

	// Find the N6705B
	[status, sesn] = visa.viOpenDefaultRM();
	visa.vhListResources(sesn).some(address => {
		[status, vi] = visa.viOpen(sesn, address);
		resp = visa.vhQuery(vi, '*IDN?');
		debug("Address " + address + " -> " + resp.trim());
		if (resp.match(/N6705B/)) {
			this.inst = vi;
			debug(`Using the first N6705B found at ${address}`);
			return true;
		}
		visa.viClose(vi);
		return false;
	});
	if (!this.inst) {
		throw new Error('No device found');
	}
	// note: vi is still open past this point
	let numChannels = parseInt(visa.vhQuery(this.inst, 'SYST:CHAN?'));
	let chann = [...Array(numChannels).keys()].map(i => i + 1).join(", ");
	resp = visa.vhQuery(this.inst, `SYST:CHAN:MOD? (@${chann})`);
	let modules = resp.trim().split(/[,\s]+/);
	modules.forEach((x, i) => {
		if (x.match(/n6781/i)) {
			this.n6781 = i + 1;
		} else if (x.match(/n6731/i)) {
			this.n6731 = i + 1;
		}
	});

	if (!this.n6781 || !this.n6731) {
		throw new Error('Need both 6781 and 6731');
	}
	debug(`N6781 is device #${this.n6781}`);
	debug(`N6731 is device #${this.n6731}`);
}

/**
 * Sets the voltage and sampling frequency from the user, as well as some 
 * safety parameters and sampling options specific to EEMBC.
 */
KeysightN6705B.prototype.setup_p = async function (voltageV=3.0, rateHz=1000) {
	debug('setup_p');
	let resp; // used for reads, queries
	// Reset; Clear status
	visa.viWrite(this.inst, '*RST;*CLS');
	// Turn off both outputs
	visa.viWrite(this.inst, 'OUTP OFF,(@1,2)');
	// TODO: Recommended by Steve Allen
	await pause(3);
	// Configure N6781 to two-quadrant bipolar supply
	visa.viWrite(this.inst, `EMUL PS2Q,(@${this.n6781})`);
	// Specify voltage priotity mode
	visa.viWrite(this.inst, `FUNC VOLT,(@${this.n6781})`);
	// Set voltage and current limit
	visa.viWrite(this.inst, `VOLT:LEV ${voltageV} ,(@1,2)`);
	// TODO: Why does the 6781 get a limit but the 6731 get a level?
	visa.viWrite(this.inst, `CURR:LIM 0.2,(@${this.n6781})`);
	visa.viWrite(this.inst, `CURR:LEV 0.5,(@${this.n6731})`);
	// Overvoltage protection on 6781 (TODO why not 6731?)
	visa.viWrite(this.inst, `VOLT:PROT:REM 3.3,(@${this.n6781})`);
	// TODO: Recommended by Steve Allen
	await pause(1);
	// Fire it up, yo.
	visa.viWrite(this.inst, 'OUTP ON,(@1,2)');
	// Setup_p datalogger
	// Why just current? We need Voltage And CUrrent , can't assume TODO
	visa.viWrite(this.inst, 'SENS:DLOG:FUNC:CURR ON ,(@1)');
	visa.viWrite(this.inst, 'SENS:DLOG:FUNC:VOLT OFF,(@1)');
	visa.viWrite(this.inst, 'SENS:DLOG:FUNC:CURR OFF,(@2)');
	visa.viWrite(this.inst, 'SENS:DLOG:FUNC:VOLT OFF,(@2)');
	// Autoranging
	visa.viWrite(this.inst, "SENS:DLOG:CURR:RANG:AUTO ON,(@1)");
	visa.viWrite(this.inst, "SENS:DLOG:VOLT:RANG:AUTO ON,(@1)");
	// Sample time (query back to get the 'real' time)
	let periodS = 1 / rateHz;
	if (periodS < MIN_PERIOD_S) {
		throw new Error(`Requested sample period ${periodS} is below the min of ${MIN_PERIOD_S}`);
	}
	periodS = periodS.toFixed(5);
	visa.viWrite(this.inst, `SENS:DLOG:PER ${periodS}`);
	// TODO why is the sample time not what we asked for?
	resp = visa.vhQuery(this.inst, 'SENS:DLOG:PER?')
	this.periodS = parseFloat(resp);
	let ratio;
	ratio = ((this.periodS / periodS - 1) * 100).toPrecision(3);
	debug(`Requested period ${periodS}s, actual period ${this.periodS}s ${ratio}%`);
	// TODO: Recommended by Steve Allen
	await pause(0.5);
	resp = visa.vhQuery(this.inst, 'VOLT:LEV? (@1)');
	this.voltageV = parseFloat(resp);
	ratio = ((this.voltageV / voltageV - 1) * 100).toPrecision(3);
	debug(`Requested voltage ${voltageV}V, actual voltage ${this.voltageV}V ${ratio}%`);
	return [ this.voltageV, this.periodS ]
}

/**
 * Sets up the triggering and acquisition time.
 */
KeysightN6705B.prototype.timeAcquire_p = async function (timeS=10) {
	debug('timeAcquire_p');
	// TODO This needs to be EXTernal for the BNC backpanel input
	visa.viWrite(this.inst, 'TRIG:DLOG:SOUR BUS');
	visa.viWrite(this.inst, `SENS:DLOG:TIME ${timeS}`);
	resp = visa.vhQuery(this.inst, 'SENS:DLOG:TIME?')
	let actualTimeS = parseFloat(resp);
	// TODO How do we tell if we run out of disk space?
	visa.viWrite(this.inst, 'INIT:DLOG "internal:\\data1.dlog"')
	return actualTimeS;
}

KeysightN6705B.prototype.selfTrigger = function () {
	visa.viWrite(this.inst, '*TRG');
}

KeysightN6705B.prototype.downloadData = function () {
	debug('downloadData');
	let resp;
	let status;
	this.off();
	resp = visa.vhQuery(this.inst, 'MMEM:ATTR? "internal:\\data1.dlog", "FileSize"');
	// TODO: Odd, why suddenly are there quotes in the response?
	resp = resp.replace(/"/g, '');
	let bytes = parseInt(resp);
	debug(`File ${DEFAULT_LOG_FILE} size is ${bytes} bytes`);
	let buffer = Buffer.alloc(0);
	visa.viWrite(this.inst, `MMEM:DATA:DEF? "${DEFAULT_LOG_FILE}"`)
	// TODO: Load the ENTIRE file into memory could be a bad idea in the future
	const start = process.hrtime();
	do {
		[status, resp] = visa.viReadRaw(this.inst, 512);
		buffer = Buffer.concat([buffer, resp], buffer.length + resp.length)
		if (status & vcon.VI_ERROR) {
			throw new Error("Error reading dlog file", status.toString(16));
		}
	} while (status && !(status & vcon.VI_ERROR));
	const diff = process.hrtime(start);
	const sec = diff[1] / 1e9 + diff[0];
	const tpt = (buffer.length / 1024) / sec;
	debug('bytes read  ', buffer.length);
	debug('FileSize?   ', bytes);
	debug('speed       ', tpt.toPrecision(3), 'KB/s');
	// Fast-forward past the header
	let offset = buffer.indexOf('</dlog>\n') + '</dlog>\n'.length;
	if (offset === 0) {
		throw new Error('Failed to find start of binary data');
	}
	// The 8 bytes after the header are also not needed
	debug('1st dword   ', buffer.readUInt32BE(offset).toString(16));
	debug('2nd dword   ', buffer.readUInt32BE(offset + 4).toString(16));
	offset += 8;
	debug('Offset      ', offset, 'B');
	// BUGBUG: Often more bytes are sent back than there are in the file, why?
	return buffer.slice(offset,  buffer.length);
}

KeysightN6705B.prototype.downloadData2 = function () {
	debug('downloadData');
	let resp;
	let status;
	this.off();
	resp = visa.vhQuery(this.inst, 'MMEM:ATTR? "internal:\\data1.dlog", "FileSize"');
	// TODO: Odd, why suddenly are there quotes in the response?
	resp = resp.replace(/"/g, '');
	let bytes = parseInt(resp);
	debug(`File ${DEFAULT_LOG_FILE} size is ${bytes} bytes`);
	let buffer = Buffer.alloc(0);
	visa.viWrite(this.inst, `MMEM:DATA:DEF? "${DEFAULT_LOG_FILE}"`)
	// TODO: Load the ENTIRE file into memory could be a bad idea in the future
	const start = process.hrtime();
	let retCount;
	[status, retCount] = visa.viReadToFile(this.inst, "test.blarg", bytes);
}

KeysightN6705B.prototype.off = function () {
	debug('off');
	visa.viWrite(this.inst, 'OUTP OFF,(@1,2)');
}

KeysightN6705B.prototype.close = function () {
	debug('close');
	this.off();
	visa.viClose(this.inst);
	this.inst = undefined;
}

module.exports = KeysightN6705B;
