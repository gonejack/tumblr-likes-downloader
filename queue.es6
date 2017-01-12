class Queue {
	constructor(act, win) {
		this.act = act;
		this.win = win || 1; // execute window
        this.queue = [];
        this.packs = {};
		this.prom = null;
	}

	fire(code) {
		this.act(this.packs[code].data).then(ret => {
			this.resolve(code, ret);
		}, err => {
			this.reject(code, err);
		});
	}
	resolve(code, ret) {
		this.packs[code].resolve(ret);

		this.erase(code);
		this.deQueue();
	}
	reject(code, err) {
		this.packs[code].reject(err);

		this.erase(code);
		this.deQueue();
	}
	erase(code) {
		delete this.packs[code];

		this.win += 1;
	}

	promise(data) {
		return this.prom = new Promise((ok, err) => this.enQueue(data, ok, err));
	}
	promiseArr(arr) {
		return this.prom = Promise.all(arr.map(data => this.promise(data)));
	}

	enQueue(data, resolve, reject) {
        let code = Symbol();

        this.queue.push(code);
        this.packs[code] = {data, resolve, reject};

        return code;
	}
	deQueue() {
		while (this.win && this.queue.length) {
            this.fire(this.queue.shift());

            this.win -= 1;
		}
	}

	exec(data) {
		this.promise(data);
		this.deQueue();

		return this.prom;
	}

	execAll(arr) {
		this.promiseArr(arr);
		this.deQueue();

		return this.prom;
	}
}

module.exports = Queue;