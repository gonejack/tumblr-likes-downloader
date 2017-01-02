const fs = require('fs');
const md5 = require('md5-file');
const trash = require('trash');

class RmDup {
    constructor() {
        this.dir = './likes';
        this.queue = [];
        this.removed = [];
        this.count = 0;
        this.running = 0;
        this.map = {};
    }
    log() {
        console.log(`Processed: ${this.count}`);
        console.log(`Removed: ${this.removed.length}`);
    }
    proc(f) {
        this.count++;
        this.running++;

        md5(f, (err, hash) => {
            this.running--;

            if (err) {
                throw err;
            }
            else {
                if (this.map[hash]) {
                    this.rmFile(f);
                }
                else {
                    this.map[hash] = true;
                }

                if (!this.running) {
                    this.log();
                }
            }
        });
    }
    rmFile(f) {
        this.removed.push(f);

        console.log('removed ', f);

        trash([f]);
    }
    enQueue(files) {
        this.queue = this.queue.concat(files);
    }
    deQueue() {
        this.queue.forEach(this.proc.bind(this));
    }
    start() {
        let files = fs.readdirSync(this.dir).map(n => this.dir + '/' + n);

        this.enQueue(files);

        this.deQueue();
    }
}

new RmDup().start();