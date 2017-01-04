'use strict';

class Queue {
	constructor(act, win) {
		this.act = act;
		this.win = win || 1;
		this.cur = 0;
		this.running = false;
		this.jobs = {};

        this.nums = [];
	}
	arrange() {
		let num;

		do {
			num = 'k' + Math.random().toString(36).substr(-6);
		}
		while (this.nums.indexOf(num) > -1);

        this.nums.push(num);

		return num;
	}
	prepare(num, data) {
		let job = {
			data: data,
			resolve: null,
			reject: null,
		};

		return this.jobs[num] = job;
	}
	load() {
		let nums = this.nums;

		if (nums.length) {
			do {
                this.exec(nums.shift());

				this.cur += 1;
			}
			while (this.cur < this.win && nums.length);
		}

		this.running = !!this.cur;
	}
	feed() {
		this.cur -= 1;

		this.load();
	}
	exec(num) {
		this.act(this.jobs[num].data).then(res => {
			this.ok(num, res);
		}, err => {
			this.err(num, err);
		});
	}
	ok(num, res) {
		let job = this.jobs[num];

		try {
			job.resolve(res)
		}
		finally {
            this.sweep(num);
			this.feed()
		}
	}
	err(num, err) {
		let job = this.jobs[num];

		try {
			job.reject(err)
		}
		finally {
            this.sweep(num);
			this.feed();
		}
	}
	sweep(num) {
		delete this.jobs[num];
	}
	promise(data) {
		let job = this.prepare(this.arrange(), data);

		return new Promise((ok, err) => {
			job.resolve = ok;
			job.reject = err;
		});
	}
	one(data) {
		let promise = this.promise(data);

        this.running || this.load();

		return promise;
	}
	all(arr) {
		let promise = Promise.all(arr.map(this.promise.bind(this)));

        setTimeout(() => { this.running || this.load() }, 50);

		return promise;
	}
}

let act = (arg) => {
	return new Promise((ok, err) => {
		setTimeout(() => {ok(arg)}, Math.random() * 5000)
	})
};

new Queue(act, 5).all([1,2,3,4,5,6,7,8,9,10,12,23]);