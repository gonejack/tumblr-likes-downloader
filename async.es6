function async(gen) {
	return function () {
		let it = gen.apply(this, arguments);

		function dispatch(ret) {
			// generator iterator
			if (ret && ret.constructor === (function*() {})().constructor) {
				return handler(ret.next(), ret);
			}
			// normal value
			else {
				return Promise.resolve(ret);
			}
		}

		function handler({done, value}, it) {
			if (done) {
				return dispatch(value);
			}
			else {
				let ok = function (ret) {
					return handler(it.next(ret), it);
				};

				let err = function (err) {
					return handler(it.throw(err), it);
				};

				return dispatch(value).then(ok, err);
			}
		}

		try {
			return handler(it.next(), it);
		}
		catch (ex) {
			return Promise.reject(ex);
		}
	}
}

module.exports = async;