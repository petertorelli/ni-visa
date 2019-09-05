let visa = require('./ni-visa.js');

function KeysightN6705B () {
	this.inst = undefined;
	this.n6781;
	this.n6731;
}

KeysightN6705B.prototype.init = function () {
	let sesn;
	let vi;
	let resp;
	let status;
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

let ks = new KeysightN6705B();
ks.init();