class Queue {
	constructor(act, win) {
		this.act = act;
		this.win = win || 1; // execute window
		this.queue = [];
		this.prom = null;
	}

	fire() {
		while (this.win && this.queue.length) {
			this.shoot(this.shift());
		}
	}
	shoot(pack) {
		this.win -= 1;

		this.act(pack.data).then(ret => {
			this.proceed(pack.resolve, ret);
		}, err => {
			this.proceed(pack.reject, err);
		});
	}
	proceed(cb, ret) {
		this.eject(cb, ret);

		this.fire();
	}
	eject(cb, ret) {
		return cb(ret), this.win += 1;
	}

	push(data, resolve, reject) {
		return this.queue.push({data, resolve, reject});
	}
	shift() {
		return this.queue.shift();
	}

	promise(data) {
		return this.prom = new Promise((ok, err) => this.push(data, ok, err));
	}
	promiseArr(arr) {
		return this.prom = Promise.all(arr.map(data => this.promise(data)));
	}

	enQueue(data) {
		this.promise(data);
		this.fire();

		return this.prom;
	}
	enQueueAll(arr) {
		this.promiseArr(arr);
		this.fire();

		return this.prom;
	}
}

module.exports = Queue;