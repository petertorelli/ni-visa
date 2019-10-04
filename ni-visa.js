/**
 * Copyright (C) Peter Torelli
 *
 * Licensed under Apache 2.0
 * 
 * Interface wrapper to the VISA dynamic library.
 */

/**
 * TODO List
 *
 * TODO: Error handling. Throw? Return status? How should we do this?
 */

const
	debug = require('debug')('ni-visa'),
	vcon = require('./ni-visa-constants.js'),
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
		throw new Error('Unknown platform: ' + os.platform());
}

// 'string' is used to reduce code, the FFI module will create Buffers as needed
const libVisa = ffi.Library(dllName, {
	// Resource Manager Functions and Operations
	'viOpenDefaultRM': [ViStatus, [ViPSession]],
	'viFindRsrc': [ViStatus, [ViSession, 'string', ViPFindList, ViPUInt32, 'string']],
	'viFindNext': [ViStatus, [ViFindList, 'string']],
	'viOpen': [ViStatus, [ViSession, 'string', ViAccessMode, ViUInt32, ViPSession]],
	// Resource Template Operations
	'viClose': [ViStatus, [ViObject]],
	// Basic I/O Operations
	'viRead': [ViStatus, [ViSession, ViPBuf, ViUInt32, ViPUInt32]],
	'viWrite': [ViStatus, [ViSession, 'string', ViUInt32, ViPUInt32]],
});

// TODO: since error handling is undecided, every function calls this
function statusCheck (status) {
	if (status & vcon.VI_ERROR) {
		console.log('Warning: VISA Error: 0x' + (status >>> 0).toString(16).toUpperCase());
		throw new Error();
	} else {
		if (status) {
			let str = vcon.decodeStatus(status);
			if (str != null) {
				debug(`non-error status check: ${status.toString(16)} ${str}`);
			} else {
				debug(`non-error status check: ${status.toString(16)}`);
			}
		}
	}
}

function viOpenDefaultRM () {
	let status;
	let pSesn = ref.alloc(ViSession);
	status = libVisa.viOpenDefaultRM(pSesn);
	statusCheck(status);
	return [status, pSesn.deref()];
}

function viFindRsrc (sesn, expr) {
	let status;
	let pFindList = ref.alloc(ViFindList);
	let pRetcnt = ref.alloc(ViUInt32);
	let instrDesc = Buffer.alloc(512);
	status = libVisa.viFindRsrc(sesn, expr, pFindList, pRetcnt, instrDesc);
	statusCheck(status);
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
	statusCheck(status);
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
	statusCheck(status);
	return [status, pVi.deref()];
}

function viClose (vi) {
	let status;
	status = libVisa.viClose(vi);
	statusCheck(status);
	return status;
}

// TODO ... assuming viRead always returns a string, probably wrong
function viRead (vi, count=512) {
	let status;
	let buf = Buffer.alloc(count);
	let pRetCount = ref.alloc(ViUInt32);
	status = libVisa.viRead(vi, buf, buf.length, pRetCount)
	statusCheck(status);
	debug(`read (${count}) -> ${pRetCount.deref()}`);
	return [status, ref.reinterpret(buf, pRetCount.deref(), 0).toString()];
}

// Returns the raw Buffer object rather than a decoded string
function viReadRaw (vi, count=512) {
	let status;
	let buf = Buffer.alloc(count);
	let pRetCount = ref.alloc(ViUInt32);
	status = libVisa.viRead(vi, buf, buf.length, pRetCount)
	statusCheck(status);
	debug(`readRaw: (${count}) -> ${pRetCount.deref()}`);
	return [status, buf.slice(0, pRetCount.deref())];
}

function viWrite (vi, buf) {
	debug('write:', buf);
	let status;
	let pRetCount = ref.alloc(ViUInt32);
	status = libVisa.viWrite(vi, buf, buf.length, pRetCount)
	statusCheck(status);
	if (pRetCount.deref() != buf.length) {
		throw new Error('viWrite length fail')
	}
	return [status, pRetCount.deref()];
}

/**
 * These helper functions combine vi* functions to perform routine tasks.
 * Error handling is left to the vi* functions.
 */

/**
 * Returns a list of strings of found resources
 */
function vhListResources (sesn, expr='?*') {
	let descList = [];
	let [status, findList, retcnt, instrDesc] = viFindRsrc(sesn, expr);
	if (retcnt) {
		descList.push(instrDesc);
		for (let i = 1; i < retcnt; ++i) {
			[status, instrDesc] = viFindNext(findList);
			descList.push(instrDesc);
		}
	}
	return descList;
}

/**
 * TODO: How are compound queries handled (reponsed to)
 * Returns only the response, no status; status handled by error handler
 */
function vhQuery (vi, query) {
	viWrite(vi, query);
	// TODO: return status as well?
	return viRead(vi)[1];
}

// TODO: create this from the FFI object rather than retyping
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
	viReadRaw,
	viWrite,
	// Helper functions
	vhListResources,
	vhQuery,
}
