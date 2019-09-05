/*

TODO:

- Error handling. How we gonna do this? Return a status or just throw?

*/

const
	ffi = require('ffi'),
	ref = require('ref'),
	os = require('os');

/**
 * Create types like the ones in "visatype.h" from National Instruments
 */
const ViInt32 = ref.types.int32;
const ViPInt32 = ref.refType(ViInt32);
const ViUInt32 = ref.types.uint32;
const ViPUInt32 = ref.refType(ViUInt32);
const ViChar = ref.types.char;
const ViPChar = ref.refType(ViChar);
const ViByte = ref.types.uchar;
const ViPByte = ref.refType(ViByte);
const ViStatus = ViInt32;
const ViObject = ViUInt32;
const ViSession = ViUInt32;
const ViPSession = ref.refType(ViSession);
const ViString = ViPChar;
const ViConstString = ViString;
const ViRsrc = ViString;
const ViConstRsrc = ViConstString;
const ViAccessMode = ViUInt32;
const ViBuf = ViPByte;
const ViPBuf = ViPByte;
const ViConstBuf = ViPByte;
const ViFindList = ViObject;
const ViPFindList = ref.refType(ViFindList);

// Choose the proper DLL name
let dllName;
// I didn't see Linux support on the NI website...
switch (os.platform()) {
	case 'darwin':
		dllName = 'visa.framework/visa';
		break;
	case 'win32':
		dllName = os.arch() == 'x64' ? 'visa64.dll' : 'visa32.dll';
		break;
	default: 
		throw new Exception('Unknown platform: ' + os.platform());
}

const prototypes = {
	// Resource Manager Functions and Operations
	'viOpenDefaultRM': [ViStatus, [ViPSession]],
	'viFindRsrc': [ViStatus, [ViSession, 'string', ViPFindList, ViPUInt32, 'string']],
	'viFindNext': [ViStatus, [ViFindList, 'string']],
	'viOpen': [ViStatus, [ViSession, 'string', ViAccessMode, ViUInt32, ViPSession]],
	// Resource Template Operations
	'viClose': [ViStatus, [ViObject]],
	/// Basic I/O Operations
	'viRead': [ViStatus, [ViSession, ViPBuf, ViUInt32, ViPUInt32]],
	'viWrite': [ViStatus, [ViSession, 'string', ViUInt32, ViPUInt32]],
};

// 'string' is used to reduce code, the FFI lib will create Buffers as needed
const libVisa = ffi.Library(dllName, prototypes);

function errorHandler (status) {
	console.log('Warning: VISA Error: 0x' + (status >>> 0).toString(16).toUpperCase());
	throw new Error();
}

function viOpenDefaultRM () {
	let status;
	let pSesn = ref.alloc(ViSession);
	status = libVisa.viOpenDefaultRM(pSesn);
	if (status) {
		errorHandler(status);
	}
	return [status, pSesn.deref()];
}

function viFindRsrc (sesn, expr) {
	let status;
	let pFindList = ref.alloc(ViFindList);
	let pRetcnt = ref.alloc(ViUInt32);
	let instrDesc = Buffer.alloc(512);
	status = libVisa.viFindRsrc(sesn, expr, pFindList, pRetcnt, instrDesc);
	if (status) {
		errorHandler(status);
	}
	return [
		status,
		pFindList.deref(),
		pRetcnt.deref(),
		// Fake null-term string
		instrDesc.toString('ascii', 0, instrDesc.indexOf(0))
	];
}

function viFindNext (findList) {
	let status;
	let instrDesc = Buffer.alloc(512);
	status = libVisa.viFindNext(findList, instrDesc);
	if (status) {
		errorHandler(status);
	}
	return [
		status,
		// Fake null-term string
		instrDesc.toString('ascii', 0, instrDesc.indexOf(0))
	];
}

function viOpen (sesn, rsrcName, accessMode=0, openTimeout=2000) {
	let status;
	let pVi = ref.alloc(ViSession);
	status = libVisa.viOpen(sesn, rsrcName, accessMode, openTimeout, pVi);
	if (status) {
		errorHandler(status);
	}
	return [status, pVi.deref()];
}

function viClose (vi) {
	let status;
	status = libVisa.viClose(vi);
	if (status) {
		errorHandler(status);
	}
	return status;
}

// TODO ... assuming viRead always returns a string, probably wrong
function viRead (vi, count=512) {
	let status;
	let buf = Buffer.alloc(count);
	let pRetCount = ref.alloc(ViUInt32);
	status = libVisa.viRead(vi, buf, buf.length, pRetCount)
	if (status) {
		errorHandler(status);
	}
	return [status, ref.reinterpret(buf, pRetCount.deref(), 0).toString()];
}

function viWrite (vi, buf) {
	let status;
	let pRetCount = ref.alloc(ViUInt32);
	status = libVisa.viWrite(vi, buf, buf.length, pRetCount)
	if (status) {
		errorHandler(status);
	}
	return [status, pRetCount.deref()];
}

/**
 * These helper functions combine vi* functions to perform routine tasks.
 * Error handling is left to the vi* functions.
 */

function vhListResources (sesn) {
	let descList = [];
	let [status, findList, retcnt, instrDesc] = viFindRsrc(sesn, '?*');
	if (retcnt) {
		descList.push(instrDesc);
		for (let i = 1; i < retcnt; ++i) {
			[status, instrDesc] = viFindNext(findList);
			descList.push(instrDesc);
		}
	}
	return descList;
}

function vhQuery (vi, query) {
	viWrite(vi, query);
	return viRead(vi)[1];
}

module.exports = {
	// Resource Manager Functions and Operations
	viOpenDefaultRM,
	viFindRsrc,
	viFindNext,
	viOpen,
	// Resource Template Operations
	viClose,
	/// Basic I/O Operations
	viRead,
	viWrite,
	// Helper functions
	vhListResources,
	vhQuery,
}
