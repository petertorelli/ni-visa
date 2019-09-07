let
	visa = require('./ni-visa.js'),
	debug = require('debug')('main')

const MIN_SAMPLE_TIME_S = 20e-6;

function KeysightN6705B () {
	this.inst;
	this.n6781;
	this.n6731;
	this.periodS;
	this.voltageV;
}

async function pauseS_p (seconds) {
	debug(`pause: ${seconds}s`);
	return new Promise((resolve, reject) => {
		setTimeout(resolve, seconds * 1000);
	});
}

KeysightN6705B.prototype.init = function () {
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

	[status, sesn] = visa.viOpenDefaultRM();
	visa.vhListResources(sesn).some(address => {
		[status, vi] = visa.viOpen(sesn, address);
		resp = visa.vhQuery(vi, '*IDN?');
		console.log("address " + address + " -> " + resp);
		if (resp.match(/N6705B/)) {
			this.inst = vi;
			console.log(`Found N6705B at ${address} -> ${resp}`);
			return true;
		}
		visa.viClose(vi);
		return false;
	});
	if (!this.inst) {
		throw new Error('No device found');
	}
	// note: vi is still open
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
	console.log(`N6781 is device #${this.n6781}`);
	console.log(`N6731 is device #${this.n6731}`);

}

KeysightN6705B.prototype.setup_p = async function (volts=3.0, samplingHz=1000) {
	let resp; // used for reads, queries
	// Reset; Clear status
	visa.viWrite(this.inst, '*RST;*CLS');
	// Turn off both outputs
	visa.viWrite(this.inst, 'OUTP OFF,(@1,2)');
	// TODO: Recommended by Steve Allen
	await pauseS_p(3);
	// Configure N6781 to two-quadrant bipolar supply
	visa.viWrite(this.inst, `EMUL PS2Q,(@${this.n6781})`);
	// Specify voltage priotity mode
	visa.viWrite(this.inst, `FUNC VOLT,(@${this.n6781})`);
	// Set voltage and current limit
	visa.viWrite(this.inst, `VOLT:LEV ${volts} ,(@1,2)`);
	// TODO: Why does the 6781 get a limit but the 6731 get a level?
	visa.viWrite(this.inst, `CURR:LIM 0.2,(@${this.n6781})`);
	visa.viWrite(this.inst, `CURR:LEV 0.5,(@${this.n6731})`);
	// Overvoltage protection on 6781 (TODO why not 6731?)
	visa.viWrite(this.inst, `VOLT:PROT:REM 3.3,(@${this.n6781})`);
	// TODO: Recommended by Steve Allen
	await pauseS_p(1);
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
	let periodS = 1 / samplingHz;
	periodS = Math.max(MIN_SAMPLE_TIME_S, periodS).toFixed(5);
	visa.viWrite(this.inst, 'SENS:DLOG:FUNC:VOLT OFF,(@2)');
	visa.viWrite(this.inst, `SENS:DLOG:PER ${periodS}`);
	// TODO why is the sample time not what we asked for?
	resp = visa.vhQuery(this.inst, 'SENS:DLOG:PER?')
	this.periodS = parseFloat(resp);
	// TODO: Recommended by Steve Allen
	await pauseS_p(0.5);
	resp = visa.vhQuery(this.inst, 'VOLT:LEV? (@1)');
	this.voltageV = parseFloat(resp);
}

KeysightN6705B.prototype.timeAcquire_p = async function (timeS=10.0) {
	// TODO this needs to be EXTernal for the BNC backpanel input
	visa.viWrite(this.inst, 'TRIG:DLOG:SOUR BUS');
	visa.viWrite(this.inst, `SENS:DLOG:TIME ${timeS}`);
	// TODO: Recommended by Steve Allen
	await pauseS_p(0.5);
	// TODO: How do we tell if we run out of disk space?
	visa.viWrite(this.inst, 'INIT:DLOG "internal:\\data1.dlog"')
	// TODO: Recommended by Steve Allen
	await pauseS_p(0.5);
}

KeysightN6705B.prototype.selfTrigger = function () {
	visa.viWrite(this.inst, '*TRG');
}

KeysightN6705B.prototype.downloadData = function () {
	let resp;
	resp = visa.vhQuery(this.inst, 'MMEM:ATTR? "internal:\\data1.dlog", "FileSize"');
	// TODO: Odd, why suddenly are there quotes in the response?
	resp = resp.replace(/"/g, '');
	let bytes = parseInt(resp);
	console.log(`File size is ${bytes}`);
	visa.viWrite(this.inst, 'MMEM:DATA? "internal:\\data1.dlog"')
	let status;
	do {
		[status, resp] = visa.viRead(this.inst);
		console.log("Chunk");
		console.log(resp);
	} while (status && !(status & visa.VI_ERROR));
}

async function main_p () {
	try {
		let ks = new KeysightN6705B();
		ks.init();
		await ks.setup_p(2.37546);
		await ks.timeAcquire_p(1.5);
		ks.selfTrigger();
		await pauseS_p(3.2);
		ks.downloadData();
	} catch (error) {
		console.error(error.stack);
	}
}

main_p();
