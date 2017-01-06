class Queue {
	constructor(act, win) {
		this.act = act;
		this.jobs = {};

		this.win = win || 1; // execute window
		this.last = 0; // last
		this.next = 0; // candidate

		this.running = false;
		this.prom = null;
	}
	enQueue(data, resolve, reject) {
		return this.jobs[this.last++] = {data, resolve, reject};
	}
	deQueue() {
		if (this.next < this.last) {
			while (this.win && this.next < this.last) {
				this.fire(this.next++);

				this.win -= 1;
			}

			this.running = true;
		}
		else {
			this.running = false;
		}
	}
	fire(num) {
		this.act(this.jobs[num].data).then(ret => {
			this.resolve(num, ret);
		}, err => {
			this.reject(num, err);
		});
	}
	resolve(num, ret) {
		this.jobs[num].resolve(ret);

		this.erase(num);
		this.deQueue();
	}
	reject(num, err) {
		this.jobs[num].reject(err);

		this.erase(num);
		this.deQueue();
	}
	erase(num) {
		delete this.jobs[num];

		this.win += 1;
	}
	promise(data) {
		return this.prom = new Promise((ok, err) => { this.enQueue(data, ok, err) });
	}
	promiseArr(arr) {
		this.prom = Promise.all(arr.map(data => this.promise(data)));
	}
	prepare() {
		if (this.running) {
			// should not reset
		}
		else {
			this.last = 0;
			this.next = 0;
			this.jobs = {};
		}
	}
	exec(data) {
		this.prepare();
		this.promise(data);
		this.deQueue();

		return this.prom;
	}
	execAll(arr) {
		this.prepare();
		this.promiseArr(arr);
		this.deQueue();

		return this.prom;
	}
}

module.exports = Queue;