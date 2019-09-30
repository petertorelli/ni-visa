
/**
 * Simple non-blocking delay for N seconds.
 */
async function pause (seconds) {
	return new Promise((resolve, reject) => {
		setTimeout(resolve, seconds * 1000);
	});
}

module.exports = pause;